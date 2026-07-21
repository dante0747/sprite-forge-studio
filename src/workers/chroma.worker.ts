interface ChromaMessage {
  id: string
  buffer: ArrayBuffer
  width: number
  height: number
  key: { r: number; g: number; b: number }
  tolerance: number
  softness: number
  feather: number
  noiseReduction: number
  spillSuppression: number
}

function blurAlpha(data: Uint8ClampedArray, width: number, height: number, radius: number) {
  if (radius <= 0) return
  const source = new Uint8ClampedArray(Math.ceil(data.length / 4))
  for (let pixel = 0; pixel < source.length; pixel += 1) source[pixel] = data[pixel * 4 + 3]
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let total = 0
      let count = 0
      for (let offset = -radius; offset <= radius; offset += 1) {
        const sampleX = Math.max(0, Math.min(width - 1, x + offset))
        total += source[y * width + sampleX]
        count += 1
      }
      data[(y * width + x) * 4 + 3] = total / count
    }
  }
  const horizontal = new Uint8ClampedArray(source.length)
  for (let pixel = 0; pixel < horizontal.length; pixel += 1) horizontal[pixel] = data[pixel * 4 + 3]
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let total = 0
      let count = 0
      for (let offset = -radius; offset <= radius; offset += 1) {
        const sampleY = Math.max(0, Math.min(height - 1, y + offset))
        total += horizontal[sampleY * width + x]
        count += 1
      }
      data[(y * width + x) * 4 + 3] = total / count
    }
  }
}

self.onmessage = ({ data: message }: MessageEvent<ChromaMessage>) => {
  const pixels = new Uint8ClampedArray(message.buffer)
  const threshold = message.tolerance * 4.42
  const transition = Math.max(1, message.softness * 2.55)
  const spill = message.spillSuppression / 100
  const dominantKey =
    message.key.g >= message.key.r && message.key.g >= message.key.b
      ? 1
      : message.key.r >= message.key.b
        ? 0
        : 2

  for (let index = 0; index < pixels.length; index += 4) {
    const redDelta = pixels[index] - message.key.r
    const greenDelta = pixels[index + 1] - message.key.g
    const blueDelta = pixels[index + 2] - message.key.b
    const distance = Math.sqrt(redDelta ** 2 + greenDelta ** 2 + blueDelta ** 2)
    const alpha = Math.max(0, Math.min(1, (distance - threshold) / transition))
    pixels[index + 3] = Math.round(pixels[index + 3] * alpha)

    if (alpha < 1 && spill > 0) {
      const channels = [pixels[index], pixels[index + 1], pixels[index + 2]]
      const otherAverage =
        (channels[(dominantKey + 1) % 3] + channels[(dominantKey + 2) % 3]) / 2
      const channelIndex = index + dominantKey
      pixels[channelIndex] = Math.round(
        pixels[channelIndex] + (otherAverage - pixels[channelIndex]) * (1 - alpha) * spill,
      )
    }
    if (message.noiseReduction > 0 && pixels[index + 3] < message.noiseReduction * 1.5) {
      pixels[index + 3] = 0
    }
  }
  blurAlpha(pixels, message.width, message.height, Math.min(5, Math.round(message.feather)))
  self.postMessage({ id: message.id, buffer: pixels.buffer }, { transfer: [pixels.buffer] })
}

export {}
