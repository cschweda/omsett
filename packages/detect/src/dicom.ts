import type { Dimensions } from './dimensions'

// DICOM, the format of medical scans. After 128 bytes of anything and the letters "DICM", a
// file is a list of elements: a tag of two numbers, usually two letters for the kind of value,
// a length, and the value. A short opening group says how the rest is written; the picture's
// size is in group 0028 and the picture itself is the element 7FE0,0010, near the end.
//
// The list is walked here without reading any value but the few numbers that describe the
// picture. A list can hold lists; one that does not give its length is entered and its end
// looked for, and the picture's size is taken only from the outermost.

/** Written with the kind of each value left out, to be known from the tag. */
const IMPLICIT = '1.2.840.10008.1.2'
/** The two ways of writing in which the picture is plain numbers, and its length can be worked out. */
const PLAIN = new Set([IMPLICIT, '1.2.840.10008.1.2.1'])
/** Ways of writing this walker cannot follow: the largest end of each number first, and packed whole. */
const UNREADABLE = new Set(['1.2.840.10008.1.2.2', '1.2.840.10008.1.2.1.99'])
/** Kinds of value whose length is four bytes, after two that are empty. Every other kind's is two. */
const LONG = new Set(['OB', 'OD', 'OF', 'OL', 'OV', 'OW', 'SQ', 'SV', 'UC', 'UN', 'UR', 'UT', 'UV'])
const UNSTATED = 0xFFFFFFFF
/**
 * The elements that describe a picture's pixels, all in group 0028: how many values to a pixel
 * and what they mean, the size, the bits, and the tables and sums that turn a stored number
 * into a shade. Each is a plain value. Nothing else in a file is needed to draw its picture.
 */
const DESCRIBES = new Set([
  0x02, 0x04, 0x06, 0x08, 0x10, 0x11, 0x34, 0x100, 0x101, 0x102, 0x103, 0x106, 0x107, 0x120,
  0x1050, 0x1051, 0x1052, 0x1053, 0x1101, 0x1102, 0x1103, 0x1201, 0x1202, 0x1203,
])
/** How deep lists may sit in lists. Real files go three or four deep. */
const DEEPEST = 32

export interface Dicom {
  width: number
  height: number
  /** Values to a pixel: one for grey, three for colour. */
  samples: number
  /** Bits each value takes up in the file. */
  bits: number
  /** How many pictures the file says it holds. */
  frames: number
  /** The picture is plain numbers, not a packed picture of another format. */
  plain: boolean
  /** Where the picture's element begins, and where its value does. A length of null is one the file leaves unstated, as a packed picture does. */
  picture: { tag: number; start: number; length: number | null } | null
  /** Where the opening group ends and the rest begins. */
  opened: number
  /** The elements that describe the picture, each from its tag to the end of its value. */
  describing: { start: number; end: number }[]
  /** Why the list could not be followed to its end, where it could not. */
  broken: string | null
}

/**
 * What a DICOM file says about its picture, or null where the bytes are not a DICOM file this
 * can follow. Given only the start of a file, it reports what it found by the time it ran out.
 */
