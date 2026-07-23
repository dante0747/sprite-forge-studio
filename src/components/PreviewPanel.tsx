import {
  Check,
  ChevronLeft,
  ChevronRight,
  Grid3X3,
  Maximize2,
  Pause,
  Play,
  RotateCcw,
  SkipBack,
  SkipForward,
  Square,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { processCanvasSource } from '../lib/chroma'
import { clamp, formatTime } from '../lib/format'
import type { ChromaSettings, VideoProject } from '../types/editor'
import { IconButton, Segmented, Slider } from './ui/Controls'

export type ViewMode = 'source' | 'frames' | 'key' | 'sheet' | 'animate'

function backdropClass(background: ChromaSettings['previewBackground']) {
  return `preview-backdrop preview-backdrop--${background}`
}

function LiveSelectionMonitor({
  project,
  onAnimationFpsChange,
  disabled,
}: {
  project: VideoProject
  onAnimationFpsChange: (fps: number) => void
  disabled: boolean
}) {
  const [playing, setPlaying] = useState(true)
  const [previewPosition, setPreviewPosition] = useState(0)
  const chosenFrames = project.frames.filter((frame) => frame.included !== false)
  const safePreviewPosition = chosenFrames.length ? previewPosition % chosenFrames.length : 0
  const previewFrame = chosenFrames[safePreviewPosition]

  useEffect(() => {
    if (!playing || chosenFrames.length < 2) return
    const timer = window.setInterval(
      () => setPreviewPosition((current) => (current + 1) % chosenFrames.length),
      1000 / Math.max(1, project.animation.fps),
    )
    return () => clearInterval(timer)
  }, [chosenFrames.length, playing, project.animation.fps])

  return (
    <aside className="curation-live curation-live--standalone">
      <header>
        <span>LIVE SELECTION</span>
        <strong>{chosenFrames.length} frames · {project.animation.fps} FPS</strong>
      </header>
      <div className="curation-live__stage checkerboard">
        {previewFrame ? (
          <img src={previewFrame.url} alt={`Live preview frame ${safePreviewPosition + 1}`} />
        ) : (
          <div className="monitor-placeholder">
            <Grid3X3 size={25} />
            <strong>Choose at least one frame</strong>
            <span>Add frames from the curation tray below.</span>
          </div>
        )}
      </div>
      <div className="curation-live__controls">
        <IconButton
          label="Previous chosen frame"
          disabled={!chosenFrames.length}
          onClick={() => setPreviewPosition((current) => (current - 1 + chosenFrames.length) % chosenFrames.length)}
        >
          <SkipBack size={15} />
        </IconButton>
        <IconButton
          label={playing ? 'Pause live preview' : 'Play live preview'}
          className="play-button"
          disabled={!chosenFrames.length}
          onClick={() => setPlaying((current) => !current)}
        >
          {playing ? <Pause size={17} /> : <Play size={17} />}
        </IconButton>
        <IconButton
          label="Next chosen frame"
          disabled={!chosenFrames.length}
          onClick={() => setPreviewPosition((current) => (current + 1) % chosenFrames.length)}
        >
          <SkipForward size={15} />
        </IconButton>
        <span>{chosenFrames.length ? `${safePreviewPosition + 1} / ${chosenFrames.length}` : '0 / 0'}</span>
      </div>
      <label className="curation-live__fps">
        <span>Playback speed</span>
        <input type="range" min={1} max={60} value={project.animation.fps} disabled={disabled} onChange={(event) => onAnimationFpsChange(Number(event.target.value))} />
        <output>{project.animation.fps} FPS</output>
      </label>
      <p>The preview updates immediately as you change the chosen sequence below.</p>
    </aside>
  )
}

function ChromaMonitor({
  project,
  frameIndex,
  onColorPick,
}: {
  project: VideoProject
  frameIndex: number
  onColorPick: (color: string) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sourceRef = useRef<HTMLCanvasElement | undefined>(undefined)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let canceled = false
    const render = async () => {
      const frame = project.frames[frameIndex]
      if (!frame || !canvasRef.current) return
      setBusy(true)
      try {
        const bitmap = await createImageBitmap(frame.blob)
        const original = document.createElement('canvas')
        original.width = bitmap.width
        original.height = bitmap.height
        original.getContext('2d')?.drawImage(bitmap, 0, 0)
        bitmap.close()
        sourceRef.current = original
        const processed = await processCanvasSource(
          original,
          original.width,
          original.height,
          project.chroma,
        )
        if (canceled || !canvasRef.current) return
        const canvas = canvasRef.current
        canvas.width = processed.width
        canvas.height = processed.height
        canvas.getContext('2d')?.drawImage(processed, 0, 0)
      } finally {
        if (!canceled) setBusy(false)
      }
    }
    const timer = window.setTimeout(render, 80)
    return () => {
      canceled = true
      clearTimeout(timer)
    }
  }, [project.frames, project.chroma, frameIndex])

  const pick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const source = sourceRef.current
    const target = canvasRef.current
    if (!source || !target) return
    const bounds = target.getBoundingClientRect()
    const x = Math.floor(((event.clientX - bounds.left) / bounds.width) * source.width)
    const y = Math.floor(((event.clientY - bounds.top) / bounds.height) * source.height)
    const radius = 4
    const sampleX = Math.max(0, x - radius)
    const sampleY = Math.max(0, y - radius)
    const sampleWidth = Math.min(source.width - sampleX, radius * 2 + 1)
    const sampleHeight = Math.min(source.height - sampleY, radius * 2 + 1)
    const pixels = source
      .getContext('2d')
      ?.getImageData(sampleX, sampleY, sampleWidth, sampleHeight).data
    if (!pixels) return
    const channels = [[], [], []] as number[][]
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index + 3] < 16) continue
      channels[0].push(pixels[index])
      channels[1].push(pixels[index + 1])
      channels[2].push(pixels[index + 2])
    }
    if (!channels[0].length) return
    const color = channels.map((channel) => {
      channel.sort((left, right) => left - right)
      const trim = Math.floor(channel.length * 0.2)
      const values = channel.slice(trim, Math.max(trim + 1, channel.length - trim))
      return Math.round(values.reduce((total, value) => total + value, 0) / values.length)
    })
    onColorPick(`#${color.map((value) => value.toString(16).padStart(2, '0')).join('')}`)
  }

  if (!project.frames.length) {
    return (
      <div className="monitor-placeholder">
        <Grid3X3 size={30} />
        <strong>Extract frames to preview transparency</strong>
        <span>The chroma key remains non-destructive until export.</span>
      </div>
    )
  }
  return (
    <div className={backdropClass(project.chroma.previewBackground)}>
      <canvas ref={canvasRef} onClick={pick} title="Click to sample the surrounding background color" />
      {busy && <span className="monitor-busy">Updating key…</span>}
      <span className="eyedropper-hint">Click background to sample a 9 × 9 area</span>
    </div>
  )
}

