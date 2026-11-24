import { checked, cutShort, layoutIn, notValid, packed, recode, unpackedNote, words, type Coding, type Read, type Sound } from './sound'

// AIFF: Apple's list of labelled parts. "COMM" says how the sound is stored and "SSND" is the
// sound. Every length is four bytes, largest first. The later form, AIFF-C, adds four letters
// to COMM that say how the numbers are written; the plain form is always whole numbers.

const NAME = 'AIFF'
const MAX_PARTS = 4096

/** The four letters of AIFF-C, for the ways of writing a number that are not packing. */
const WRITTEN: Record<string, { coding: Coding; bytes?: number; little?: boolean }> = {
  'NONE': { coding: 'int' },
  'twos': { coding: 'int' },
  'sowt': { coding: 'int', little: true },
  'in24': { coding: 'int', bytes: 3 },
  'in32': { coding: 'int', bytes: 4 },
  'raw ': { coding: 'uint', bytes: 1 },
  'fl32': { coding: 'float', bytes: 4 },
  'FL32': { coding: 'float', bytes: 4 },
  'fl64': { coding: 'float', bytes: 8 },
  'FL64': { coding: 'float', bytes: 8 },
  'ulaw': { coding: 'ulaw', bytes: 1 },
  'ULAW': { coding: 'ulaw', bytes: 1 },
  'alaw': { coding: 'alaw', bytes: 1 },
  'ALAW': { coding: 'alaw', bytes: 1 },
}
const PACKED: Record<string, string> = { 'ima4': 'ADPCM', 'MAC3': 'MACE', 'MAC6': 'MACE', 'GSM ': 'GSM', 'ADP4': 'ADPCM', 'Qclp': 'QCELP', 'QDMC': 'QDesign', 'QDM2': 'QDesign' }
/** Parts that are words about the sound. */
const TEXT: Record<string, string> = { 'NAME': 'Title', 'AUTH': 'Artist', '(c) ': 'Copyright', 'ANNO': 'Comment' }

const tag = (bytes: Uint8Array, at: number) => String.fromCharCode(bytes[at]!, bytes[at + 1]!, bytes[at + 2]!, bytes[at + 3]!)

/** A rate as AIFF writes it: ten bytes, a sign and a power of two, then sixty-four bits of number. */
function fromExtended(view: DataView, at: number): number {
  const power = view.getUint16(at)
  if (power & 0x8000) return Number.NaN
  return (view.getUint32(at + 2) * 2 ** 32 + view.getUint32(at + 6)) * 2 ** ((power & 0x7FFF) - 16383 - 63)
}
function toExtended(value: number): Uint8Array {
  const out = new Uint8Array(10)
  const view = new DataView(out.buffer)
  let power = Math.floor(Math.log2(value))
  let part = value / 2 ** power
  if (part >= 2) [part, power] = [part / 2, power + 1]
  if (part < 1) [part, power] = [part * 2, power - 1]
  const high = Math.floor(part * 2 ** 31)
  view.setUint16(0, power + 16383)
  view.setUint32(2, high)
  view.setUint32(6, (part * 2 ** 31 - high) * 2 ** 32)
  return out
}

