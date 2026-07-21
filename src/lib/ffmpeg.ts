import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile } from '@ffmpeg/util'
import type { ExtractionSettings, FrameItem, VideoMetadata } from '../types/editor'
import { blobDimensions } from './media'

class OfflineFFmpeg {
  private ffmpeg = new FFmpeg()
  private loading?: Promise<void>

  isLoaded() {
    return this.ffmpeg.loaded
  }

  async load(onProgress?: (progress: number, detail: string) => void) {
    if (this.ffmpeg.loaded) return
    if (!this.loading) {
      this.loading = this.ffmpeg
        .load({
          coreURL: '/ffmpeg/ffmpeg-core.js',
          wasmURL: '/ffmpeg/ffmpeg-core.wasm',
        })
        .then(() => undefined)
        .finally(() => {
          this.loading = undefined
        })
    }
    onProgress?.(0.04, 'Loading the offline video engine…')
    await this.loading
  }

  async probe(file: File): Promise<VideoMetadata> {
    await this.load()
    const input = `probe-${crypto.randomUUID()}.${file.name.split('.').pop() ?? 'video'}`
    const logs: string[] = []
    const onLog = ({ message }: { message: string }) => logs.push(message)
    this.ffmpeg.on('log', onLog)
    try {
      await this.ffmpeg.writeFile(input, await fetchFile(file))
      await this.ffmpeg.exec(['-i', input, '-f', 'null', '-'])
    } finally {
      this.ffmpeg.off('log', onLog)
      await this.ffmpeg.deleteFile(input).catch(() => undefined)
    }
    const text = logs.join('\n')
    const durationMatch = text.match(/Duration:\s*(\d+):(\d+):([\d.]+)/)
    const videoMatch = text.match(/Video:.*?(\d{2,5})x(\d{2,5}).*?(\d+(?:\.\d+)?)\s*fps/)
    if (!durationMatch || !videoMatch) throw new Error('FFmpeg could not read video metadata.')
    const duration =
      Number(durationMatch[1]) * 3600 + Number(durationMatch[2]) * 60 + Number(durationMatch[3])
    const fps = Number(videoMatch[3]) || 30
    return {
      width: Number(videoMatch[1]),
      height: Number(videoMatch[2]),
      duration,
      fps,
      estimatedFrames: Math.max(1, Math.round(duration * fps)),
      codec: 'FFmpeg decoded',
    }
  }

  async createPreview(
    file: File,
    signal: AbortSignal,
    onProgress: (progress: number, detail: string) => void,
  ) {
    await this.load(onProgress)
    const token = crypto.randomUUID()
    const extension = file.name.split('.').pop() ?? 'video'
    const input = `preview-input-${token}.${extension}`
    const output = `preview-${token}.mp4`
    const onFfmpegProgress = ({ progress }: { progress: number }) =>
      onProgress(progress, `Creating browser preview · ${Math.round(progress * 100)}%`)
    const onAbort = () => this.ffmpeg.terminate()
    signal.addEventListener('abort', onAbort, { once: true })
    this.ffmpeg.on('progress', onFfmpegProgress)
    try {
      await this.ffmpeg.writeFile(input, await fetchFile(file))
      await this.ffmpeg.exec([
        '-i',
        input,
        '-vf',
        "scale='trunc(min(1280,iw)/2)*2':-2",
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast',
        '-crf',
        '28',
        '-an',
        '-movflags',
        '+faststart',
        output,
      ])
      const data = await this.ffmpeg.readFile(output)
      const source = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data)
      const bytes = new Uint8Array(source.length)
      bytes.set(source)
      return new Blob([bytes], { type: 'video/mp4' })
    } finally {
      signal.removeEventListener('abort', onAbort)
      this.ffmpeg.off('progress', onFfmpegProgress)
      if (this.ffmpeg.loaded) {
        await this.ffmpeg.deleteFile(input).catch(() => undefined)
        await this.ffmpeg.deleteFile(output).catch(() => undefined)
      }
    }
  }

  async extract(
    file: File,
    metadata: VideoMetadata,
    settings: ExtractionSettings,
    signal: AbortSignal,
    onProgress: (progress: number, detail: string) => void,
  ): Promise<FrameItem[]> {
    await this.load(onProgress)
    const token = crypto.randomUUID()
    const extension = file.name.split('.').pop() ?? 'video'
    const input = `input-${token}.${extension}`
    const output = `frame-${token}-%05d.png`
    const start = Math.max(0, settings.startFrame) / metadata.fps
    const end = Math.min(settings.endFrame, metadata.estimatedFrames - 1) / metadata.fps
    const duration = Math.max(1 / metadata.fps, end - start + 1 / metadata.fps)
    const filters: string[] = []
    if (settings.mode === 'exact') filters.push(`fps=${settings.exactFrames / duration}`)
    else if (settings.fpsOverride) filters.push(`fps=${settings.fpsOverride}`)
    else if (settings.interval > 1) filters.push(`select='not(mod(n,${settings.interval}))'`, 'setpts=N/FRAME_RATE/TB')

    const args = ['-ss', start.toFixed(6), '-i', input, '-t', duration.toFixed(6)]
    if (filters.length) args.push('-vf', filters.join(','))
    if (settings.mode === 'exact') args.push('-frames:v', String(settings.exactFrames))
    args.push('-vsync', '0', output)

    const onFfmpegProgress = ({ progress }: { progress: number }) =>
      onProgress(Math.max(0.05, progress), `Decoding video · ${Math.round(progress * 100)}%`)
    const onAbort = () => this.ffmpeg.terminate()
    signal.addEventListener('abort', onAbort, { once: true })
    this.ffmpeg.on('progress', onFfmpegProgress)
    try {
      await this.ffmpeg.writeFile(input, await fetchFile(file))
      await this.ffmpeg.exec(args)
      const entries = (await this.ffmpeg.listDir('/'))
        .filter((entry) => entry.name.startsWith(`frame-${token}-`) && entry.name.endsWith('.png'))
        .sort((a, b) => a.name.localeCompare(b.name))
      const frames: FrameItem[] = []
      for (let index = 0; index < entries.length; index += 1) {
        const data = await this.ffmpeg.readFile(entries[index].name)
        const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data)
        const blob = new Blob([bytes], { type: 'image/png' })
        const dimensions = await blobDimensions(blob)
        frames.push({
          id: crypto.randomUUID(),
          name: `frame_${(index + 1).toString().padStart(4, '0')}`,
          blob,
          url: URL.createObjectURL(blob),
          ...dimensions,
          selected: false,
        })
        await this.ffmpeg.deleteFile(entries[index].name)
      }
      return frames
    } finally {
      signal.removeEventListener('abort', onAbort)
      this.ffmpeg.off('progress', onFfmpegProgress)
      if (this.ffmpeg.loaded) await this.ffmpeg.deleteFile(input).catch(() => undefined)
    }
  }
}

export const offlineFFmpeg = new OfflineFFmpeg()