function SheetMonitor({ project }: { project: VideoProject }) {
  if (!project.sheetResult) {
    return (
      <div className="monitor-placeholder">
        <Grid3X3 size={30} />
        <strong>Your sheet preview will appear here</strong>
        <span>Configure the layout, then choose Generate sprite sheet.</span>
      </div>
    )
  }
  return (
    <div className={backdropClass(project.chroma.previewBackground)}>
      <svg
        className="sheet-preview-svg"
        viewBox={`0 0 ${project.sheetResult.width} ${project.sheetResult.height}`}
        role="img"
        aria-label="Generated sprite sheet with packed frame boundaries"
      >
        <image href={project.sheetResult.url} width={project.sheetResult.width} height={project.sheetResult.height} />
        <g className="sheet-frame-guides">
          {project.sheetResult.frames.map((frame) => (
            <rect key={frame.name} x={frame.x} y={frame.y} width={frame.width} height={frame.height} />
          ))}
        </g>
        <g className="sheet-content-guides">
          {project.sheetResult.frames.map((frame) => (
            <rect key={frame.name} x={frame.contentX} y={frame.contentY} width={frame.contentWidth} height={frame.contentHeight} />
          ))}
        </g>
      </svg>
      <div className="sheet-guide-legend" aria-hidden="true">
        <span><i /> frame bounds</span><span><i /> sprite area</span>
      </div>
      <span className="resolution-badge">
        {project.sheetResult.width} × {project.sheetResult.height}
      </span>
    </div>
  )
}