/** Read an AIFF's label and find its sound. `bytes` may be only the start of a file of `length` bytes. */
export function readAiff(bytes: Uint8Array, length = bytes.length): Read {
  const form = bytes.length >= 12 && tag(bytes, 0) === 'FORM' ? tag(bytes, 8) : ''
  if (form !== 'AIFF' && form !== 'AIFC') throw notValid(NAME)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let format: Omit<Sound, 'at'> | undefined
  let data: { at: number; size: number } | undefined
  const tags: Read['tags'] = []

  let at = 12
  for (let parts = 0; parts < MAX_PARTS && at + 8 <= bytes.length; parts++) {
    const id = tag(bytes, at)
    const size = view.getUint32(at + 4)
    const start = at + 8
    if (id === 'SSND' && !data) {
      if (start + size > length) throw cutShort(NAME)
      if (size < 8 || start + 8 > bytes.length) throw notValid(NAME)
      // The sound may be set a little way in, to line it up for a disk.
      const skip = view.getUint32(start)
      if (skip > size - 8) throw notValid(NAME)
      data = { at: start + 8 + skip, size: size - 8 - skip }
    } else if (start + size > length) {
      if (!data || !format) throw notValid(NAME)
      break
    } else if (id === 'COMM' && !format) {
      const least = form === 'AIFC' ? 22 : 18
      if (size < least || start + least > bytes.length) throw notValid(NAME)
      const channels = view.getInt16(start)
      const frames = view.getUint32(start + 2)
      const bits = view.getInt16(start + 6)
      const rate = fromExtended(view, start + 8)
      const how = form === 'AIFC' ? tag(bytes, start + 18) : 'NONE'
      const written = WRITTEN[how]
      if (!written) throw packed(NAME, PACKED[how])
      const wide = written.bytes ?? Math.ceil(bits / 8)
      if (written.coding === 'int' && (bits < 1 || bits > 32)) throw notValid(NAME)
      format = { coding: written.coding, bytes: wide, little: written.little ?? false, rate, channels, frames }
    } else if (TEXT[id] && start + size <= bytes.length) {
      const value = words(bytes.subarray(start, start + size))
      if (value && !tags.some((found) => found.label === TEXT[id])) tags.push({ label: TEXT[id]!, value })
    } else if (id === 'ID3 ' && size > 0) {
      tags.push({ label: 'Tags', value: 'Yes: a block of the kind an MP3 carries, with a title, an artist and perhaps a picture' })
    }
    at = start + size + (size % 2)
  }
  if (!format) throw notValid(NAME)
  // A file may say it has no sound and leave the part for it out.
  const sound = checked(NAME, { ...format, at: data?.at ?? length }, data ? data.at + data.size : length)
  return { sound, tags, notes: [] }
}

/** An AIFF holding this sound, largest byte first. Fractions need the later form, AIFF-C. */
export function writeAiff(sound: Sound, data: Uint8Array, notes: string[]): Uint8Array[] {
  const to = layoutIn(sound, false, false)
  const note = unpackedNote(sound.coding)
  if (note) notes.push(note)
  const body = recode(data, sound, to)
  const float = to.coding === 'float'
  // AIFF-C names its way of writing twice: four letters, then words, with a count before them.
  const named = float ? (to.bytes === 4 ? ['fl32', '32-bit floating point'] : ['fl64', '64-bit floating point']) : null
  const naming = named ? 4 + 1 + named[1]!.length + ((1 + named[1]!.length) % 2) : 0
  const pad = body.length % 2
  const head = new Uint8Array(12 + (float ? 12 : 0) + 8 + 18 + naming + 16)
  const view = new DataView(head.buffer)
  const put = (at: number, text: string) => [...text].forEach((letter, i) => (head[at + i] = letter.charCodeAt(0)))
  put(0, 'FORM')
  view.setUint32(4, head.length - 8 + body.length + pad)
  put(8, float ? 'AIFC' : 'AIFF')
  let at = 12
  if (float) {
    // Which edition of AIFF-C this is. There has only ever been one.
    put(at, 'FVER')
    view.setUint32(at + 4, 4)
    view.setUint32(at + 8, 0xA2805140)
    at += 12
  }
  put(at, 'COMM')
  view.setUint32(at + 4, 18 + naming)
  view.setInt16(at + 8, sound.channels)
  view.setUint32(at + 10, sound.frames)
  view.setInt16(at + 14, to.bytes * 8)
  head.set(toExtended(sound.rate), at + 16)
  if (named) {
    put(at + 26, named[0]!)
    head[at + 30] = named[1]!.length
    put(at + 31, named[1]!)
  }
  at += 8 + 18 + naming
  put(at, 'SSND')
  view.setUint32(at + 4, 8 + body.length)
  return pad ? [head, body, new Uint8Array(1)] : [head, body]
}
