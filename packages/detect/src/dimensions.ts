export interface Dimensions {
  width: number
  height: number
}

type Reader = (bytes: Uint8Array) => Dimensions | null

const view = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

/** PNG: the IHDR chunk is always first, so width and height sit at bytes 16–23. */
const png: Reader = (bytes) => {
  if (bytes.length < 24) return null
  const v = view(bytes)
  return { width: v.getUint32(16), height: v.getUint32(20) }
}

/** JPEG: walk the segments to the first start-of-frame marker. */
const jpeg: Reader = (bytes) => {
  const v = view(bytes)
  let offset = 2
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xFF) return null
    const marker = bytes[offset + 1]!
    const isFrame = marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC
    if (isFrame) return { height: v.getUint16(offset + 5), width: v.getUint16(offset + 7) }
    offset += 2 + v.getUint16(offset + 2)
  }
  return null
}

/** WebP: three container variants, each with its own header layout. */
const webp: Reader = (bytes) => {
  if (bytes.length < 30) return null
  const v = view(bytes)
  const chunk = String.fromCharCode(...bytes.subarray(12, 16))
  if (chunk === 'VP8X') {
    const width = 1 + (bytes[24]! | (bytes[25]! << 8) | (bytes[26]! << 16))
    const height = 1 + (bytes[27]! | (bytes[28]! << 8) | (bytes[29]! << 16))
    return { width, height }
  }
  if (chunk === 'VP8 ') {
    return { width: v.getUint16(26, true) & 0x3FFF, height: v.getUint16(28, true) & 0x3FFF }
  }
  if (chunk === 'VP8L') {
    const bits = v.getUint32(21, true)
    return { width: (bits & 0x3FFF) + 1, height: ((bits >> 14) & 0x3FFF) + 1 }
  }
  return null
}

/** Keyed by `file-type` ext value. A format with no reader simply has unknown dimensions. */
const readers: Record<string, Reader> = { png, apng: png, jpg: jpeg, webp }

/** How much of the file a header reader may need. */
export const HEADER_BYTES = 512 * 1024

/** Dimensions from the file header, without decoding any pixels. */
export function readDimensions(ext: string, head: Uint8Array): Dimensions | null {
  const reader = readers[ext]
  if (!reader) return null
  try {
    const found = reader(head)
    return found && found.width > 0 && found.height > 0 ? found : null
  } catch {
    return null
  }
}
