import { checked, cutShort, layoutIn, notValid, packed, recode, unpackedNote, wholeRate, words, type Coding, type Read, type Sound } from './sound'

// AU: six numbers and then the sound. ".snd", where the sound starts, how long it is, how its
// numbers are written, how many a second, and how many channels. Largest byte first.

const NAME = 'AU'
const UNKNOWN = 0xFFFFFFFF
/** The ways of writing a number that are not packing, by the number AU gives each. */
const WRITTEN: Record<number, { coding: Coding; bytes: number }> = {
  1: { coding: 'ulaw', bytes: 1 },
  2: { coding: 'int', bytes: 1 },
  3: { coding: 'int', bytes: 2 },
  4: { coding: 'int', bytes: 3 },
  5: { coding: 'int', bytes: 4 },
  6: { coding: 'float', bytes: 4 },
  7: { coding: 'float', bytes: 8 },
  27: { coding: 'alaw', bytes: 1 },
}
const NUMBER: Record<string, number> = { 'int:1': 2, 'int:2': 3, 'int:3': 4, 'int:4': 5, 'float:4': 6, 'float:8': 7 }

/** Read an AU's label and find its sound. `bytes` may be only the start of a file of `length` bytes. */
export function readAu(bytes: Uint8Array, length = bytes.length): Read {
  if (bytes.length < 24 || String.fromCharCode(...bytes.subarray(0, 4)) !== '.snd') throw notValid(NAME)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const at = view.getUint32(4)
  let size = view.getUint32(8)
  const written = WRITTEN[view.getUint32(12)]
  if (at < 24) throw notValid(NAME)
  if (at > length) throw cutShort(NAME)
  if (!written) throw packed(NAME, view.getUint32(12) >= 23 && view.getUint32(12) <= 26 ? 'ADPCM' : undefined)
  const notes: string[] = []
  // A length of all ones means it was not known when the file was begun.
  if (size === UNKNOWN) size = length - at
  if (at + size > length) throw cutShort(NAME)
  const channels = view.getUint32(20)
  const sound: Sound = { ...written, little: false, rate: view.getUint32(16), channels, frames: channels > 0 ? Math.floor(size / (channels * written.bytes)) : 0, at }
  // Between the six numbers and the sound there is room for a note.
  const note = words(bytes.subarray(24, Math.min(at, bytes.length)))
  return { sound: checked(NAME, sound, length), tags: note ? [{ label: 'Comment', value: note }] : [], notes }
}

/** An AU holding this sound. */
export function writeAu(sound: Sound, data: Uint8Array, notes: string[]): Uint8Array[] {
  const to = layoutIn(sound, false, false)
  const note = unpackedNote(sound.coding)
  if (note) notes.push(note)
  const body = recode(data, sound, to)
  // Twenty-four bytes of numbers and four of empty note, which the oldest readers expect.
  const head = new Uint8Array(28)
  const view = new DataView(head.buffer)
  head.set([0x2E, 0x73, 0x6E, 0x64])
  view.setUint32(4, head.length)
  view.setUint32(8, body.length)
  view.setUint32(12, NUMBER[`${to.coding}:${to.bytes}`]!)
  view.setUint32(16, wholeRate(sound.rate, NAME, notes))
  view.setUint32(20, sound.channels)
  return [head, body]
}
