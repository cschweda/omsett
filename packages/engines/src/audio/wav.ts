import { checked, cutShort, layoutIn, notValid, packed, recode, unpackedNote, wholeRate, words, type Read, type Sound } from './sound'

// WAV: a list of labelled parts. One, "fmt ", says how the sound is stored; another, "data",
// is the sound. Every length is four bytes, smallest first.

const NAME = 'WAV'
/** The most parts looked at. A WAV has a handful. */
const MAX_PARTS = 4096
/** A length that means "not known when this was written": a recording sent as it was made. */
const UNKNOWN = 0xFFFFFFFF

const PCM = 1
const FLOAT = 3
const ALAW = 6
const ULAW = 7
/** "See further on": the real kind is in a longer form of the label. */
const EXTENSIBLE = 0xFFFE
/** What follows the kind in that longer form, when the kind is one of the ordinary ones. */
const ORDINARY = [0x00, 0x00, 0x00, 0x00, 0x10, 0x00, 0x80, 0x00, 0x00, 0xAA, 0x00, 0x38, 0x9B, 0x71]
/** Packed kinds a WAV is sometimes found holding, by name. */
const PACKED: Record<number, string> = {
  0x0002: 'ADPCM',
  0x0011: 'ADPCM',
  0x0031: 'GSM',
  0x0050: 'MPEG audio',
  0x0055: 'MP3',
  0x00FF: 'AAC',
  0x0161: 'Windows Media Audio',
  0x2000: 'AC-3',
  0x674F: 'Ogg Vorbis',
  0xF1AC: 'FLAC',
}

/** The labels in a WAV's list of notes that are worth showing, and what each is. */
const INFO: Record<string, string> = {
  INAM: 'Title',
  IART: 'Artist',
  IPRD: 'Album',
  ICRD: 'Date',
  IGNR: 'Genre',
  ICMT: 'Comment',
  ICOP: 'Copyright',
  IENG: 'Engineer',
  ISFT: 'Made with',
}

const tag = (bytes: Uint8Array, at: number) => String.fromCharCode(bytes[at]!, bytes[at + 1]!, bytes[at + 2]!, bytes[at + 3]!)

/**
 * Read a WAV's label and find its sound. `bytes` may be only the start of a larger file of
 * `length` bytes: lengths are checked against the whole, and parts past the end of what is
 * held are simply not looked at.
 */
