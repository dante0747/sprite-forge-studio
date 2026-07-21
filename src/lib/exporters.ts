import JSZip from 'jszip'
import type { ExportMetadata, SpriteSheetResult, VideoProject } from '../types/editor'
import { processChromaBlob } from './chroma'

export function projectMetadata(project: VideoProject, sheet: SpriteSheetResult) {
  return {
    app: 'SpriteForge Studio',
    version: 1,
    image: `${project.name}.png`,
    frameWidth: sheet.cellWidth,
    frameHeight: sheet.cellHeight,
    frames: sheet.frames.length,
    columns: sheet.columns,
    rows: sheet.rows,
    sheetWidth: sheet.width,
    sheetHeight: sheet.height,
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
        [frame.name, frame.x, frame.y, frame.width, frame.height].join(','),
      ),
    ].join('\n')
  }
  const frames = sheet.frames
    .map(
      (frame) =>
        `    <frame name="${frame.name}" x="${frame.x}" y="${frame.y}" width="${frame.width}" height="${frame.height}" />`,
    )
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<spriteSheet image="${project.name}.png" frameWidth="${sheet.cellWidth}" frameHeight="${sheet.cellHeight}" frameRate="${project.animation.fps}">\n  <frames>\n${frames}\n  </frames>\n</spriteSheet>\n`
}

export function phaserExample(project: VideoProject, sheet: SpriteSheetResult) {
  const key = project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  return `// Phaser 3 loader and animation setup\nthis.load.spritesheet('${key}', '${project.name}.png', {\n  frameWidth: ${sheet.cellWidth},\n  frameHeight: ${sheet.cellHeight}\n});\n\nthis.anims.create({\n  key: '${key}',\n  frames: this.anims.generateFrameNumbers('${key}'),\n  frameRate: ${project.animation.fps},\n  repeat: -1\n});\n`
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
  zip.file(`${project.name}.png`, sheet.blob)
  const framesFolder = zip.folder('frames')
  for (let index = 0; index < project.frames.length; index += 1) {
    if (signal.aborted) throw new DOMException('Canceled', 'AbortError')
    const frame = project.frames[index]
    const blob = await processChromaBlob(frame.blob, project.chroma)
    framesFolder?.file(`${frame.name}.png`, blob)
    onProgress((index + 1) / project.frames.length * 0.7, `Encoding frame ${index + 1}`)
  }
  zip.file(`metadata.${format}`, serializeMetadata(project, sheet, format))
  if (includePhaser) zip.file('phaser-example.js', phaserExample(project, sheet))
  zip.file(
    'README.txt',
    `Exported by SpriteForge Studio\nAnimation: ${project.name}\nFrames: ${project.frames.length}\nFrame size: ${sheet.cellWidth}x${sheet.cellHeight}\n`,
  )
  return zip.generateAsync(
    { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } },
    ({ percent }) => onProgress(0.7 + (percent / 100) * 0.3, 'Compressing package'),
  )
}
