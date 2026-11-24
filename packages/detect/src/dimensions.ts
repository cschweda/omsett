import { dicomDimensions } from './dicom'
import { dngDimensions } from './dng'

export interface Dimensions {
  width: number
  height: number
}

type Reader = (bytes: Uint8Array) => Dimensions | null

const view = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

/**
 * PNG: the IHDR chunk must come first, which puts width and height at bytes 16–23. If the first
 * chunk is something else, those bytes are not a size and are not read as one.
 */
const png: Reader = (bytes) => {
  if (bytes.length < 24) return null
  if (String.fromCharCode(...bytes.subarray(12, 16)) !== 'IHDR') return null
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

/** GIF: the logical screen size follows the six-byte signature, little-endian. */
const gif: Reader = (bytes) => {
  if (bytes.length < 10) return null
  const v = view(bytes)
  return { width: v.getUint16(6, true), height: v.getUint16(8, true) }
}

/**
 * TIFF: the size is in the first directory, which can be anywhere in the file. If it lies
 * beyond the part that was read, the size is unknown and the engine checks it after loading.
 */
const tiff: Reader = (bytes) => {
  if (bytes.length < 8) return null
  const v = view(bytes)
  const little = bytes[0] === 0x49
  const directory = v.getUint32(4, little)
  if (directory + 2 > bytes.length) return null
  const entries = v.getUint16(directory, little)
  let width = 0
  let height = 0
  for (let i = 0; i < entries; i++) {
    const entry = directory + 2 + i * 12
    if (entry + 12 > bytes.length) return null
    const tag = v.getUint16(entry, little)
    if (tag !== 256 && tag !== 257) continue
    // The value is a 16-bit or a 32-bit number, stored in the entry itself.
    const value = v.getUint16(entry + 2, little) === 3 ? v.getUint16(entry + 8, little) : v.getUint32(entry + 8, little)
    if (tag === 256) width = value
    else height = value
  }
  return width && height ? { width, height } : null
}

/**
 * AVIF and HEIC: the size is in an "ispe" box. A file can hold several (a thumbnail, an alpha
 * plane), so the largest is the picture.
 */
const heif: Reader = (bytes) => {
  const v = view(bytes)
  let best: Dimensions | null = null
  for (let i = 4; i + 16 <= bytes.length; i++) {
    // "ispe", then four bytes of version and flags, then width and height.
    if (bytes[i] !== 0x69 || bytes[i + 1] !== 0x73 || bytes[i + 2] !== 0x70 || bytes[i + 3] !== 0x65) continue
    const found = { width: v.getUint32(i + 8), height: v.getUint32(i + 12) }
    if (!best || found.width * found.height > best.width * best.height) best = found
  }
  return best
}

/** JPEG XL: the size is bit-packed at the start of the codestream, which may be inside a box. */
const jxl: Reader = (bytes) => {
  let start = -1
  if (bytes[0] === 0xFF && bytes[1] === 0x0A) start = 2
  else {
    // The container form: walk its boxes to the codestream ("jxlc", or the first "jxlp" part).
    const v = view(bytes)
    for (let offset = 0; offset + 8 <= bytes.length; ) {
      const size = v.getUint32(offset)
      const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8))
      const body = offset + 8 + (type === 'jxlp' ? 4 : 0)
      if (type === 'jxlc' || type === 'jxlp') {
        if (bytes[body] === 0xFF && bytes[body + 1] === 0x0A) start = body + 2
        break
      }
      if (size < 8) break
      offset += size
    }
  }
  if (start < 0) return null

  let bit = start * 8
  const read = (count: number) => {
    let value = 0
    for (let i = 0; i < count; i++, bit++) value += ((bytes[bit >> 3]! >> (bit & 7)) & 1) * 2 ** i
    return value
  }
  /** One of four widths of number, chosen by a two-bit selector, plus one. */
  const size = () => read([9, 13, 18, 30][read(2)]!) + 1
  const small = read(1) === 1
  const height = small ? (read(5) + 1) * 8 : size()
  const ratio = read(3)
  const ratios: Array<[number, number]> = [[1, 1], [12, 10], [4, 3], [3, 2], [16, 9], [5, 4], [2, 1]]
  const width =
    ratio === 0
      ? small
        ? (read(5) + 1) * 8
        : size()
      : Math.floor((height * ratios[ratio - 1]![0]) / ratios[ratio - 1]![1])
  if (bit > bytes.length * 8) return null
  return { width, height }
}

/**
 * BMP: width and height are little-endian at 18 and 22; a negative height means top-down.
 * The oldest kind (OS/2, with a header of twelve bytes) keeps them as two short numbers instead.
 */
const bmp: Reader = (bytes) => {
  if (bytes.length < 26) return null
  const v = view(bytes)
  if (v.getUint32(14, true) === 12) return { width: v.getUint16(18, true), height: v.getUint16(20, true) }
  return { width: Math.abs(v.getInt32(18, true)), height: Math.abs(v.getInt32(22, true)) }
}

/** PSD: height then width, big-endian, at 14 and 18. */
const psd: Reader = (bytes) => {
  if (bytes.length < 22) return null
  const v = view(bytes)
  return { width: v.getUint32(18), height: v.getUint32(14) }
}

/** ICO holds several sizes; the largest is the one that is read. A stated 0 means 256. */
const ico: Reader = (bytes) => {
  if (bytes.length < 6) return null
  const count = view(bytes).getUint16(4, true)
  let best: Dimensions | null = null
  for (let i = 0; i < count && 6 + i * 16 + 2 <= bytes.length; i++) {
    const found = { width: bytes[6 + i * 16]! || 256, height: bytes[7 + i * 16]! || 256 }
    if (!best || found.width * found.height > best.width * best.height) best = found
  }
  return best
}

/** JPEG 2000: the "ihdr" box gives height then width. */
const jp2: Reader = (bytes) => {
  for (let i = 4; i + 12 <= bytes.length; i++) {
    if (bytes[i] === 0x69 && bytes[i + 1] === 0x68 && bytes[i + 2] === 0x64 && bytes[i + 3] === 0x72) {
      const v = view(bytes)
      return { width: v.getUint32(i + 8), height: v.getUint32(i + 4) }
    }
  }
  return null
}

/** Keyed by `file-type` ext value. A format with no reader simply has unknown dimensions. */
const readers: Record<string, Reader> = { png, apng: png, jpg: jpeg, webp, gif, tif: tiff, avif: heif, heic: heif, jxl, bmp, psd, psb: psd, ico, cur: ico, jp2, dcm: dicomDimensions, dng: dngDimensions }

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
