import type { ExtractionSettings, FrameItem, TrimSettings, VideoMetadata } from '../types/editor'

const ACCEPTED_EXTENSIONS = ['mp4', 'mov', 'avi', 'webm', 'mkv']

export function isSupportedVideo(file: File) {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  return ACCEPTED_EXTENSIONS.includes(extension)
}

export function readVideoMetadata(file: File, timeout = 12_000): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    const url = URL.createObjectURL(file)
    const cleanup = () => {
      clearTimeout(timer)
      URL.revokeObjectURL(url)
      video.removeAttribute('src')
      video.load()
    }
    const timer = window.setTimeout(() => {
      cleanup()
      reject(new Error('The browser could not read this video. It may require the FFmpeg decoder.'))
    }, timeout)
    video.preload = 'metadata'
    video.muted = true
    let resolved = false
    const finalize = (fps = 30) => {
      if (resolved) return
      resolved = true
      const duration = video.duration
      const metadata: VideoMetadata = {
        width: video.videoWidth,
        height: video.videoHeight,
        duration,
        fps,
        estimatedFrames: Math.max(1, Math.round(duration * fps)),
      }
      cleanup()
      resolve(metadata)
    }
    video.onloadedmetadata = () => {
      const samples: number[] = []
      if (!('requestVideoFrameCallback' in video) || video.duration < 0.2) {
        finalize()
        return
      }
      const sample = (_now: DOMHighResTimeStamp, frame: VideoFrameCallbackMetadata) => {
        samples.push(frame.mediaTime)
        if (samples.length >= 7) {
          const span = samples.at(-1)! - samples[0]
          const fps = span > 0 ? (samples.length - 1) / span : 30
          video.pause()
          finalize(Math.max(1, Math.min(240, Math.round(fps * 100) / 100)))
          return
        }
        video.requestVideoFrameCallback(sample)
      }
      video.requestVideoFrameCallback(sample)
      void video.play().catch(() => finalize())
      window.setTimeout(() => finalize(), 2_000)
    }
    video.onerror = () => {
      cleanup()
      reject(new Error('This codec is not supported by the browser preview.'))
    }
    video.src = url
  })
}

function waitForSeek(video: HTMLVideoElement, time: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException('Canceled', 'AbortError'))
    if (Math.abs(video.currentTime - time) < 0.0005 && video.readyState >= 2) {
      requestAnimationFrame(() => resolve())
      return
    }
    const timeout = window.setTimeout(() => finish(new Error('Timed out while seeking the video.')), 8_000)
    const onSeeked = () => finish()
    const onAbort = () => finish(new DOMException('Canceled', 'AbortError'))
    const finish = (error?: Error) => {
      clearTimeout(timeout)
      video.removeEventListener('seeked', onSeeked)
      signal.removeEventListener('abort', onAbort)
      if (error) reject(error)
      else resolve()
    }
    video.addEventListener('seeked', onSeeked, { once: true })
    signal.addEventListener('abort', onAbort, { once: true })
    video.currentTime = Math.min(Math.max(0, time), Math.max(0, video.duration - 0.0001))
  })
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the extracted frame.'))),
      'image/png',
    ),
  )
}

function getTrimFrameBounds(trim: TrimSettings, metadata: VideoMetadata) {
  const fps = Math.max(0.001, metadata.fps)
  const lastFrame = Math.max(0, metadata.estimatedFrames - 1)
  const start = Math.max(0, Math.min(Math.ceil(trim.startTime * fps - 0.000001), lastFrame))
  const endExclusive = Math.max(
    start + 1,
    Math.min(Math.ceil(trim.endTime * fps - 0.000001), metadata.estimatedFrames),
  )
  return { start, end: endExclusive - 1 }
}

export function getTrimmedSourceFrameCount(trim: TrimSettings, metadata: VideoMetadata) {
  const { start, end } = getTrimFrameBounds(trim, metadata)
  return end - start + 1
}

export function estimateExtractionCount(
  trim: TrimSettings,
  settings: ExtractionSettings,
  metadata: VideoMetadata,
) {
  return chooseFrameIndices(settings, metadata, trim).length
}

function chooseFrameIndices(
  settings: ExtractionSettings,
  metadata: VideoMetadata,
  trim: TrimSettings,
) {
  const { start, end } = getTrimFrameBounds(trim, metadata)
  if (settings.mode === 'exact') {
    const count = Math.min(end - start + 1, Math.max(1, settings.exactFrames))
    return Array.from({ length: count }, (_, index) => {
      const position = count === 1 ? 0 : index / (count - 1)
      return Math.round(start + (end - start) * position)
    })
  }
  let indices: number[] = []

  if (settings.fpsOverride && settings.fpsOverride > 0) {
    const step = metadata.fps / settings.fpsOverride
    for (let frame = start; frame <= end + 0.001; frame += step) indices.push(Math.round(frame))
  } else {
    for (let frame = start; frame <= end; frame += Math.max(1, settings.interval)) indices.push(frame)
  }

  indices = [...new Set(indices)]
  return indices
}

export async function extractFramesNative(
  file: File,
  metadata: VideoMetadata,
  trim: TrimSettings,
  settings: ExtractionSettings,
  signal: AbortSignal,
  onProgress: (progress: number, detail: string) => void,
): Promise<FrameItem[]> {
  const video = document.createElement('video')
  const url = URL.createObjectURL(file)
  video.src = url
  video.preload = 'auto'
  video.muted = true
  video.playsInline = true

  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve()
    video.onerror = () => reject(new Error('The browser could not decode this video.'))
    signal.addEventListener('abort', () => reject(new DOMException('Canceled', 'AbortError')), {
      once: true,
    })
    video.load()
  })

  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  const context = canvas.getContext('2d', { alpha: true })
  if (!context) throw new Error('Canvas rendering is not available.')
  const indices = chooseFrameIndices(settings, metadata, trim)
  const frames: FrameItem[] = []

  try {
    video.pause()
    onProgress(0.03, `Trim applied · ${(trim.endTime - trim.startTime).toFixed(2)}s selected`)
    for (let index = 0; index < indices.length; index += 1) {
      if (signal.aborted) throw new DOMException('Canceled', 'AbortError')
      const sourceFrame = indices[index]
      await waitForSeek(video, sourceFrame / metadata.fps, signal)
      context.clearRect(0, 0, canvas.width, canvas.height)
      context.drawImage(video, 0, 0, canvas.width, canvas.height)
      const blob = await canvasToBlob(canvas)
      frames.push({
        id: crypto.randomUUID(),
        name: `frame_${(index + 1).toString().padStart(4, '0')}`,
        blob,
        url: URL.createObjectURL(blob),
        width: canvas.width,
        height: canvas.height,
        sourceTime: sourceFrame / metadata.fps,
        included: true,
        selected: false,
      })
      onProgress(0.03 + ((index + 1) / indices.length) * 0.97, `Frame ${index + 1} of ${indices.length}`)
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
    return frames
  } finally {
    URL.revokeObjectURL(url)
    video.removeAttribute('src')
    video.load()
  }
}

export async function blobDimensions(blob: Blob) {
  const bitmap = await createImageBitmap(blob)
  const result = { width: bitmap.width, height: bitmap.height }
  bitmap.close()
  return result
}
