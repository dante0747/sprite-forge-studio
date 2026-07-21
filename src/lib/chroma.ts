import type { ChromaSettings } from '../types/editor'
import { hexToRgb } from './format'

let worker: Worker | undefined
const requests = new Map<
  string,
  { resolve: (pixels: Uint8ClampedArray) => void; reject: (error: Error) => void }
>()

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('../workers/chroma.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = ({ data }: MessageEvent<{ id: string; buffer: ArrayBuffer }>) => {
      const request = requests.get(data.id)
      if (!request) return
      request.resolve(new Uint8ClampedArray(data.buffer))
      requests.delete(data.id)
    }
    worker.onerror = () => {
      requests.forEach(({ reject }) => reject(new Error('Background removal worker failed.')))
      requests.clear()
      worker?.terminate()
      worker = undefined
    }
  }
  return worker
}

function processPixels(imageData: ImageData, settings: ChromaSettings) {
  const id = crypto.randomUUID()
  return new Promise<Uint8ClampedArray>((resolve, reject) => {
    requests.set(id, { resolve, reject })
    const buffer = imageData.data.buffer.slice(0)
    getWorker().postMessage(
      {
        id,
        buffer,
        width: imageData.width,
        height: imageData.height,
        key: hexToRgb(settings.color),
        tolerance: settings.tolerance,
        softness: settings.softness,
        feather: settings.feather,
        noiseReduction: settings.noiseReduction,
        spillSuppression: settings.spillSuppression,
      },
      [buffer],
    )
  })
}

export async function processChromaBlob(blob: Blob, settings: ChromaSettings) {
  if (!settings.enabled) return blob
  const bitmap = await createImageBitmap(blob)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Canvas rendering is not available.')
  context.drawImage(bitmap, 0, 0)
  bitmap.close()
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
  const processed = await processPixels(imageData, settings)
  const pixels = new Uint8ClampedArray(processed.length)
  pixels.set(processed)
  context.putImageData(new ImageData(pixels, canvas.width, canvas.height), 0, 0)
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error('Could not encode transparency.'))),
      'image/png',
    ),
  )
}

export async function processCanvasSource(
  source: CanvasImageSource,
  width: number,
  height: number,
  settings: ChromaSettings,
) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Canvas rendering is not available.')
  context.drawImage(source, 0, 0, width, height)
  if (settings.enabled) {
    const imageData = context.getImageData(0, 0, width, height)
    const processed = await processPixels(imageData, settings)
    const pixels = new Uint8ClampedArray(processed.length)
    pixels.set(processed)
    context.putImageData(new ImageData(pixels, width, height), 0, 0)
  }
  return canvas
}
