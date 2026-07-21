export type PreviewBackground = 'checker' | 'black' | 'white' | 'transparent'
export type Alignment = 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
export type ExportMetadata = 'json' | 'xml' | 'csv'
export type ProjectStatus = 'ready' | 'loading' | 'processing' | 'error'

export interface VideoMetadata {
  width: number
  height: number
  duration: number
  fps: number
  estimatedFrames: number
  codec?: string
}

export interface ExtractionSettings {
  startFrame: number
  endFrame: number
  mode: 'range' | 'exact'
  exactFrames: number
  interval: number
  fpsOverride: number | null
}

export interface ChromaSettings {
  enabled: boolean
  color: string
  tolerance: number
  softness: number
  feather: number
  noiseReduction: number
  spillSuppression: number
  previewBackground: PreviewBackground
}

export interface SheetSettings {
  layout: 'automatic' | 'manual'
  rows: number
  columns: number
  padding: number
  margin: number
  background: 'transparent' | 'black' | 'white' | 'custom'
  customColor: string
  alignment: Alignment
  cellMode: 'automatic' | 'manual'
  cellWidth: number
  cellHeight: number
  trim: boolean
  uniformCells: boolean
  powerOfTwo: 0 | 256 | 512 | 1024 | 2048 | 4096
}

export interface AnimationSettings {
  fps: number
  loopMode: 'loop' | 'ping-pong' | 'once'
  reverse: boolean
}

export interface FrameItem {
  id: string
  name: string
  blob: Blob
  url: string
  width: number
  height: number
  selected: boolean
}

export interface SpriteSheetResult {
  blob: Blob
  url: string
  width: number
  height: number
  cellWidth: number
  cellHeight: number
  rows: number
  columns: number
  frames: Array<{ name: string; x: number; y: number; width: number; height: number }>
}

export interface VideoProject {
  id: string
  name: string
  file: File
  url: string
  metadata: VideoMetadata
  status: ProjectStatus
  error?: string
  frames: FrameItem[]
  extraction: ExtractionSettings
  chroma: ChromaSettings
  sheet: SheetSettings
  animation: AnimationSettings
  sheetResult?: SpriteSheetResult
  createdAt: number
}

export interface ProcessingState {
  active: boolean
  progress: number
  task: string
  detail: string
  startedAt: number
  cancel?: () => void
}

export interface UserPreferences {
  exportMetadata: ExportMetadata
  includePhaser: boolean
  compactMode: boolean
  lastChroma: ChromaSettings
  lastSheet: SheetSettings
  lastAnimation: AnimationSettings
  lastSampling: Pick<ExtractionSettings, 'interval' | 'fpsOverride'>
}
