import type {
  AnimationSettings,
  ChromaSettings,
  ExtractionSettings,
  SheetSettings,
  TrimSettings,
  UserPreferences,
  VideoMetadata,
  VideoProject,
} from '../types/editor'

export const defaultExtraction = (metadata: VideoMetadata): ExtractionSettings => ({
  mode: 'range',
  exactFrames: Math.min(30, Math.max(1, metadata.estimatedFrames)),
  interval: 1,
  fpsOverride: null,
})

export const defaultTrim = (metadata: VideoMetadata): TrimSettings => ({
  startTime: 0,
  endTime: metadata.duration,
})

export const defaultChroma: ChromaSettings = {
  enabled: true,
  color: '#ff00ff',
  tolerance: 32,
  softness: 18,
  feather: 1,
  noiseReduction: 0,
  spillSuppression: 55,
  previewBackground: 'checker',
}

export const defaultSheet: SheetSettings = {
  layout: 'automatic',
  rows: 4,
  columns: 8,
  frameMarginTop: 2,
  frameMarginRight: 2,
  frameMarginBottom: 2,
  frameMarginLeft: 2,
  spacing: 2,
  margin: 4,
  background: 'transparent',
  customColor: '#111827',
  alignment: 'center',
  cellMode: 'automatic',
  cellWidth: 256,
  cellHeight: 256,
  trim: true,
  uniformCells: true,
  powerOfTwo: 0,
}

export const defaultAnimation: AnimationSettings = {
  fps: 12,
  loopMode: 'loop',
  reverse: false,
}

export const defaultPreferences: UserPreferences = {
  exportMetadata: 'json',
  includePhaser: true,
  compactMode: false,
  lastChroma: { ...defaultChroma },
  lastSheet: { ...defaultSheet },
  lastAnimation: { ...defaultAnimation },
  lastSampling: { interval: 1, fpsOverride: null },
}

export function createProject(
  file: File,
  url: string,
  metadata: VideoMetadata,
  preferences: UserPreferences = defaultPreferences,
): VideoProject {
  return {
    id: crypto.randomUUID(),
    name: file.name.replace(/\.[^.]+$/, ''),
    file,
    url,
    metadata,
    status: 'ready',
    frames: [],
    trim: defaultTrim(metadata),
    extraction: { ...defaultExtraction(metadata), ...preferences.lastSampling },
    chroma: { ...defaultChroma, ...preferences.lastChroma },
    sheet: { ...defaultSheet, ...preferences.lastSheet },
    animation: { ...defaultAnimation, ...preferences.lastAnimation },
    createdAt: Date.now(),
  }
}