export function readDicom(bytes: Uint8Array): Dicom | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (bytes.length < 132 || String.fromCharCode(...bytes.subarray(128, 132)) !== 'DICM') return null
  const found: Dicom = { width: 0, height: 0, samples: 1, bits: 8, frames: 1, plain: true, picture: null, opened: 132, describing: [], broken: null }
  const text = (start: number, length: number) => String.fromCharCode(...bytes.subarray(start, start + Math.min(length, 64))).replace(/[\0 ]+$/, '')

  // The opening group is always written the same way, whatever follows.
  let at = 132
  let syntax = '1.2.840.10008.1.2.1'
  while (at + 8 <= bytes.length && view.getUint16(at, true) === 2) {
    const kind = String.fromCharCode(bytes[at + 4]!, bytes[at + 5]!)
    const long = LONG.has(kind)
    if (long && at + 12 > bytes.length) break
    const length = long ? view.getUint32(at + 8, true) : view.getUint16(at + 6, true)
    const value = at + (long ? 12 : 8)
    if (length === UNSTATED || value + length > bytes.length) {
      found.broken = 'a part of the file is longer than the file'
      return found
    }
    if (view.getUint16(at + 2, true) === 0x10) syntax = text(value, length)
    at = value + length
  }
  if (UNREADABLE.has(syntax)) return null
  found.opened = at
  const implicit = syntax === IMPLICIT
  found.plain = PLAIN.has(syntax)

  let depth = 0
  while (at + 8 <= bytes.length) {
    const group = view.getUint16(at, true)
    const element = view.getUint16(at + 2, true)
    let length: number
    let value: number
    if (group === 0xFFFE) {
      // The marks that begin and end an entry of a list, and end the list. Never a kind.
      length = view.getUint32(at + 4, true)
      value = at + 8
      if (element === 0xE0DD) depth = Math.max(0, depth - 1)
      // An entry is entered whether or not it gives its length: what it holds is more elements.
      at = value
      continue
    } else if (implicit) {
      length = view.getUint32(at + 4, true)
      value = at + 8
    } else {
      const long = LONG.has(String.fromCharCode(bytes[at + 4]!, bytes[at + 5]!))
      if (long && at + 12 > bytes.length) break
      length = long ? view.getUint32(at + 8, true) : view.getUint16(at + 6, true)
      value = at + (long ? 12 : 8)
    }
    const outermost = depth === 0
    if (outermost && group === 0x7FE0 && element === 0x10) {
      found.picture = { tag: at, start: value, length: length === UNSTATED ? null : length }
      return found
    }
    if (length === UNSTATED) {
      // A list that does not say how long it is. Its end is a mark further on.
      if (++depth > DEEPEST) {
        found.broken = 'its lists sit deeper inside one another than any real file needs'
        return found
      }
      at = value
      continue
    }
    if (depth > 0) {
      // Inside a list entered above, an element is stepped over like any other; a list inside
      // it that gives its length is stepped over whole.
      at = value + length
      continue
    }
    if (group === 0x28 && value + length <= bytes.length) {
      const number = () => (length >= 2 ? view.getUint16(value, true) : 0)
      if (element === 0x02) found.samples = number()
      if (element === 0x08) found.frames = Number.parseInt(text(value, length), 10) || 0
      if (element === 0x10) found.height = number()
      if (element === 0x11) found.width = number()
      if (element === 0x100) found.bits = number()
      if (DESCRIBES.has(element)) found.describing.push({ start: at, end: value + length })
    }
    at = value + length
  }
  if (at > bytes.length) found.broken = 'a part of the file is longer than the file'
  return found
}

/**
 * A DICOM file with everything but its picture left out: the opening, the elements that
 * describe the pixels, and the pixels. A scan carries the patient, the hospital, notes, lists
 * within lists and whatever a manufacturer chose to add; a decoder shown all of that has taken
 * a size from a list inside the file for the size of the file's own picture. Shown only this,
 * it has nothing else to read. Null where the file cannot be followed or holds no picture.
 */
export function dicomPicture(bytes: Uint8Array): Uint8Array | null {
  const found = readDicom(bytes)
  if (!found?.picture) return null
  const { tag, start, length } = found.picture
  // A picture that leaves its length unstated runs to the end of the file.
  const pieces = [bytes.subarray(0, found.opened), ...found.describing.map((part) => bytes.subarray(part.start, part.end))]
  pieces.push(bytes.subarray(tag, length === null ? bytes.length : Math.min(bytes.length, start + length)))
  const out = new Uint8Array(pieces.reduce((total, piece) => total + piece.length, 0))
  let at = 0
  for (const piece of pieces) {
    out.set(piece, at)
    at += piece.length
  }
  return out
}

/** The size a DICOM file gives for its picture, from the start of the file. */
export function dicomDimensions(head: Uint8Array): Dimensions | null {
  const found = readDicom(head)
  return found && found.width > 0 && found.height > 0 ? { width: found.width, height: found.height } : null
}

/**
 * Whether a DICOM file holds the picture it says it holds. A decoder given one that stops
 * partway returns what it found and blank for the rest, so the sum is done here first.
 */
export function dicomProblem(bytes: Uint8Array): string | null {
  const found = readDicom(bytes)
  // Not something this can follow: the decoder is left to say what it makes of it.
  if (!found) return null
  if (found.broken && !found.picture) return found.broken
  if (found.width < 1 || found.height < 1) return 'the file does not say how large its picture is'
  if (!found.picture) return 'the file holds no picture'
  if (found.samples < 1 || found.samples > 4 || found.bits < 1 || found.bits > 64 || found.frames < 1) {
    return 'the file describes a picture that cannot exist'
  }
  const { start, length } = found.picture
  if (length === null) return found.plain ? 'the picture does not say how long it is' : null
  if (start + length > bytes.length) return 'the picture stops partway'
  if (!found.plain) return null
  const needed = found.width * found.height * found.samples * Math.ceil(found.bits / 8) * found.frames
  return length < needed ? 'the picture is shorter than the size it gives' : null
}