export function readWav(bytes: Uint8Array, length = bytes.length): Read {
  if (bytes.length < 12 || tag(bytes, 0) !== 'RIFF' || tag(bytes, 8) !== 'WAVE') throw notValid(NAME)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let format: Omit<Sound, 'frames' | 'at'> | undefined
  let block = 0
  let data: { at: number; size: number } | undefined
  const tags: Read['tags'] = []
  const notes: string[] = []

  let at = 12
  for (let parts = 0; parts < MAX_PARTS && at + 8 <= bytes.length; parts++) {
    const id = tag(bytes, at)
    let size = view.getUint32(at + 4, true)
    const start = at + 8
    if (id === 'data' && !data) {
      if (size === UNKNOWN) {
        size = length - start
        notes.push('The file did not say how long its sound is, so everything after its label was read.')
      }
      if (start + size > length) throw cutShort(NAME)
      data = { at: start, size }
    } else if (start + size > length) {
      // A part that runs past the end. Before the sound is found, the file cannot be followed.
      if (!data || !format) throw notValid(NAME)
      break
    } else if (id === 'fmt ' && !format) {
      if (size < 16 || start + 16 > bytes.length) throw notValid(NAME)
      let kind = view.getUint16(start, true)
      const channels = view.getUint16(start + 2, true)
      const rate = view.getUint32(start + 4, true)
      block = view.getUint16(start + 12, true)
      const bits = view.getUint16(start + 14, true)
      if (kind === EXTENSIBLE) {
        if (size < 40 || start + 40 > bytes.length) throw notValid(NAME)
        kind = view.getUint16(start + 24, true)
        if (!ORDINARY.every((value, i) => bytes[start + 26 + i] === value)) throw packed(NAME)
      }
      const wide = Math.ceil(bits / 8)
      if (kind === PCM && bits >= 1 && bits <= 32) format = { coding: wide === 1 ? 'uint' : 'int', bytes: wide, little: true, rate, channels }
      else if (kind === FLOAT && (bits === 32 || bits === 64)) format = { coding: 'float', bytes: wide, little: true, rate, channels }
      else if ((kind === ALAW || kind === ULAW) && bits === 8) format = { coding: kind === ALAW ? 'alaw' : 'ulaw', bytes: 1, little: true, rate, channels }
      else if (kind === PCM || kind === FLOAT || kind === ALAW || kind === ULAW) throw notValid(NAME)
      else throw packed(NAME, PACKED[kind])
    } else if (id === 'LIST' && size >= 4 && start + size <= bytes.length && tag(bytes, start) === 'INFO') {
      // Notes about the sound: a list of labelled pieces of text inside this part.
      for (let entry = start + 4, seen = 0; entry + 8 <= start + size && seen < 64; seen++) {
        const long = view.getUint32(entry + 4, true)
        if (entry + 8 + long > start + size) break
        const label = INFO[tag(bytes, entry)]
        const value = label ? words(bytes.subarray(entry + 8, entry + 8 + long)) : ''
        if (label && value && !tags.some((found) => found.label === label)) tags.push({ label, value })
        entry += 8 + long + (long % 2)
      }
    } else if (id === 'bext' && size >= 256 + 32 + 32 + 10 && start + 330 <= bytes.length) {
      // What a broadcaster's recorder writes: a description, who made it, and when.
      const add = (label: string, value: string) => value && !tags.some((found) => found.label === label) && tags.push({ label, value })
      add('Description', words(bytes.subarray(start, start + 256)))
      add('Recorded by', words(bytes.subarray(start + 256, start + 288)))
      add('Date', words(bytes.subarray(start + 320, start + 330)))
    } else if ((id === 'id3 ' || id === 'ID3 ') && size > 0) {
      tags.push({ label: 'Tags', value: 'Yes: a block of the kind an MP3 carries, with a title, an artist and perhaps a picture' })
    }
    // Every part starts on an even byte.
    at = start + size + (size % 2)
  }
  if (!format || !data) throw notValid(NAME)
  if (block !== format.channels * format.bytes) throw notValid(NAME)
  const sound = checked(NAME, { ...format, frames: Math.floor(data.size / block), at: data.at }, length)
  return { sound, tags, notes }
}

/** A WAV holding this sound: its label, then the numbers, smallest byte first. */
export function writeWav(sound: Sound, data: Uint8Array, notes: string[]): Uint8Array[] {
  const to = layoutIn(sound, true, true)
  const note = unpackedNote(sound.coding)
  if (note) notes.push(note)
  const body = recode(data, sound, to)
  const rate = wholeRate(sound.rate, NAME, notes)
  const block = sound.channels * to.bytes
  const float = to.coding === 'float'
  // More than two channels need the longer label, which has room to say which speaker each is
  // for. Omsett does not know, and says so by leaving that blank.
  const long = sound.channels > 2
  const label = long ? 40 : float ? 18 : 16
  const head = new Uint8Array(12 + 8 + label + (float ? 12 : 0) + 8)
  const view = new DataView(head.buffer)
  const put = (at: number, text: string) => [...text].forEach((letter, i) => (head[at + i] = letter.charCodeAt(0)))
  const pad = body.length % 2
  put(0, 'RIFF')
  view.setUint32(4, head.length - 8 + body.length + pad, true)
  put(8, 'WAVE')
  put(12, 'fmt ')
  view.setUint32(16, label, true)
  const kind = float ? FLOAT : PCM
  view.setUint16(20, long ? EXTENSIBLE : kind, true)
  view.setUint16(22, sound.channels, true)
  view.setUint32(24, rate, true)
  view.setUint32(28, rate * block, true)
  view.setUint16(32, block, true)
  view.setUint16(34, to.bytes * 8, true)
  if (long) {
    view.setUint16(36, 22, true)
    view.setUint16(38, to.bytes * 8, true)
    view.setUint32(40, 0, true)
    view.setUint16(44, kind, true)
    head.set(ORDINARY, 46)
  }
  let at = 20 + label
  if (float) {
    // Anything but whole numbers must also say how many moments of sound there are.
    put(at, 'fact')
    view.setUint32(at + 4, 4, true)
    view.setUint32(at + 8, sound.frames, true)
    at += 12
  }
  put(at, 'data')
  view.setUint32(at + 4, body.length, true)
  return pad ? [head, body, new Uint8Array(1)] : [head, body]
}
