import type {
  ChromaSettings,
  FrameItem,
  SheetSettings,
  SpriteSheetResult,
} from '../types/editor'
import { processChromaBlob } from './chroma'

interface PreparedFrame {
  frame: FrameItem
  bitmap: ImageBitmap
  sourceX: number
  sourceY: number
  width: number
  height: number
}

function canvasBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the sprite sheet.'))),
      'image/png',
    ),
  )
}

function trimBounds(bitmap: ImageBitmap) {
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return { x: 0, y: 0, width: bitmap.width, height: bitmap.height }
  context.drawImage(bitmap, 0, 0)
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
  let left = canvas.width
  let top = canvas.height
  let right = -1
  let bottom = -1
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      if (pixels[(y * canvas.width + x) * 4 + 3] > 3) {
        left = Math.min(left, x)
        top = Math.min(top, y)
        right = Math.max(right, x)
        bottom = Math.max(bottom, y)
      }
    }
  }
  if (right < left || bottom < top) return { x: 0, y: 0, width: 1, height: 1 }
  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 }
}

function alignmentOffset(
  alignment: SheetSettings['alignment'],
  cellWidth: number,
  cellHeight: number,
  width: number,
  height: number,
) {
  switch (alignment) {
    case 'top-left':
      return { x: 0, y: 0 }
    case 'top-right':
      return { x: cellWidth - width, y: 0 }
    case 'bottom-left':
      return { x: 0, y: cellHeight - height }
    case 'bottom-right':
      return { x: cellWidth - width, y: cellHeight - height }
    default:
      return { x: (cellWidth - width) / 2, y: (cellHeight - height) / 2 }
  }
}

