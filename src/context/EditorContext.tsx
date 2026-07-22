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
  canUndo: boolean
  canRedo: boolean
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
  const [historyAvailability, setHistoryAvailability] = useState(
    new Map<string, { canUndo: boolean; canRedo: boolean }>(),
  )
  const [preferences, setPreferences] = useState<UserPreferences>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('spriteforge:prefs') ?? '{}') as Partial<UserPreferences>
      const savedSheet = (saved.lastSheet ?? {}) as Partial<UserPreferences['lastSheet']> & { padding?: number }
      const legacyFrameMargin = Number.isFinite(savedSheet.padding)
        ? Math.max(0, Math.round(savedSheet.padding!))
        : undefined
      const savedSheetSettings = Object.fromEntries(
        Object.entries(savedSheet).filter(([key]) => key !== 'padding'),
      ) as Partial<UserPreferences['lastSheet']>
      return {
        ...defaultPreferences,
        ...saved,
        lastChroma: { ...defaultPreferences.lastChroma, ...saved.lastChroma },
        lastSheet: {
          ...defaultPreferences.lastSheet,
          ...(legacyFrameMargin === undefined ? {} : {
            frameMarginTop: legacyFrameMargin,
            frameMarginRight: legacyFrameMargin,
            frameMarginBottom: legacyFrameMargin,
            frameMarginLeft: legacyFrameMargin,
          }),
          ...savedSheetSettings,
        },
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
    setHistoryAvailability((current) => new Map(current).set(project.id, { canUndo: false, canRedo: false }))
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
    setHistoryAvailability((current) => {
      const next = new Map(current)
      next.delete(id)
      return next
    })
  }, [])

  const updateProject = useCallback((id: string, update: Partial<VideoProject>) => {
    setProjects((current) =>
      current.map((project) => {
        if (project.id !== id) return project
        if (
          Object.prototype.hasOwnProperty.call(update, 'sheetResult') &&
          project.sheetResult &&
          project.sheetResult !== update.sheetResult
        ) {
          URL.revokeObjectURL(project.sheetResult.url)
        }
        return { ...project, ...update }
      }),
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
        if (project.sheetResult) URL.revokeObjectURL(project.sheetResult.url)
        return { ...project, frames, sheetResult: undefined }
      }),
    )
    if (record) {
      setHistoryAvailability((current) => new Map(current).set(id, { canUndo: true, canRedo: false }))
    }
  }, [])

  const travel = useCallback(
    (direction: 'undo' | 'redo') => {
      if (!activeId) return
      const item = history.current.get(activeId)
      const source = direction === 'undo' ? item?.past : item?.future
      if (!item || !source?.length) return
      setHistoryAvailability((current) => new Map(current).set(activeId, {
        canUndo: direction === 'undo' ? source.length > 1 : true,
        canRedo: direction === 'redo' ? source.length > 1 : true,
      }))
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
          if (project.sheetResult) URL.revokeObjectURL(project.sheetResult.url)
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
      canUndo: Boolean(activeId && historyAvailability.get(activeId)?.canUndo),
      canRedo: Boolean(activeId && historyAvailability.get(activeId)?.canRedo),
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
      historyAvailability,
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
