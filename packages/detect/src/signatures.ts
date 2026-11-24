import type { Dimensions } from './dimensions'

// Formats the detection library does not know. Each is recognised here by its own signature,
// or, where a format has none, by a header that is consistent in every field.

const view = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
const ascii = (bytes: Uint8Array, start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end))
const starts = (bytes: Uint8Array, ...values: number[]) => values.every((value, i) => bytes[i] === value)

interface Sniffed {
  ext: string
  mime: string
  dimensions: Dimensions | null
}

/** Netpbm: "P" and a digit, then the size as text. Comments start with "#". */
function pnm(bytes: Uint8Array): Sniffed | null {
  if (bytes[0] !== 0x50 || bytes[1]! < 0x31 || bytes[1]! > 0x37) return null
  if (![0x0A, 0x0D, 0x20, 0x09].includes(bytes[2]!)) return null
  // After the two characters comes a number or a comment, and nothing else: "P1 incidents this
  // week" is somebody's notes.
  const text = ascii(bytes, 0, Math.min(bytes.length, 4096))
  if (bytes[1] !== 0x37 && !/^P[1-6]\s+(?:#|\d)/.test(text)) return null
  if (bytes[1] === 0x37 && !/^P7\s*[\r\n]/.test(text)) return null
  let dimensions: Dimensions | null = null
  if (bytes[1] === 0x37) {
    // A size given twice is the last one given: that is the one a reader ends up with.
    const header = text.split(/\nENDHDR/)[0]!
    const width = [...header.matchAll(/[\r\n]WIDTH\s+(\d{1,9})(?=\s)/g)].at(-1)
    const height = [...header.matchAll(/[\r\n]HEIGHT\s+(\d{1,9})(?=\s)/g)].at(-1)
    if (width && height) dimensions = { width: Number(width[1]), height: Number(height[1]) }
  } else {
    const tokens = text
      .slice(2)
      // A comment ends at the end of its line, and a line ends at either kind of line break.
      .split(/\r\n|\r|\n/)
      .map((line) => line.split('#')[0]!)
      .join(' ')
      .trim()
      .split(/\s+/)
    if (/^\d{1,9}$/.test(tokens[0] ?? '') && /^\d{1,9}$/.test(tokens[1] ?? '')) {
      dimensions = { width: Number(tokens[0]), height: Number(tokens[1]) }
    }
  }
  return { ext: 'pnm', mime: 'image/x-portable-anymap', dimensions }
}

/** PCX: a fixed first byte, a known version, run-length encoding, a sane bit depth. */
function pcx(bytes: Uint8Array): Sniffed | null {
  if (bytes.length < 128 || bytes[0] !== 0x0A || ![0, 2, 3, 4, 5].includes(bytes[1]!) || bytes[2] !== 1) return null
  if (![1, 2, 4, 8].includes(bytes[3]!) || bytes[64] !== 0) return null
  const v = view(bytes)
  const width = v.getUint16(8, true) - v.getUint16(4, true) + 1
  const height = v.getUint16(10, true) - v.getUint16(6, true) + 1
  if (width <= 0 || height <= 0) return null
  return { ext: 'pcx', mime: 'image/x-pcx', dimensions: { width, height } }
}

/** SGI: 01 DA, then storage (0 or 1) and bytes per channel (1 or 2). */
function sgi(bytes: Uint8Array): Sniffed | null {
  if (bytes.length < 12 || !starts(bytes, 0x01, 0xDA) || bytes[2]! > 1 || ![1, 2].includes(bytes[3]!)) return null
  const v = view(bytes)
  return { ext: 'sgi', mime: 'image/x-sgi', dimensions: { width: v.getUint16(6), height: v.getUint16(8) } }
}

/** Sun Raster: a four-byte signature, then width and height. */
function ras(bytes: Uint8Array): Sniffed | null {
  if (bytes.length < 12 || !starts(bytes, 0x59, 0xA6, 0x6A, 0x95)) return null
  const v = view(bytes)
  return { ext: 'ras', mime: 'image/x-sun-raster', dimensions: { width: v.getUint32(4), height: v.getUint32(8) } }
}

/** Radiance HDR: a text header, a blank line, then the size as "-Y 200 +X 320". */
function hdr(bytes: Uint8Array): Sniffed | null {
  const text = ascii(bytes, 0, Math.min(bytes.length, 4096))
  if (!/^#\?(?:RADIANCE|RGBE)\r?\n/.test(text)) return null
  const size = /\n[-+]Y (\d{1,9}) [-+]X (\d{1,9})\n/.exec(text)
  return {
    ext: 'hdr',
    mime: 'image/vnd.radiance',
    dimensions: size ? { width: Number(size[2]), height: Number(size[1]) } : null,
  }
}

/** OpenEXR: a four-byte signature; the size is the "dataWindow" attribute, a box of four numbers. */
function exr(bytes: Uint8Array): Sniffed | null {
  if (!starts(bytes, 0x76, 0x2F, 0x31, 0x01)) return null
  const at = ascii(bytes, 0, Math.min(bytes.length, 65536)).indexOf('dataWindow\0box2i\0')
  let dimensions: Dimensions | null = null
  if (at >= 0 && at + 37 <= bytes.length) {
    const v = view(bytes)
    const box = at + 21 // past the two names and the four-byte length
    const width = v.getInt32(box + 8, true) - v.getInt32(box, true) + 1
    const height = v.getInt32(box + 12, true) - v.getInt32(box + 4, true) + 1
    if (width > 0 && height > 0) dimensions = { width, height }
  }
  return { ext: 'exr', mime: 'image/x-exr', dimensions }
}

/**
 * TGA has no signature at all, so every field of its header must agree: a known picture type,
 * a colour map only where that type has one, a real size, a real bit depth.
 */
function tga(bytes: Uint8Array): Sniffed | null {
  if (bytes.length < 18) return null
  const [mapType, type] = [bytes[1]!, bytes[2]!]
  const v = view(bytes)
  const mapped = type === 1 || type === 9
  if (![1, 2, 3, 9, 10, 11].includes(type) || mapType !== (mapped ? 1 : 0)) return null
  if (mapped ? ![15, 16, 24, 32].includes(bytes[7]!) : v.getUint16(3, true) + v.getUint16(5, true) + bytes[7]! !== 0) return null
  const depths = type === 3 || type === 11 ? [8, 16] : mapped ? [8] : [15, 16, 24, 32]
  if (!depths.includes(bytes[16]!) || (bytes[17]! & 0xC0) !== 0) return null
  const width = v.getUint16(12, true)
  const height = v.getUint16(14, true)
  if (width === 0 || height === 0) return null
  return { ext: 'tga', mime: 'image/x-tga', dimensions: { width, height } }
}

/** QOI: the letters "qoif", then width and height. */
function qoi(bytes: Uint8Array): Sniffed | null {
  if (bytes.length < 12 || !starts(bytes, 0x71, 0x6F, 0x69, 0x66)) return null
  const v = view(bytes)
  return { ext: 'qoi', mime: 'image/qoi', dimensions: { width: v.getUint32(4), height: v.getUint32(8) } }
}

/** DirectDraw Surface: "DDS " and a header that says it is 124 bytes long; height, then width. */
function dds(bytes: Uint8Array): Sniffed | null {
  if (bytes.length < 20 || !starts(bytes, 0x44, 0x44, 0x53, 0x20)) return null
  const v = view(bytes)
  if (v.getUint32(4, true) !== 124) return null
  return { ext: 'dds', mime: 'image/vnd.ms-dds', dimensions: { width: v.getUint32(16, true), height: v.getUint32(12, true) } }
}

/**
 * FITS: lines of exactly eighty characters, the first saying "SIMPLE = T". The size is given
 * as NAXIS1 and NAXIS2, somewhere before the line that says END. A file with no picture in its
 * first part (NAXIS of 0 or 1) has no size to give here.
 */
function fits(bytes: Uint8Array): Sniffed | null {
  if (bytes.length < 80 || !/^SIMPLE {2}= {20}T(?: |\/)/.test(ascii(bytes, 0, 32))) return null
  const size: Record<string, number> = {}
  // A header is a few dozen lines. Past a thousand without an END, the size stays unknown.
  for (let line = 1; line < 1000 && (line + 1) * 80 <= bytes.length; line++) {
    const card = ascii(bytes, line * 80, line * 80 + 80)
    if (card.startsWith('END ')) break
    const axis = /^NAXIS([12]) {2}= {1,20}(\d{1,9}) *(?:\/|$)/.exec(card.slice(0, 31).trimEnd())
    // A size given twice is the last one given.
    if (axis) size[axis[1]!] = Number(axis[2])
  }
  const dimensions = size['1'] !== undefined && size['2'] !== undefined ? { width: size['1'], height: size['2'] } : null
  return { ext: 'fits', mime: 'image/fits', dimensions }
}

/** Strongest signatures first; TGA, which has none, last. */
export function sniff(bytes: Uint8Array): Sniffed | null {
  for (const test of [qoi, exr, ras, dds, fits, hdr, sgi, pnm, pcx, tga]) {
    const found = test(bytes)
    if (found) return found
  }
  return null
}
