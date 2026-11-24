import type { Dimensions } from './dimensions'

// DNG, the open camera RAW format. It is a TIFF: lists of numbered entries, each list
// describing one picture. A camera usually puts a small preview in the first list and names
// the lists of the real picture in entry 330 of it; which is which is said by entry 254, where
// an odd number means "a smaller copy". The first list also says which way up the camera was.

/** The most lists looked into. A real file has two or three. */
const MOST_LISTS = 16

interface Listed extends Dimensions {
  /** A smaller copy of the picture, not the picture. */
  reduced: boolean
  turned: number
  /** Where the lists named by this one are. */
  within: number[]
}

function list(view: DataView, at: number, little: boolean): Listed | null {
  if (at < 8 || at + 2 > view.byteLength) return null
  const found: Listed = { width: 0, height: 0, reduced: false, turned: 1, within: [] }
  const entries = view.getUint16(at, little)
  for (let i = 0; i < entries; i++) {
    const entry = at + 2 + i * 12
    if (entry + 12 > view.byteLength) return null
    const tag = view.getUint16(entry, little)
    const short = view.getUint16(entry + 2, little) === 3
    const count = view.getUint32(entry + 4, little)
    const value = short ? view.getUint16(entry + 8, little) : view.getUint32(entry + 8, little)
    if (tag === 254) found.reduced = (value & 1) === 1
    if (tag === 256) found.width = value
    if (tag === 257) found.height = value
    if (tag === 274) found.turned = value
    if (tag === 330) {
      // One place fits in the entry itself; more are kept elsewhere, and the entry says where.
      const places = Math.min(count, MOST_LISTS)
      for (let n = 0; n < places; n++) {
        const where = count === 1 ? entry + 8 : value + n * 4
        if (where + 4 > view.byteLength) break
        found.within.push(view.getUint32(where, little))
      }
    }
  }
  return found
}

/**
 * The size of the picture a DNG develops into: the largest list that is not a smaller copy,
 * turned the way the camera was held. Lists that lie past the part of the file read here are
 * left out, and the engine checks the real size once it has it.
 */
export function dngDimensions(bytes: Uint8Array): Dimensions | null {
  if (bytes.length < 8) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const little = bytes[0] === 0x49
  const first = list(view, view.getUint32(4, little), little)
  if (!first) return null
  const all = [first, ...first.within.map((at) => list(view, at, little)).filter((found) => found !== null)]
  const sized = all.filter((found) => found.width > 0 && found.height > 0)
  const whole = sized.filter((found) => !found.reduced)
  let best: Listed | null = null
  for (const found of whole.length ? whole : sized) {
    if (!best || found.width * found.height > best.width * best.height) best = found
  }
  if (!best) return null
  // Four of the eight ways a picture can be turned lay it on its side.
  const sideways = first.turned >= 5 && first.turned <= 8
  return sideways ? { width: best.height, height: best.width } : { width: best.width, height: best.height }
}
