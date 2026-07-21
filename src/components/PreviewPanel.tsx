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
import { useCallback, useEffect, useRef, useState } from 'react'
import { processCanvasSource } from '../lib/chroma'
import { clamp, formatTime } from '../lib/format'
import type { ChromaSettings, VideoProject } from '../types/editor'
import { IconButton, Segmented, Slider } from './ui/Controls'

export type ViewMode = 'source' | 'key' | 'sheet' | 'animate'

function backdropClass(background: ChromaSettings['previewBackground']) {
  return `preview-backdrop preview-backdrop--${background}`
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
    const pixel = source.getContext('2d')?.getImageData(x, y, 1, 1).data
    if (!pixel) return
    onColorPick(`#${[pixel[0], pixel[1], pixel[2]].map((v) => v.toString(16).padStart(2, '0')).join('')}`)
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
      <canvas ref={canvasRef} onClick={pick} title="Click to sample a key color" />
      {busy && <span className="monitor-busy">Updating key…</span>}
      <span className="eyedropper-hint">Click image to sample color</span>
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
      <img className="sheet-image" src={project.sheetResult.url} alt="Generated sprite sheet" />
      <span className="resolution-badge">
        {project.sheetResult.width} × {project.sheetResult.height}
      </span>
    </div>
  )
}

