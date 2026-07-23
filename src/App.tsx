import JSZip from 'jszip'
import { useCallback, useEffect, useRef, useState } from 'react'
import { EmptyWorkspace } from './components/EmptyWorkspace'
import { FrameTimeline } from './components/FrameTimeline'
import { Inspector } from './components/Inspector'
import { PreviewPanel, type ViewMode } from './components/PreviewPanel'
import { ProcessingBar } from './components/ProcessingBar'
import { ProjectRail } from './components/ProjectRail'
import { ToastStack, type ToastItem } from './components/ToastStack'
import { TopBar } from './components/TopBar'
import { useEditor } from './context/EditorContext'
import { createProject } from './lib/defaults'
import { createProjectZip, orderedFrameName } from './lib/exporters'
import { offlineFFmpeg } from './lib/ffmpeg'
import { downloadBlob, formatBytes } from './lib/format'
import { extractFramesNative, isSupportedVideo, readVideoMetadata } from './lib/media'
import { composeSpriteSheet } from './lib/spriteSheet'
import { processChromaBlob } from './lib/chroma'
import type { SpriteSheetResult, VideoProject } from './types/editor'

function AppContent() {
  const {
    activeProject,
    activeId,
    processing,
    preferences,
    addProject,
    updateProject,
    updateFrames,
    setProcessing,
    updatePreferences,
    undo,
    redo,
  } = useEditor()
  const inputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | undefined>(undefined)
  const processingStartedAt = useRef(0)
  const [frameIndex, setFrameIndex] = useState(0)
  const [view, setView] = useState<ViewMode>('source')
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const toast = useCallback((type: ToastItem['type'], title: string, message?: string) => {
    const id = crypto.randomUUID()
    setToasts((items) => [...items, { id, type, title, message }].slice(-4))
    window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 5_000)
  }, [])

  const begin = useCallback(
    (task: string) => {
      const controller = new AbortController()
      abortRef.current = controller
      processingStartedAt.current = Date.now()
      setProcessing({
        active: true,
        progress: 0,
        task,
        detail: 'Starting…',
        startedAt: processingStartedAt.current,
        cancel: () => controller.abort(),
      })
      return controller
    },
    [setProcessing],
  )

  const progress = useCallback(
    (task: string, value: number, detail: string) => {
      setProcessing({
        active: true,
        progress: Math.max(0, Math.min(1, value)),
        task,
        detail,
        startedAt: processingStartedAt.current,
        cancel: () => abortRef.current?.abort(),
      })
    },
    [setProcessing],
  )

  const finish = useCallback(() => {
    abortRef.current = undefined
    processingStartedAt.current = 0
    setProcessing({ active: false, progress: 0, task: '', detail: '', startedAt: 0 })
  }, [setProcessing])

  const decodeFrames = useCallback(
    async (
      project: VideoProject,
      signal: AbortSignal,
      onProgress: (value: number, detail: string) => void,
    ) => {
      try {
        return await extractFramesNative(
          project.file,
          project.metadata,
          project.trim,
          project.extraction,
          signal,
          onProgress,
        )
      } catch (error) {
        if ((error as Error).name === 'AbortError') throw error
        onProgress(0.03, 'Switching to the offline FFmpeg decoder…')
        return offlineFFmpeg.extract(
          project.file,
          project.metadata,
          project.trim,
          project.extraction,
          signal,
          onProgress,
        )
      }
    },
    [],
  )

  const importFiles = useCallback(
    async (files: File[]) => {
      const videos = files.filter(isSupportedVideo)
      if (!videos.length) {
        toast('error', 'Unsupported file', 'Choose an MP4, MOV, AVI, WebM or MKV video.')
        return
      }
      const task = videos.length > 1 ? 'Building frame galleries' : 'Building frame gallery'
      const controller = begin(task)
      let currentProjectId: string | undefined
      try {
        for (let index = 0; index < videos.length; index += 1) {
          const file = videos[index]
          const baseProgress = index / videos.length
          const fileShare = 1 / videos.length
          if (controller.signal.aborted) throw new DOMException('Canceled', 'AbortError')
          if (file.size > 500 * 1024 * 1024) {
            toast('info', 'Large source video', `${file.name} is ${formatBytes(file.size)}. Extraction may use substantial memory.`)
          }
          progress(task, baseProgress, `Reading ${file.name}`)
          let metadata
          let previewUrl: string
          try {
            metadata = await readVideoMetadata(file)
            previewUrl = URL.createObjectURL(file)
          } catch {
            progress(task, baseProgress + fileShare * 0.02, 'Loading the offline decoder')
            metadata = await offlineFFmpeg.probe(file)
            const preview = await offlineFFmpeg.createPreview(
              file,
              controller.signal,
              (value, detail) => progress(task, baseProgress + value * fileShare * 0.08, detail),
            )
            previewUrl = URL.createObjectURL(preview)
          }
          if (metadata.estimatedFrames > 1_500) {
            toast('info', 'Large frame gallery', `${file.name} contains about ${metadata.estimatedFrames} frames. Building every preview may take a while.`)
          }
          const project = createProject(file, previewUrl, metadata, preferences)
          project.extraction = {
            ...project.extraction,
            mode: 'range',
            interval: 1,
            fpsOverride: null,
          }
          currentProjectId = project.id
          addProject(project)
          updateProject(project.id, { status: 'processing', error: undefined })
          const frames = await decodeFrames(
            project,
            controller.signal,
            (value, detail) => progress(
              task,
              baseProgress + fileShare * (0.08 + value * 0.92),
              `${file.name} · ${detail}`,
            ),
          )
          updateFrames(project.id, frames, false)
          updateProject(project.id, { status: 'ready' })
          currentProjectId = undefined
          setFrameIndex(0)
          setView('frames')
        }
        toast(
          'success',
          videos.length === 1 ? 'Frame gallery ready' : `${videos.length} frame galleries ready`,
          'Cherry-pick frames and watch the live selection preview update.',
        )
      } catch (error) {
        if (currentProjectId) {
          updateProject(currentProjectId, {
            status: (error as Error).name === 'AbortError' ? 'ready' : 'error',
            error: (error as Error).name === 'AbortError' ? undefined : (error as Error).message,
          })
        }
        if ((error as Error).name !== 'AbortError') toast('error', 'Could not build frame gallery', (error as Error).message)
      } finally {
        finish()
        if (inputRef.current) inputRef.current.value = ''
      }
    },
    [addProject, begin, decodeFrames, finish, preferences, progress, toast, updateFrames, updateProject],
  )

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setFrameIndex(0)
      setView(activeId ? 'frames' : 'source')
    }, 0)
    return () => clearTimeout(timer)
  }, [activeId])

  const extract = useCallback(async () => {
    if (!activeProject) return
    const project = activeProject
    const task = `Extracting ${project.name}`
    const controller = begin(task)
    updateProject(project.id, { status: 'processing', error: undefined })
    try {
      const frames = await decodeFrames(
        project,
        controller.signal,
        (value, detail) => progress(task, value, detail),
      )
      updateFrames(project.id, frames)
      updateProject(project.id, { status: 'ready' })
      setFrameIndex(0)
      setView('frames')
      toast('success', `${frames.length} frames ready`, 'Cherry-pick the sequence in the frame gallery.')
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        updateProject(project.id, { status: 'error', error: (error as Error).message })
        toast('error', 'Frame extraction failed', (error as Error).message)
      } else {
        updateProject(project.id, { status: 'ready' })
      }
    } finally {
      finish()
    }
  }, [activeProject, begin, decodeFrames, finish, progress, toast, updateFrames, updateProject])

  const buildSheet = useCallback(
    async (project: VideoProject, task = `Generating ${project.name}`): Promise<SpriteSheetResult> => {
      const chosenFrames = project.frames.filter((frame) => frame.included !== false)
      if (!chosenFrames.length) throw new Error('Choose at least one frame before generating a sprite sheet.')
      const controller = begin(task)
      const result = await composeSpriteSheet(
        chosenFrames.map((frame, index) => ({
          ...frame,
          name: orderedFrameName(project.name, index),
        })),
        project.chroma,
        project.sheet,
        controller.signal,
        (value, detail) => progress(task, value, detail),
      )
      updateProject(project.id, { sheetResult: result })
      return result
    },
    [begin, progress, updateProject],
  )

  const generate = useCallback(async () => {
    if (!activeProject) return
    try {
      const result = await buildSheet(activeProject)
      setView('sheet')
      toast('success', 'Sprite sheet generated', `${result.width} × ${result.height}px · ${result.columns} columns`)
    } catch (error) {
      if ((error as Error).name !== 'AbortError') toast('error', 'Could not generate sheet', (error as Error).message)
    } finally {
      finish()
    }
  }, [activeProject, buildSheet, finish, toast])

  const ensureSheet = useCallback(async () => {
    if (!activeProject) throw new Error('No active animation.')
    return activeProject.sheetResult ?? buildSheet(activeProject, `Preparing ${activeProject.name}`)
  }, [activeProject, buildSheet])

  const exportSheet = useCallback(async () => {
    if (!activeProject) return
    try {
      const result = await ensureSheet()
      downloadBlob(result.blob, `${activeProject.name}.png`)
      toast('success', 'Sprite sheet exported', `${activeProject.name}.png`)
    } catch (error) {
      if ((error as Error).name !== 'AbortError') toast('error', 'Export failed', (error as Error).message)
    } finally {
      finish()
    }
  }, [activeProject, ensureSheet, finish, toast])

  const exportFrames = useCallback(async () => {
    if (!activeProject) return
    const project = activeProject
    const chosenFrames = project.frames.filter((frame) => frame.included !== false)
    if (!chosenFrames.length) {
      toast('info', 'No frames chosen', 'Choose at least one frame in the gallery before exporting.')
      return
    }
    const task = `Exporting ${project.name} frames`
    const controller = begin(task)
    try {
      const zip = new JSZip()
      for (let index = 0; index < chosenFrames.length; index += 1) {
        if (controller.signal.aborted) throw new DOMException('Canceled', 'AbortError')
        const frame = chosenFrames[index]
        zip.file(
          `${orderedFrameName(project.name, index)}.png`,
          await processChromaBlob(frame.blob, project.chroma),
        )
        progress(task, (index + 1) / chosenFrames.length * 0.8, `Processing frame ${index + 1}`)
      }
      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
      downloadBlob(blob, `${project.name}-frames.zip`)
      toast('success', 'Frame sequence exported', `${chosenFrames.length} chosen PNG frames`)
    } catch (error) {
      if ((error as Error).name !== 'AbortError') toast('error', 'Export failed', (error as Error).message)
    } finally {
      finish()
    }
  }, [activeProject, begin, finish, progress, toast])

  const exportZip = useCallback(async () => {
    if (!activeProject) return
    const project = activeProject
    try {
      const sheet = await ensureSheet()
      finish()
      const task = `Packaging ${project.name}`
      const controller = begin(task)
      const blob = await createProjectZip(
        project,
        sheet,
        preferences.exportMetadata,
        preferences.includePhaser,
        controller.signal,
        (value, detail) => progress(task, value, detail),
      )
      downloadBlob(blob, `${project.name}-sprite-package.zip`)
      toast('success', 'Game-ready package exported', 'Sprite sheet, frames, metadata and sample code included.')
    } catch (error) {
      if ((error as Error).name !== 'AbortError') toast('error', 'Package export failed', (error as Error).message)
    } finally {
      finish()
    }
  }, [activeProject, begin, ensureSheet, finish, preferences, progress, toast])

  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      const typing = target?.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target?.tagName)
      const activatingControl = ['BUTTON', 'A'].includes(target?.tagName)
      if (event.code === 'Space' && !typing && !activatingControl) {
        event.preventDefault()
        window.dispatchEvent(new Event('spriteforge:toggle-play'))
      }
      if (!activeProject || typing) return
      if (!activatingControl && event.key === 'ArrowLeft') setFrameIndex((value) => Math.max(0, value - 1))
      if (!activatingControl && event.key === 'ArrowRight') setFrameIndex((value) => Math.max(0, Math.min(activeProject.frames.length - 1, value + 1)))
      if ((event.ctrlKey || event.metaKey) && ['z', 'y', 's'].includes(event.key.toLowerCase()) && processing.active) {
        event.preventDefault()
        return
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); undo() }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); redo() }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); void exportZip() }
    }
    window.addEventListener('keydown', keyboard)
    return () => window.removeEventListener('keydown', keyboard)
  }, [activeProject, exportZip, processing.active, redo, undo])

  const openImport = () => inputRef.current?.click()
  const openSample = async () => {
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}samples/chroma-bot.webm`)
      if (!response.ok) throw new Error('The bundled sample could not be loaded.')
      const file = new File([await response.blob()], 'chroma-bot.webm', { type: 'video/webm' })
      await importFiles([file])
    } catch (error) {
      toast('error', 'Could not open sample', (error as Error).message)
    }
  }

  return (
    <div className="app-shell">
      <TopBar onImport={openImport} onExport={() => void exportZip()} />
      <div className={`workspace ${activeProject ? 'has-project' : ''}`}>
        <ProjectRail onImport={openImport} />
        {activeProject ? (
          <>
            <PreviewPanel
              project={activeProject}
              frameIndex={Math.max(0, Math.min(frameIndex, Math.max(0, activeProject.frames.length - 1)))}
              setFrameIndex={setFrameIndex}
              view={view}
              setView={setView}
              onColorPick={(color) => updateProject(activeProject.id, { chroma: { ...activeProject.chroma, color }, sheetResult: undefined })}
              onAnimationFpsChange={(fps) => {
                if (processing.active) return
                const animation = { ...activeProject.animation, fps }
                updateProject(activeProject.id, { animation })
                updatePreferences({ lastAnimation: animation })
              }}
              disabled={processing.active}
            />
            <Inspector
              onExtract={() => void extract()}
              onGenerate={() => void generate()}
              onExportSheet={() => void exportSheet()}
              onExportFrames={() => void exportFrames()}
              onExportZip={() => void exportZip()}
              onShowView={setView}
            />
            <FrameTimeline frameIndex={frameIndex} setFrameIndex={setFrameIndex} />
          </>
        ) : (
          <>
            <EmptyWorkspace disabled={processing.active} onFiles={(files) => void importFiles(files)} onSample={() => void openSample()} />
            <Inspector
              onExtract={() => undefined}
              onGenerate={() => undefined}
              onExportSheet={() => undefined}
              onExportFrames={() => undefined}
              onExportZip={() => undefined}
              onShowView={setView}
            />
          </>
        )}
      </div>
      <ProcessingBar />
      <ToastStack toasts={toasts} dismiss={(id) => setToasts((items) => items.filter((item) => item.id !== id))} />
      <input
        ref={inputRef}
        type="file"
        hidden
        multiple
        accept="video/mp4,video/quicktime,video/x-msvideo,video/webm,.mkv"
        onChange={(event) => void importFiles(Array.from(event.target.files ?? []))}
      />
      {processing.active && <div className="processing-shimmer" />}
    </div>
  )
}

export function App() {
  return <AppContent />
}
