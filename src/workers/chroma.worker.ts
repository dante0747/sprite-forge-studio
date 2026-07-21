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

const clampByte = (value: number) => Math.max(0, Math.min(255, Math.round(value)))

function smoothstep(min: number, max: number, value: number) {
  const normalized = Math.max(0, Math.min(1, (value - min) / Math.max(0.0001, max - min)))
  return normalized * normalized * (3 - 2 * normalized)
}

function cleanMatte(
  matte: Uint8ClampedArray,
  width: number,
  height: number,
  amount: number,
) {
  if (amount <= 0) return matte
  const source = new Uint8ClampedArray(matte)
  const radius = amount > 66 ? 2 : 1
  const blend = Math.min(0.9, amount / 100)
  const requiredRatio = 0.88 - blend * 0.23

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let transparent = 0
      let opaque = 0
      let samples = 0
      for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
        const sampleY = Math.max(0, Math.min(height - 1, y + offsetY))
        for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
          const sampleX = Math.max(0, Math.min(width - 1, x + offsetX))
          const alpha = source[sampleY * width + sampleX]
          if (alpha <= 24) transparent += 1
          if (alpha >= 231) opaque += 1
          samples += 1
        }
      }

      const index = y * width + x
      if (transparent / samples >= requiredRatio) {
        matte[index] = Math.round(source[index] * (1 - blend))
      } else if (opaque / samples >= requiredRatio) {
        matte[index] = Math.round(source[index] + (255 - source[index]) * blend)
      }
    }
  }
  return matte
}

function gaussianFeather(
  matte: Uint8ClampedArray,
  width: number,
  height: number,
  amount: number,
) {
  if (amount <= 0) return matte
  const sigma = Math.max(0.55, amount * 0.72)
  const radius = Math.max(1, Math.ceil(sigma * 2.25))
  const weights = new Float32Array(radius * 2 + 1)
  let weightTotal = 0
  for (let offset = -radius; offset <= radius; offset += 1) {
    const weight = Math.exp(-(offset * offset) / (2 * sigma * sigma))
    weights[offset + radius] = weight
    weightTotal += weight
  }
  for (let index = 0; index < weights.length; index += 1) weights[index] /= weightTotal

  const horizontal = new Float32Array(matte.length)
  const output = new Uint8ClampedArray(matte.length)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let value = 0
      for (let offset = -radius; offset <= radius; offset += 1) {
        const sampleX = Math.max(0, Math.min(width - 1, x + offset))
        value += matte[y * width + sampleX] * weights[offset + radius]
      }
      horizontal[y * width + x] = value
    }
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let value = 0
      for (let offset = -radius; offset <= radius; offset += 1) {
        const sampleY = Math.max(0, Math.min(height - 1, y + offset))
        value += horizontal[sampleY * width + x] * weights[offset + radius]
      }
      output[y * width + x] = value
    }
  }
  return output
}

self.onmessage = ({ data: message }: MessageEvent<ChromaMessage>) => {
  const pixels = new Uint8ClampedArray(message.buffer)
  const pixelCount = message.width * message.height
  const matte = new Uint8ClampedArray(pixelCount)
  const sourceAlpha = new Uint8ClampedArray(pixelCount)

  const keyY =
    message.key.r * 0.2126 + message.key.g * 0.7152 + message.key.b * 0.0722
  const keyCb = (message.key.b - keyY) * 0.5389
  const keyCr = (message.key.r - keyY) * 0.635
  const keyChroma = Math.sqrt(keyCb * keyCb + keyCr * keyCr)
  const neutralKey = keyChroma < 12
  const innerRadius = 1.5 + message.tolerance * 0.76
  const outerRadius = innerRadius + 1 + message.softness * 1.35

  for (let pixel = 0, index = 0; pixel < pixelCount; pixel += 1, index += 4) {
    const red = pixels[index]
    const green = pixels[index + 1]
    const blue = pixels[index + 2]
    const alpha = pixels[index + 3]
    const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722
    const cb = (blue - luminance) * 0.5389
    const cr = (red - luminance) * 0.635
    const lumaWeight = neutralKey ? 0.72 : 0.12
    const lumaDelta = (luminance - keyY) * lumaWeight
    const cbDelta = cb - keyCb
    const crDelta = cr - keyCr
    const distance = Math.sqrt(
      lumaDelta * lumaDelta + cbDelta * cbDelta + crDelta * crDelta,
    )
    const foreground = smoothstep(innerRadius, outerRadius, distance)
    sourceAlpha[pixel] = alpha
    matte[pixel] = alpha * foreground
  }

  cleanMatte(matte, message.width, message.height, message.noiseReduction)
  const refinedMatte = gaussianFeather(
    matte,
    message.width,
    message.height,
    Math.min(5, message.feather),
  )

  const keyVectorRed = message.key.r - keyY
  const keyVectorGreen = message.key.g - keyY
  const keyVectorBlue = message.key.b - keyY
  const keyVectorLength = Math.max(
    1,
    Math.sqrt(
      keyVectorRed * keyVectorRed +
        keyVectorGreen * keyVectorGreen +
        keyVectorBlue * keyVectorBlue,
    ),
  )
  const unitRed = keyVectorRed / keyVectorLength
  const unitGreen = keyVectorGreen / keyVectorLength
  const unitBlue = keyVectorBlue / keyVectorLength
  const spill = message.spillSuppression / 100

  for (let pixel = 0, index = 0; pixel < pixelCount; pixel += 1, index += 4) {
    const alpha = Math.min(sourceAlpha[pixel], refinedMatte[pixel])
    pixels[index + 3] = alpha
    if (alpha <= 1) {
      pixels[index] = 0
      pixels[index + 1] = 0
      pixels[index + 2] = 0
      continue
    }
    if (spill <= 0 || neutralKey || alpha >= 254) continue

    const red = pixels[index]
    const green = pixels[index + 1]
    const blue = pixels[index + 2]
    const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722
    const projection = Math.max(
      0,
      (red - luminance) * unitRed +
        (green - luminance) * unitGreen +
        (blue - luminance) * unitBlue,
    )
    const edgeStrength = spill * Math.pow(1 - alpha / 255, 0.7)
    pixels[index] = clampByte(red - unitRed * projection * edgeStrength)
    pixels[index + 1] = clampByte(green - unitGreen * projection * edgeStrength)
    pixels[index + 2] = clampByte(blue - unitBlue * projection * edgeStrength)
  }

  self.postMessage({ id: message.id, buffer: pixels.buffer }, { transfer: [pixels.buffer] })
}

export {}