function AnimationMonitor({
  project,
  frameIndex,
  setFrameIndex,
}: {
  project: VideoProject
  frameIndex: number
  setFrameIndex: (index: number) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [playing, setPlaying] = useState(true)
  const direction = useRef(1)
  const result = project.sheetResult

  useEffect(() => {
    if (!playing || !result?.frames.length) return
    const timer = window.setInterval(() => {
      setFrameIndex((() => {
        const last = result.frames.length - 1
        let next = frameIndex + direction.current * (project.animation.reverse ? -1 : 1)
        if (project.animation.loopMode === 'ping-pong') {
          if (next > last || next < 0) {
            direction.current *= -1
            next = clamp(frameIndex + direction.current, 0, last)
          }
        } else if (project.animation.loopMode === 'once') {
          if (next > last || next < 0) {
            setPlaying(false)
            return clamp(next, 0, last)
          }
        } else {
          next = next > last ? 0 : next < 0 ? last : next
        }
        return next
      })())
    }, 1000 / project.animation.fps)
    return () => clearInterval(timer)
  }, [playing, result, frameIndex, project.animation, setFrameIndex])

  useEffect(() => {
    if (!result || !canvasRef.current) return
    const frame = result.frames[frameIndex % result.frames.length]
    const image = new Image()
    image.onload = () => {
      const canvas = canvasRef.current
      if (!canvas) return
      canvas.width = frame.width
      canvas.height = frame.height
      const context = canvas.getContext('2d')
      context?.clearRect(0, 0, canvas.width, canvas.height)
      context?.drawImage(
        image,
        frame.x,
        frame.y,
        frame.width,
        frame.height,
        0,
        0,
        frame.width,
        frame.height,
      )
    }
    image.src = result.url
  }, [result, frameIndex])

  if (!result) {
    return (
      <div className="monitor-placeholder">
        <Play size={30} />
        <strong>Generate a sprite sheet first</strong>
        <span>Animation playback uses the packed texture itself.</span>
      </div>
    )
  }
  return (
    <div className="animation-monitor">
      <div className={backdropClass(project.chroma.previewBackground)}>
        <canvas ref={canvasRef} />
      </div>
      <div className="animation-controls">
        <IconButton label="Previous frame" onClick={() => setFrameIndex(Math.max(0, frameIndex - 1))}>
          <SkipBack size={16} />
        </IconButton>
        <IconButton label={playing ? 'Pause' : 'Play'} className="play-button" onClick={() => setPlaying(!playing)}>
          {playing ? <Pause size={18} /> : <Play size={18} />}
        </IconButton>
        <IconButton
          label="Next frame"
          onClick={() => setFrameIndex(Math.min(result.frames.length - 1, frameIndex + 1))}
        >
          <SkipForward size={16} />
        </IconButton>
        <span>Frame {frameIndex + 1} / {result.frames.length}</span>
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
}: {
  project: VideoProject
  frameIndex: number
  setFrameIndex: (index: number) => void
  view: ViewMode
  setView: (view: ViewMode) => void
  onColorPick: (color: string) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [zoom, setZoom] = useState(100)

  const toggle = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) void video.play()
    else video.pause()
  }, [])

  useEffect(() => {
    const handler = () => {
      if (view === 'source') toggle()
    }
    window.addEventListener('spriteforge:toggle-play', handler)
    return () => window.removeEventListener('spriteforge:toggle-play', handler)
  }, [toggle, view])

  const seekFrame = (offset: number) => {
    const video = videoRef.current
    if (!video) return
    video.pause()
    video.currentTime = clamp(video.currentTime + offset / project.metadata.fps, 0, video.duration)
  }

  return (
    <main className="preview-panel">
      <header className="viewer-toolbar">
        <Segmented
          value={view}
          options={[
            { value: 'source', label: 'Source' },
            { value: 'key', label: 'Transparency' },
            { value: 'sheet', label: 'Sprite sheet' },
            { value: 'animate', label: 'Animate' },
          ]}
          onChange={setView}
        />
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
      </header>
      <div className="monitor-shell">
        <div className="monitor-transform" style={{ '--viewer-zoom': zoom / 100 } as React.CSSProperties}>
          {view === 'source' && (
            <div className="source-monitor">
              <video
                ref={videoRef}
                key={project.id}
                src={project.url}
                muted
                playsInline
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onTimeUpdate={(event) => {
                  setTime(event.currentTarget.currentTime)
                  setFrameIndex(Math.round(event.currentTarget.currentTime * project.metadata.fps))
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
            <AnimationMonitor project={project} frameIndex={frameIndex} setFrameIndex={setFrameIndex} />
          )}
        </div>
      </div>
      {view === 'source' && (
        <footer className="transport">
          <div className="transport__buttons">
            <IconButton label="Go to start" onClick={() => { if (videoRef.current) videoRef.current.currentTime = 0 }}>
              <RotateCcw size={15} />
            </IconButton>
            <IconButton label="Previous frame" onClick={() => seekFrame(-1)}>
              <ChevronLeft size={17} />
            </IconButton>
            <IconButton label={playing ? 'Pause' : 'Play'} className="play-button" onClick={toggle}>
              {playing ? <Pause size={18} /> : <Play size={18} />}
            </IconButton>
            <IconButton label="Stop" onClick={() => { videoRef.current?.pause(); if (videoRef.current) videoRef.current.currentTime = 0 }}>
              <Square size={13} fill="currentColor" />
            </IconButton>
            <IconButton label="Next frame" onClick={() => seekFrame(1)}>
              <ChevronRight size={17} />
            </IconButton>
          </div>
          <span className="timecode">{formatTime(time)}</span>
          <input
            className="transport__timeline"
            aria-label="Video timeline"
            type="range"
            min={0}
            max={project.metadata.duration || 0}
            step={0.001}
            value={time}
            style={{ '--range-progress': `${(time / project.metadata.duration) * 100}%` } as React.CSSProperties}
            onChange={(event) => {
              const value = Number(event.target.value)
              if (videoRef.current) videoRef.current.currentTime = value
              setTime(value)
            }}
          />
          <span className="timecode timecode--muted">{formatTime(project.metadata.duration)}</span>
          <span className="frame-counter">F {Math.min(project.metadata.estimatedFrames, frameIndex + 1)}</span>
          <Check size={14} className="decode-ok" />
        </footer>
      )}
      {view !== 'source' && view !== 'animate' && (
        <footer className="sub-transport">
          <span>Frame {Math.min(frameIndex + 1, Math.max(1, project.frames.length))}</span>
          <Slider label="Preview frame" value={Math.min(frameIndex, Math.max(0, project.frames.length - 1))} min={0} max={Math.max(0, project.frames.length - 1)} onChange={setFrameIndex} />
        </footer>
      )}
    </main>
  )
}