function AnimationMonitor({
  project,
  setFrameIndex,
  onAnimationFpsChange,
  disabled,
}: {
  project: VideoProject
  setFrameIndex: (index: number) => void
  onAnimationFpsChange: (fps: number) => void
  disabled: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [playing, setPlaying] = useState(true)
  const [loadedSheet, setLoadedSheet] = useState<{ url: string; bitmap: ImageBitmap }>()
  const [sheetError, setSheetError] = useState<{ url: string; message: string }>()
  const direction = useRef(1)
  const result = project.sheetResult
  const chosenFrames = useMemo(
    () => project.frames
      .map((frame, sourceIndex) => ({ frame, sourceIndex }))
      .filter(({ frame }) => frame.included !== false),
    [project.frames],
  )
  const frameCount = result?.frames.length ?? chosenFrames.length
  const sheetBitmap = loadedSheet && loadedSheet.url === result?.url ? loadedSheet.bitmap : undefined
  const [playheadPosition, setPlayheadPosition] = useState(() =>
    project.animation.reverse ? Math.max(0, frameCount - 1) : 0,
  )
  const playhead = frameCount ? clamp(playheadPosition, 0, frameCount - 1) : 0
  const previewFrame = chosenFrames[playhead]?.frame
  const activeFrameName = result?.frames[playhead]?.name ?? previewFrame?.name ?? `Frame ${playhead + 1}`
  const playheadProgress = frameCount > 1 ? (playhead / (frameCount - 1)) * 100 : 0
  const fpsProgress = ((project.animation.fps - 1) / 59) * 100

  const showFrame = useCallback((position: number) => {
    if (!frameCount) return
    const next = clamp(position, 0, frameCount - 1)
    direction.current = 1
    setPlayheadPosition(next)
    setFrameIndex(chosenFrames[next]?.sourceIndex ?? next)
  }, [chosenFrames, frameCount, setFrameIndex])

  useEffect(() => {
    let disposed = false
    let bitmap: ImageBitmap | undefined
    if (!result) return
    void createImageBitmap(result.blob)
      .then((next) => {
        if (disposed) next.close()
        else {
          bitmap = next
          setLoadedSheet({ url: result.url, bitmap: next })
        }
      })
      .catch(() => {
        if (!disposed) setSheetError({
          url: result.url,
          message: 'Could not decode the generated sheet preview.',
        })
      })
    return () => {
      disposed = true
      bitmap?.close()
    }
  }, [result])

  useEffect(() => {
    if (!playing || frameCount < 2 || (result && !sheetBitmap)) return
    const timer = window.setInterval(() => {
      setPlayheadPosition((currentPosition) => {
        const last = frameCount - 1
        const current = clamp(currentPosition, 0, last)
        const playbackDirection = project.animation.reverse ? -1 : 1
        let next = current + direction.current * playbackDirection
        if (project.animation.loopMode === 'ping-pong') {
          if (next > last || next < 0) {
            direction.current *= -1
            next = clamp(current + direction.current * playbackDirection, 0, last)
          }
        } else if (project.animation.loopMode === 'once') {
          if (next > last || next < 0) {
            setPlaying(false)
            return current
          }
        } else {
          next = next > last ? 0 : next < 0 ? last : next
        }
        setFrameIndex(chosenFrames[next]?.sourceIndex ?? next)
        return next
      })
    }, 1000 / Math.max(1, project.animation.fps))
    return () => clearInterval(timer)
  }, [chosenFrames, frameCount, playing, project.animation, result, setFrameIndex, sheetBitmap])

  useEffect(() => {
    const canvas = canvasRef.current
    const frame = result?.frames[playhead]
    if (!canvas || !frame || !sheetBitmap) return
    canvas.width = frame.width
    canvas.height = frame.height
    const context = canvas.getContext('2d')
    if (!context) return
    context.imageSmoothingEnabled = false
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.drawImage(
      sheetBitmap,
      frame.x,
      frame.y,
      frame.width,
      frame.height,
      0,
      0,
      frame.width,
      frame.height,
    )
  }, [playhead, result, sheetBitmap])

  const togglePlayback = useCallback(() => {
    if (playing) {
      setPlaying(false)
      return
    }
    if (project.animation.loopMode === 'once') {
      const endFrame = project.animation.reverse ? 0 : Math.max(0, frameCount - 1)
      if (playhead === endFrame) {
        showFrame(project.animation.reverse ? Math.max(0, frameCount - 1) : 0)
      }
    }
    setPlaying(true)
  }, [frameCount, playhead, playing, project.animation.loopMode, project.animation.reverse, showFrame])

  useEffect(() => {
    const handler = () => togglePlayback()
    window.addEventListener('spriteforge:toggle-play', handler)
    return () => window.removeEventListener('spriteforge:toggle-play', handler)
  }, [togglePlayback])

  const stepTo = (position: number) => {
    setPlaying(false)
    showFrame((position + frameCount) % frameCount)
  }

  if (!frameCount) {
    return (
      <div className="monitor-placeholder">
        <Play size={30} />
        <strong>Choose at least one frame</strong>
        <span>The chosen sequence can be animated before generating a sprite sheet.</span>
      </div>
    )
  }

  return (
    <div className="animation-monitor">
      <div className={backdropClass(project.chroma.previewBackground)}>
        {result ? (
          <>
            <canvas ref={canvasRef} />
            {!sheetBitmap && (
              <span className="monitor-busy">
                {sheetError?.url === result.url ? sheetError.message : 'Loading packed sheet…'}
              </span>
            )}
          </>
        ) : (
          <img src={previewFrame?.url} alt={`Chosen animation frame ${playhead + 1}`} />
        )}
        <div className="animation-stage-status">
          <span>{result ? 'PACKED SHEET' : 'BEFORE GENERATION'}</span>
          <strong title={activeFrameName}>{activeFrameName}</strong>
        </div>
        <span className="resolution-badge">
          {result
            ? `Packed sheet · ${result.width} × ${result.height}`
            : `Chosen frames · ${previewFrame?.width ?? 0} × ${previewFrame?.height ?? 0}`}
        </span>
      </div>
      <div className="animation-control-deck">
        <div className="animation-transport-controls">
          <IconButton label="First chosen frame" onClick={() => stepTo(0)}>
            <SkipBack size={16} />
          </IconButton>
          <IconButton label="Previous chosen frame" onClick={() => stepTo(playhead - 1)}>
            <ChevronLeft size={18} />
          </IconButton>
          <IconButton label={playing ? 'Pause animation' : 'Play animation'} className="play-button" onClick={togglePlayback}>
            {playing ? <Pause size={20} /> : <Play size={20} />}
          </IconButton>
          <IconButton label="Next chosen frame" onClick={() => stepTo(playhead + 1)}>
            <ChevronRight size={18} />
          </IconButton>
          <IconButton label="Last chosen frame" onClick={() => stepTo(frameCount - 1)}>
            <SkipForward size={16} />
          </IconButton>
        </div>
        <label className="animation-scrubber">
          <span>
            <strong>Frame {playhead + 1} of {frameCount}</strong>
            <small>{project.animation.loopMode === 'ping-pong' ? 'Ping pong' : project.animation.loopMode === 'once' ? 'Play once' : 'Looping'}{project.animation.reverse ? ' · Reverse' : ''}</small>
          </span>
          <input
            aria-label="Animation frame"
            type="range"
            min={0}
            max={Math.max(0, frameCount - 1)}
            value={playhead}
            style={{ '--range-progress': `${playheadProgress}%` } as React.CSSProperties}
            onChange={(event) => stepTo(Number(event.target.value))}
          />
        </label>
        <label className="animation-speed">
          <span>
            <strong>{project.animation.fps} FPS</strong>
            <small>Playback speed</small>
          </span>
          <input
            aria-label="Animation playback speed"
            type="range"
            min={1}
            max={60}
            value={project.animation.fps}
            disabled={disabled}
            style={{ '--range-progress': `${fpsProgress}%` } as React.CSSProperties}
            onChange={(event) => onAnimationFpsChange(Number(event.target.value))}
          />
        </label>
      </div>
    </div>
  )
}

export function PreviewPanel({
  project,
  frameIndex,
  setFrameIndex,
  view,
  setView,
  onColorPick,
  onAnimationFpsChange,
  disabled,
}: {
  project: VideoProject
  frameIndex: number
  setFrameIndex: (index: number) => void
  view: ViewMode
  setView: (view: ViewMode) => void
  onColorPick: (color: string) => void
  onAnimationFpsChange: (fps: number) => void
  disabled: boolean
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [zoom, setZoom] = useState(100)
  const trimLastFrameTime = Math.max(project.trim.startTime, project.trim.endTime - 1 / project.metadata.fps)

  const toggle = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      if (video.currentTime < project.trim.startTime || video.currentTime >= trimLastFrameTime) {
        video.currentTime = project.trim.startTime
      }
      void video.play()
    }
    else video.pause()
  }, [project.trim.startTime, trimLastFrameTime])

  useEffect(() => {
    const handler = () => {
      if (view === 'source') toggle()
    }
    window.addEventListener('spriteforge:toggle-play', handler)
    return () => window.removeEventListener('spriteforge:toggle-play', handler)
  }, [toggle, view])

  useEffect(() => {
    const seekToTrimPoint = (event: Event) => {
      const video = videoRef.current
      if (!video) return
      const value = clamp((event as CustomEvent<number>).detail, 0, project.metadata.duration)
      video.pause()
      video.currentTime = value
      setTime(value)
    }
    window.addEventListener('spriteforge:seek-source', seekToTrimPoint)
    return () => window.removeEventListener('spriteforge:seek-source', seekToTrimPoint)
  }, [project.metadata.duration])

  useEffect(() => {
    const video = videoRef.current
    if (!video || (video.currentTime >= project.trim.startTime && video.currentTime <= project.trim.endTime)) return
    video.pause()
    video.currentTime = project.trim.startTime
    setTime(project.trim.startTime)
  }, [project.trim.endTime, project.trim.startTime])

  const seekFrame = (offset: number) => {
    const video = videoRef.current
    if (!video) return
    video.pause()
    video.currentTime = clamp(
      video.currentTime + offset / project.metadata.fps,
      project.trim.startTime,
      trimLastFrameTime,
    )
  }

  return (
    <main className={`preview-panel ${view === 'animate' ? 'preview-panel--animate' : ''} ${view === 'frames' ? 'preview-panel--curation' : ''}`}>
      <header className="viewer-toolbar">
        <Segmented
          value={view}
          options={[
            { value: 'source', label: 'Source' },
            { value: 'frames', label: 'Choose frames' },
            { value: 'key', label: 'Transparency' },
            { value: 'sheet', label: 'Sprite sheet' },
            { value: 'animate', label: 'Animate' },
          ]}
          onChange={setView}
        />
        {view === 'frames' ? (
          <div className="viewer-toolbar__selection-count">
            <Check size={13} /> {project.frames.filter((frame) => frame.included !== false).length} chosen
          </div>
        ) : (
          <div className="viewer-toolbar__right">
            <IconButton label="Zoom out" onClick={() => setZoom(Math.max(25, zoom - 25))}>
              <ZoomOut size={15} />
            </IconButton>
            <span>{zoom}%</span>
            <IconButton label="Zoom in" onClick={() => setZoom(Math.min(300, zoom + 25))}>
              <ZoomIn size={15} />
            </IconButton>
            <IconButton label="Fit to view" onClick={() => setZoom(100)}>
              <Maximize2 size={15} />
            </IconButton>
          </div>
        )}
      </header>
      <div className="monitor-shell">
        <div className={`monitor-transform ${view === 'frames' ? 'monitor-transform--gallery' : ''}`} style={{ '--viewer-zoom': view === 'frames' ? 1 : zoom / 100 } as React.CSSProperties}>
          {view === 'source' && (
            <div className="source-monitor">
              <video
                ref={videoRef}
                key={project.id}
                src={project.url}
                muted
                playsInline
                onLoadedMetadata={(event) => {
                  event.currentTarget.currentTime = project.trim.startTime
                  setTime(project.trim.startTime)
                }}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onTimeUpdate={(event) => {
                  const video = event.currentTarget
                  if (!video.paused && video.currentTime >= trimLastFrameTime) {
                    video.pause()
                    video.currentTime = trimLastFrameTime
                  }
                  setTime(video.currentTime)
                  setFrameIndex(Math.round(video.currentTime * project.metadata.fps))
                }}
                onEnded={() => setPlaying(false)}
              />
              <span className="resolution-badge">
                {project.metadata.width} × {project.metadata.height} · {project.metadata.fps.toFixed(2)} FPS
              </span>
            </div>
          )}
          {view === 'key' && <ChromaMonitor project={project} frameIndex={frameIndex} onColorPick={onColorPick} />}
          {view === 'sheet' && <SheetMonitor project={project} />}
          {view === 'animate' && (
            <AnimationMonitor
              key={`${project.sheetResult?.url ?? project.id}:${project.animation.reverse}`}
              project={project}
              setFrameIndex={setFrameIndex}
              onAnimationFpsChange={onAnimationFpsChange}
              disabled={disabled}
            />
          )}
          {view === 'frames' && (
            <LiveSelectionMonitor
              project={project}
              onAnimationFpsChange={onAnimationFpsChange}
              disabled={disabled}
            />
          )}
        </div>
      </div>
      {view === 'source' && (
        <footer className="transport">
          <div className="transport__buttons">
            <IconButton label="Go to trim start" onClick={() => { if (videoRef.current) videoRef.current.currentTime = project.trim.startTime }}>
              <RotateCcw size={15} />
            </IconButton>
            <IconButton label="Previous frame" onClick={() => seekFrame(-1)}>
              <ChevronLeft size={17} />
            </IconButton>
            <IconButton label={playing ? 'Pause' : 'Play'} className="play-button" onClick={toggle}>
              {playing ? <Pause size={18} /> : <Play size={18} />}
            </IconButton>
            <IconButton label="Stop" onClick={() => { videoRef.current?.pause(); if (videoRef.current) videoRef.current.currentTime = project.trim.startTime }}>
              <Square size={13} fill="currentColor" />
            </IconButton>
            <IconButton label="Next frame" onClick={() => seekFrame(1)}>
              <ChevronRight size={17} />
            </IconButton>
          </div>
          <span className="timecode">{formatTime(time)}</span>
          <div
            className="transport__timeline"
            style={{
              '--range-progress': `${(time / project.metadata.duration) * 100}%`,
              '--trim-start': `${(project.trim.startTime / project.metadata.duration) * 100}%`,
              '--trim-end': `${(project.trim.endTime / project.metadata.duration) * 100}%`,
            } as React.CSSProperties}
          >
            <span className="transport__trim-selection" />
            <input
              aria-label="Video timeline"
              type="range"
              min={0}
              max={project.metadata.duration || 0}
              step={0.001}
              value={time}
              onChange={(event) => {
                const value = Number(event.target.value)
                if (videoRef.current) videoRef.current.currentTime = value
                setTime(value)
              }}
            />
          </div>
          <span className="timecode timecode--muted">{formatTime(project.metadata.duration)}</span>
          <span className="frame-counter">F {Math.min(project.metadata.estimatedFrames, frameIndex + 1)}</span>
          <Check size={14} className="decode-ok" />
        </footer>
      )}
      {view !== 'source' && view !== 'frames' && view !== 'animate' && (
        <footer className="sub-transport">
          <span>Frame {Math.min(frameIndex + 1, Math.max(1, project.frames.length))}</span>
          <Slider label="Preview frame" value={Math.min(frameIndex, Math.max(0, project.frames.length - 1))} min={0} max={Math.max(0, project.frames.length - 1)} onChange={setFrameIndex} />
        </footer>
      )}
    </main>
  )
}
