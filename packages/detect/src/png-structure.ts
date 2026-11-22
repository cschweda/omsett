// A structural check of a PNG, without decoding a single pixel.
//
// Browsers' own PNG decoders forgive damage: handed a file cut short or corrupted, some return
// the part they could read and report success. A converter that passes that on has produced a
// wrong picture and called it right. So before the browser is allowed to decode a PNG, the file
// is checked here, and anything damaged is refused or handed to a stricter reader.
//
// Checked: the signature; that every chunk fits in the file and its checksum is correct; that
// the header comes first and declares a legal picture; that the palette, if there is one, is
// well-formed; that no essential chunk is unknown; and that the image data decompresses to
// exactly the number of bytes the header implies, with a legal filter on every row and, for
// palette pictures, no pixel pointing outside the palette.

const SIGNATURE = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]

let crcTable: Uint32Array | undefined
function crc32(bytes: Uint8Array, start: number, end: number): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
      crcTable[n] = c >>> 0
    }
  }
  let crc = 0xFFFFFFFF
  for (let i = start; i < end; i++) crc = crcTable[(crc ^ bytes[i]!) & 0xFF]! ^ (crc >>> 8)
  return (crc ^ 0xFFFFFFFF) >>> 0
}

/** Channels per pixel for each colour type, and the bit depths it allows. */
const COLOUR_TYPES: Record<number, { channels: number; depths: number[] }> = {
  0: { channels: 1, depths: [1, 2, 4, 8, 16] },
  2: { channels: 3, depths: [8, 16] },
  3: { channels: 1, depths: [1, 2, 4, 8] },
  4: { channels: 2, depths: [8, 16] },
  6: { channels: 4, depths: [8, 16] },
}

// The seven passes of an interlaced PNG: where each starts and how far apart its pixels are.
const PASSES = [
  [0, 0, 8, 8],
  [4, 0, 8, 8],
  [0, 4, 4, 8],
  [2, 0, 4, 4],
  [0, 2, 2, 4],
  [1, 0, 2, 2],
  [0, 1, 1, 2],
] as const

/** The length in bytes of every row the image data must contain, in order, filter byte included. */
function expectedRows(width: number, height: number, bitsPerPixel: number, interlaced: boolean): number[] {
  const rowBytes = (pixels: number) => 1 + Math.ceil((pixels * bitsPerPixel) / 8)
  if (!interlaced) return Array.from({ length: height }, () => rowBytes(width))
  const rows: number[] = []
  for (const [x0, y0, dx, dy] of PASSES) {
    const columns = Math.ceil((width - x0) / dx)
    const lines = Math.ceil((height - y0) / dy)
    if (columns <= 0 || lines <= 0) continue
    for (let i = 0; i < lines; i++) rows.push(rowBytes(columns))
  }
  return rows
}

/**
 * Why this PNG is not sound, or null if it is. Reads the whole file; meant to run in a worker.
 * `maxPixels` stops a file that declares an enormous picture before its data is decompressed.
 */
export async function pngStructureProblem(blob: Blob, maxPixels: number): Promise<string | null> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const view = new DataView(bytes.buffer)
  if (bytes.length < 8 || SIGNATURE.some((b, i) => bytes[i] !== b)) return 'not a PNG'

  let width = 0
  let height = 0
  let depth = 0
  let colour = -1
  let interlaced = false
  let paletteSize = 0
  let sawEnd = false
  const data: Uint8Array[] = []
  let dataEnded = false

  let offset = 8
  let index = 0
  while (offset < bytes.length && !sawEnd) {
    if (offset + 12 > bytes.length) return 'a chunk is cut off'
    const length = view.getUint32(offset)
    const type = String.fromCharCode(bytes[offset + 4]!, bytes[offset + 5]!, bytes[offset + 6]!, bytes[offset + 7]!)
    const body = offset + 8
    const end = body + length
    if (end + 4 > bytes.length) return 'a chunk runs past the end of the file'
    if (crc32(bytes, offset + 4, end) !== view.getUint32(end)) return `the ${type} chunk has a wrong checksum`

    if (index === 0 && type !== 'IHDR') return 'the header is not first'
    if (type === 'IHDR') {
      if (index !== 0 || length !== 13) return 'the header is malformed'
      width = view.getUint32(body)
      height = view.getUint32(body + 4)
      depth = bytes[body + 8]!
      colour = bytes[body + 9]!
      const kind = COLOUR_TYPES[colour]
      if (!kind) return 'the colour type does not exist'
      if (!kind.depths.includes(depth)) return 'the bit depth is not allowed'
      if (bytes[body + 10] !== 0 || bytes[body + 11] !== 0) return 'the compression or filter method is unknown'
      if (bytes[body + 12]! > 1) return 'the interlace method is unknown'
      interlaced = bytes[body + 12] === 1
      if (width === 0 || height === 0) return 'the picture has no size'
      if (width * height > maxPixels) return 'the picture is too large'
    } else if (type === 'PLTE') {
      if (length === 0 || length % 3 !== 0 || length > 768) return 'the palette is malformed'
      if (data.length > 0) return 'the palette comes after the image data'
      paletteSize = length / 3
    } else if (type === 'IDAT') {
      if (dataEnded) return 'the image data is split by another chunk'
      data.push(bytes.subarray(body, end))
    } else if (type === 'IEND') {
      sawEnd = true
    } else if (type.charCodeAt(0) >= 65 && type.charCodeAt(0) <= 90) {
      // An uppercase first letter marks a chunk as essential. An essential chunk nobody knows
      // means the picture cannot be read correctly.
      return `the essential chunk ${type} is unknown`
    }
    if (type !== 'IDAT' && data.length > 0) dataEnded = true
    offset = end + 4
    index++
  }
  if (!sawEnd) return 'the end marker is missing'
  if (data.length === 0) return 'there is no image data'
  if (colour === 3 && paletteSize === 0) return 'the palette is missing'

  // Decompress the image data as a stream and check it row by row, keeping nothing.
  const kind = COLOUR_TYPES[colour]!
  const rows = expectedRows(width, height, kind.channels * depth, interlaced)
  const checkIndexes = colour === 3 && paletteSize < 1 << depth
  let row = 0
  let position = 0 // within the current row
  try {
    const stream = new Blob(data as BlobPart[]).stream().pipeThrough(new DecompressionStream('deflate'))
    const reader = stream.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      for (let i = 0; i < value.length; ) {
        if (row >= rows.length) return 'there is more image data than the header declares'
        const rowLength = rows[row]!
        if (position === 0) {
          if (value[i]! > 4) return 'a row uses a filter that does not exist'
          position = 1
          i++
        } else {
          const take = Math.min(rowLength - position, value.length - i)
          if (checkIndexes) {
            // Each byte holds 8 / depth pixels; every one must point inside the palette.
            const mask = (1 << depth) - 1
            for (let j = i; j < i + take; j++) {
              const byte = value[j]!
              for (let shift = 8 - depth; shift >= 0; shift -= depth) {
                if (((byte >> shift) & mask) >= paletteSize) return 'a pixel points outside the palette'
              }
            }
          }
          position += take
          i += take
        }
        if (position === rowLength) {
          row++
          position = 0
        }
      }
    }
  } catch {
    return 'the image data is corrupt'
  }
  if (row !== rows.length || position !== 0) return 'there is less image data than the header declares'
  return null
}