export async function composeSpriteSheet(
  frames: FrameItem[],
  chroma: ChromaSettings,
  settings: SheetSettings,
  signal: AbortSignal,
  onProgress: (progress: number, detail: string) => void,
): Promise<SpriteSheetResult> {
  if (!frames.length) throw new Error('Extract at least one frame before generating a sheet.')
  const prepared: PreparedFrame[] = []

  try {
    for (let index = 0; index < frames.length; index += 1) {
      if (signal.aborted) throw new DOMException('Canceled', 'AbortError')
      const processed = await processChromaBlob(frames[index].blob, chroma)
      const bitmap = await createImageBitmap(processed)
      const bounds = settings.trim
        ? trimBounds(bitmap)
        : { x: 0, y: 0, width: bitmap.width, height: bitmap.height }
      prepared.push({
        frame: frames[index],
        bitmap,
        sourceX: bounds.x,
        sourceY: bounds.y,
        width: bounds.width,
        height: bounds.height,
      })
      onProgress((index + 1) / frames.length / 2, `Preparing frame ${index + 1} of ${frames.length}`)
      await new Promise((resolve) => setTimeout(resolve, 0))
    }

    const frameMarginTop = Math.max(0, Math.round(settings.frameMarginTop))
    const frameMarginRight = Math.max(0, Math.round(settings.frameMarginRight))
    const frameMarginBottom = Math.max(0, Math.round(settings.frameMarginBottom))
    const frameMarginLeft = Math.max(0, Math.round(settings.frameMarginLeft))
    const frameSpacing = Math.max(0, Math.round(settings.spacing))
    const sheetMargin = Math.max(0, Math.round(settings.margin))
    const baseCellWidth =
      settings.cellMode === 'manual'
        ? Math.max(1, Math.round(settings.cellWidth))
        : Math.max(...prepared.map((frame) => frame.width))
    const baseCellHeight =
      settings.cellMode === 'manual'
        ? Math.max(1, Math.round(settings.cellHeight))
        : Math.max(...prepared.map((frame) => frame.height))
    const baseRegionWidth = baseCellWidth + frameMarginLeft + frameMarginRight
    const baseRegionHeight = baseCellHeight + frameMarginTop + frameMarginBottom
    const columns =
      settings.layout === 'manual'
        ? Math.max(1, Math.round(settings.columns))
        : Math.max(1, Math.ceil(Math.sqrt((frames.length * baseRegionHeight) / baseRegionWidth)))
    const rows =
      settings.layout === 'manual'
        ? Math.max(Math.round(settings.rows), Math.ceil(frames.length / columns))
        : Math.ceil(frames.length / columns)
    const variableCells = settings.cellMode === 'automatic' && !settings.uniformCells
    const columnWidths = Array.from({ length: columns }, (_, column) =>
      variableCells
        ? Math.max(1, ...prepared.filter((_, index) => index % columns === column).map((frame) => frame.width))
        : baseCellWidth,
    )
    const rowHeights = Array.from({ length: rows }, (_, row) =>
      variableCells
        ? Math.max(1, ...prepared.filter((_, index) => Math.floor(index / columns) === row).map((frame) => frame.height))
        : baseCellHeight,
    )
    const contentWidth =
      sheetMargin * 2 +
      columnWidths.reduce((total, value) => total + value + frameMarginLeft + frameMarginRight, 0) +
      frameSpacing * Math.max(0, columns - 1)
    const contentHeight =
      sheetMargin * 2 +
      rowHeights.reduce((total, value) => total + value + frameMarginTop + frameMarginBottom, 0) +
      frameSpacing * Math.max(0, rows - 1)
    if (settings.powerOfTwo && (contentWidth > settings.powerOfTwo || contentHeight > settings.powerOfTwo)) {
      throw new Error(
        `The exact ${contentWidth}×${contentHeight}px layout does not fit inside ${settings.powerOfTwo}×${settings.powerOfTwo}px. Choose a larger texture or turn power-of-two off.`,
      )
    }
    const width = settings.powerOfTwo || contentWidth
    const height = settings.powerOfTwo || contentHeight
    if (width > 16384 || height > 16384 || width * height > 268_435_456) {
      throw new Error('The generated texture exceeds safe browser canvas limits. Use fewer columns or smaller cells.')
    }

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d', { alpha: true })
    if (!context) throw new Error('Canvas rendering is not available.')
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    if (settings.background !== 'transparent') {
      context.fillStyle =
        settings.background === 'custom' ? settings.customColor : settings.background
      context.fillRect(0, 0, width, height)
    }

    const contentOffsetX = settings.powerOfTwo ? Math.floor((width - contentWidth) / 2) : 0
    const contentOffsetY = settings.powerOfTwo ? Math.floor((height - contentHeight) / 2) : 0

    const resultFrames: SpriteSheetResult['frames'] = []
    for (let index = 0; index < prepared.length; index += 1) {
      if (signal.aborted) throw new DOMException('Canceled', 'AbortError')
      const frame = prepared[index]
      const column = index % columns
      const row = Math.floor(index / columns)
      const rawRegionX =
        sheetMargin +
        columnWidths.slice(0, column).reduce(
          (total, value) => total + value + frameMarginLeft + frameMarginRight,
          0,
        ) +
        frameSpacing * column
      const rawRegionY =
        sheetMargin +
        rowHeights.slice(0, row).reduce(
          (total, value) => total + value + frameMarginTop + frameMarginBottom,
          0,
        ) +
        frameSpacing * row
      const rawRegionWidth = columnWidths[column] + frameMarginLeft + frameMarginRight
      const rawRegionHeight = rowHeights[row] + frameMarginTop + frameMarginBottom
      const regionX = contentOffsetX + rawRegionX
      const regionY = contentOffsetY + rawRegionY
      const regionRight = regionX + rawRegionWidth
      const regionBottom = regionY + rawRegionHeight
      const cellX = regionX + frameMarginLeft
      const cellY = regionY + frameMarginTop
      const cellRight = cellX + columnWidths[column]
      const cellBottom = cellY + rowHeights[row]
      const cellWidth = Math.max(1, cellRight - cellX)
      const cellHeight = Math.max(1, cellBottom - cellY)
      const frameScale = Math.min(1, cellWidth / frame.width, cellHeight / frame.height)
      const drawWidth = Math.max(1, Math.round(frame.width * frameScale))
      const drawHeight = Math.max(1, Math.round(frame.height * frameScale))
      const offset = alignmentOffset(
        settings.alignment,
        cellWidth,
        cellHeight,
        drawWidth,
        drawHeight,
      )
      context.drawImage(
        frame.bitmap,
        frame.sourceX,
        frame.sourceY,
        frame.width,
        frame.height,
        Math.round(cellX + offset.x),
        Math.round(cellY + offset.y),
        drawWidth,
        drawHeight,
      )
      resultFrames.push({
        name: frame.frame.name,
        x: regionX,
        y: regionY,
        width: regionRight - regionX,
        height: regionBottom - regionY,
        contentX: cellX,
        contentY: cellY,
        contentWidth: cellWidth,
        contentHeight: cellHeight,
      })
      onProgress(0.5 + (index + 1) / frames.length / 2, `Packing frame ${index + 1} of ${frames.length}`)
    }
    const blob = await canvasBlob(canvas)
    return {
      blob,
      url: URL.createObjectURL(blob),
      width,
      height,
      cellWidth: Math.max(...resultFrames.map((frame) => frame.width)),
      cellHeight: Math.max(...resultFrames.map((frame) => frame.height)),
      rows,
      columns,
      frames: resultFrames,
    }
  } finally {
    prepared.forEach((frame) => frame.bitmap.close())
  }
}
