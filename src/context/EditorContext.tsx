import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { defaultPreferences } from '../lib/defaults'
import type {
  FrameItem,
  ProcessingState,
  UserPreferences,
  VideoProject,
} from '../types/editor'

const emptyProcessing: ProcessingState = {
  active: false,
  progress: 0,
  task: '',
  detail: '',
  startedAt: 0,
}

interface EditorContextValue {
  projects: VideoProject[]
  activeProject?: VideoProject
  activeId?: string
  processing: ProcessingState
  preferences: UserPreferences
  addProject: (project: VideoProject) => void
  removeProject: (id: string) => void
  setActiveId: (id: string) => void
  updateProject: (id: string, update: Partial<VideoProject>) => void
  updateFrames: (id: string, frames: FrameItem[], record?: boolean) => void
  undo: () => void
  redo: () => void
  setProcessing: (processing: ProcessingState) => void
  updatePreferences: (update: Partial<UserPreferences>) => void
}

const EditorContext = createContext<EditorContextValue | null>(null)

export function EditorProvider({ children }: PropsWithChildren) {
  const [projects, setProjects] = useState<VideoProject[]>([])
  const [activeId, setActiveIdState] = useState<string>()
  const [processing, setProcessing] = useState<ProcessingState>(emptyProcessing)
  const [preferences, setPreferences] = useState<UserPreferences>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('spriteforge:prefs') ?? '{}') as Partial<UserPreferences>
      return {
        ...defaultPreferences,
        ...saved,
        lastChroma: { ...defaultPreferences.lastChroma, ...saved.lastChroma },
        lastSheet: { ...defaultPreferences.lastSheet, ...saved.lastSheet },
        lastAnimation: { ...defaultPreferences.lastAnimation, ...saved.lastAnimation },
        lastSampling: { ...defaultPreferences.lastSampling, ...saved.lastSampling },
      }
    } catch {
      return defaultPreferences
    }
  })
  const history = useRef(new Map<string, { past: FrameItem[][]; future: FrameItem[][] }>())

  useEffect(() => {
    localStorage.setItem('spriteforge:prefs', JSON.stringify(preferences))
  }, [preferences])

  const addProject = useCallback((project: VideoProject) => {
    setProjects((current) => [...current, project])
    setActiveIdState(project.id)
    history.current.set(project.id, { past: [], future: [] })
  }, [])

  const removeProject = useCallback((id: string) => {
    setProjects((current) => {
      const target = current.find((project) => project.id === id)
      if (target) {
        URL.revokeObjectURL(target.url)
        target.frames.forEach((frame) => URL.revokeObjectURL(frame.url))
        if (target.sheetResult) URL.revokeObjectURL(target.sheetResult.url)
      }
      const next = current.filter((project) => project.id !== id)
      setActiveIdState((active) => (active === id ? next[0]?.id : active))
      return next
    })
    history.current.delete(id)
  }, [])

  const updateProject = useCallback((id: string, update: Partial<VideoProject>) => {
    setProjects((current) =>
      current.map((project) => (project.id === id ? { ...project, ...update } : project)),
    )
  }, [])

  const updateFrames = useCallback((id: string, frames: FrameItem[], record = true) => {
    setProjects((current) =>
      current.map((project) => {
        if (project.id !== id) return project
        if (record) {
          const item = history.current.get(id) ?? { past: [], future: [] }
          item.past = [...item.past.slice(-29), project.frames]
          item.future = []
          history.current.set(id, item)
        }
        return { ...project, frames, sheetResult: undefined }
      }),
    )
  }, [])

  const travel = useCallback(
    (direction: 'undo' | 'redo') => {
      if (!activeId) return
      setProjects((current) =>
        current.map((project) => {
          if (project.id !== activeId) return project
          const item = history.current.get(activeId) ?? { past: [], future: [] }
          const source = direction === 'undo' ? item.past : item.future
          const destination = direction === 'undo' ? item.future : item.past
          const next = source.at(-1)
          if (!next) return project
          source.pop()
          destination.push(project.frames)
          history.current.set(activeId, item)
          return { ...project, frames: next, sheetResult: undefined }
        }),
      )
    },
    [activeId],
  )

  const updatePreferences = useCallback((update: Partial<UserPreferences>) => {
    setPreferences((current) => ({ ...current, ...update }))
  }, [])

  const value = useMemo<EditorContextValue>(
    () => ({
      projects,
      activeId,
      activeProject: projects.find((project) => project.id === activeId),
      processing,
      preferences,
      addProject,
      removeProject,
      setActiveId: setActiveIdState,
      updateProject,
      updateFrames,
      undo: () => travel('undo'),
      redo: () => travel('redo'),
      setProcessing,
      updatePreferences,
    }),
    [
      projects,
      activeId,
      processing,
      preferences,
      addProject,
      removeProject,
      updateProject,
      updateFrames,
      travel,
      updatePreferences,
    ],
  )

  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>
}

export function useEditor() {
  const value = useContext(EditorContext)
  if (!value) throw new Error('useEditor must be used inside EditorProvider')
  return value
}
