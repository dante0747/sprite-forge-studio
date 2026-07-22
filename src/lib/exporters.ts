import JSZip from 'jszip'
import type { ExportMetadata, SpriteSheetResult, VideoProject } from '../types/editor'
import { processChromaBlob } from './chroma'

const escapeCsv = (value: string | number) => {
  const text = String(value)
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

const escapeXml = (value: string) => value
  .replaceAll('&', '&amp;')
  .replaceAll('"', '&quot;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')

const exactPixel = (value: number) => Math.max(0, Math.round(value))

export const orderedFrameName = (projectName: string, index: number) =>
  `${projectName}_${String(index + 1).padStart(2, '0')}`

export function projectMetadata(project: VideoProject, sheet: SpriteSheetResult) {
  return {
    app: 'SpriteForge Studio',
    version: 2,
    image: `${project.name}.png`,
    frameWidth: sheet.cellWidth,
    frameHeight: sheet.cellHeight,
    frames: sheet.frames.length,
    columns: sheet.columns,
    rows: sheet.rows,
    sheetWidth: sheet.width,
    sheetHeight: sheet.height,
    frameMargins: {
      top: exactPixel(project.sheet.frameMarginTop),
      right: exactPixel(project.sheet.frameMarginRight),
      bottom: exactPixel(project.sheet.frameMarginBottom),
      left: exactPixel(project.sheet.frameMarginLeft),
    },
    frameSpacing: exactPixel(project.sheet.spacing),
    sheetMargin: exactPixel(project.sheet.margin),
    frameRate: project.animation.fps,
    frameData: sheet.frames,
  }
}

export function serializeMetadata(
  project: VideoProject,
  sheet: SpriteSheetResult,
  format: ExportMetadata,
) {
  const metadata = projectMetadata(project, sheet)
  if (format === 'json') return JSON.stringify(metadata, null, 2)
  if (format === 'csv') {
    return [
      'name,x,y,width,height',
      ...sheet.frames.map((frame) =>
        [frame.name, frame.x, frame.y, frame.width, frame.height].map(escapeCsv).join(','),
      ),
    ].join('\n')
  }
  const frames = sheet.frames
    .map(
      (frame) =>
        `    <frame name="${escapeXml(frame.name)}" x="${frame.x}" y="${frame.y}" width="${frame.width}" height="${frame.height}" />`,
    )
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<spriteSheet image="${escapeXml(project.name)}.png" frameWidth="${sheet.cellWidth}" frameHeight="${sheet.cellHeight}" frameRate="${project.animation.fps}">\n  <frames>\n${frames}\n  </frames>\n</spriteSheet>\n`
}

export function phaserExample(project: VideoProject, sheet: SpriteSheetResult) {
  const key = project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'animation'
  const orderedFrames = project.animation.reverse ? [...sheet.frames].reverse() : sheet.frames
  const animationFrames = orderedFrames.map((frame) => ({ key, frame: frame.name }))
  const repeat = project.animation.loopMode === 'once' ? 0 : -1
  return `// Phaser 3 atlas loader and animation setup\n// Atlas regions include exact per-side frame margins; spacing remains outside each frame.\nthis.load.atlas(${JSON.stringify(key)}, ${JSON.stringify(`${project.name}.png`)}, 'phaser-atlas.json');\n\nthis.anims.create({\n  key: ${JSON.stringify(key)},\n  frames: ${JSON.stringify(animationFrames, null, 2)},\n  frameRate: ${project.animation.fps},\n  repeat: ${repeat},\n  yoyo: ${project.animation.loopMode === 'ping-pong'}\n});\n`
}

export function phaserAtlas(project: VideoProject, sheet: SpriteSheetResult) {
  return JSON.stringify({
    frames: Object.fromEntries(sheet.frames.map((frame) => [
      frame.name,
      {
        frame: { x: frame.x, y: frame.y, w: frame.width, h: frame.height },
        rotated: false,
        trimmed: false,
        spriteSourceSize: { x: 0, y: 0, w: frame.width, h: frame.height },
        sourceSize: { w: frame.width, h: frame.height },
      },
    ])),
    meta: {
      app: 'SpriteForge Studio',
      version: '1.0',
      image: `${project.name}.png`,
      format: 'RGBA8888',
      size: { w: sheet.width, h: sheet.height },
      scale: '1',
    },
  }, null, 2)
}

export async function createProjectZip(
  project: VideoProject,
  sheet: SpriteSheetResult,
  format: ExportMetadata,
  includePhaser: boolean,
  signal: AbortSignal,
  onProgress: (progress: number, detail: string) => void,
) {
  const zip = new JSZip()
  const chosenFrames = project.frames.filter((frame) => frame.included !== false)
  if (!chosenFrames.length) throw new Error('Choose at least one frame before exporting a package.')
  zip.file(`${project.name}.png`, sheet.blob)
  const framesFolder = zip.folder('frames')
  for (let index = 0; index < chosenFrames.length; index += 1) {
    if (signal.aborted) throw new DOMException('Canceled', 'AbortError')
    const frame = chosenFrames[index]
    const blob = await processChromaBlob(frame.blob, project.chroma)
    framesFolder?.file(`${orderedFrameName(project.name, index)}.png`, blob)
    onProgress((index + 1) / chosenFrames.length * 0.7, `Encoding frame ${index + 1}`)
  }
  zip.file(`metadata.${format}`, serializeMetadata(project, sheet, format))
  if (includePhaser) {
    zip.file('phaser-atlas.json', phaserAtlas(project, sheet))
    zip.file('phaser-example.js', phaserExample(project, sheet))
  }
  zip.file(
    'README.txt',
    `Exported by SpriteForge Studio\nAnimation: ${project.name}\nChosen frames: ${chosenFrames.length} of ${project.frames.length}\nLargest frame region: ${sheet.cellWidth}x${sheet.cellHeight}\nFrame margins (top/right/bottom/left): ${exactPixel(project.sheet.frameMarginTop)}px / ${exactPixel(project.sheet.frameMarginRight)}px / ${exactPixel(project.sheet.frameMarginBottom)}px / ${exactPixel(project.sheet.frameMarginLeft)}px\nSpace between frames: ${exactPixel(project.sheet.spacing)}px\nMinimum sheet-edge margin: ${exactPixel(project.sheet.margin)}px\n`,
  )
  return zip.generateAsync(
    { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } },
    ({ percent }) => onProgress(0.7 + (percent / 100) * 0.3, 'Compressing package'),
  )
}
