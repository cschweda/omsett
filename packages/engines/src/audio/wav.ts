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
 * The containers this label comes in. WAV's own: four letters and a four-byte length, parts on
 * an even byte. RF64 and BW64 are the same, with the lengths that do not fit in four bytes given
 * in a table (`ds64`) at the front. Sony's Wave64: sixteen-byte names, eight-byte lengths that
 * count the part's own head, parts on every eighth byte.
 */
type Container = 'riff' | 'rf64' | 'w64'

/** What follows the four letters of a part's name in Wave64. Its outermost part, "riff", has its own. */
const W64_TAIL = [0xF3, 0xAC, 0xD3, 0x11, 0x8C, 0xD1, 0x00, 0xC0, 0x4F, 0x8E, 0xDB, 0x8A]
const W64_RIFF = [0x72, 0x69, 0x66, 0x66, 0x2E, 0x91, 0xCF, 0x11, 0xA5, 0xD6, 0x28, 0xDB, 0x04, 0xC1, 0x00, 0x00]
const W64_WAVE = [0x77, 0x61, 0x76, 0x65, ...W64_TAIL]
const W64_NAME = 'Wave64'

/** An eight-byte length, refused if it is past what a number here holds exactly. */
function long(view: DataView, at: number, name: string): number {
  const value = view.getBigUint64(at, true)
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw notValid(name)
  return Number(value)
}

/**
 * Read a WAV's label and find its sound. `bytes` may be only the start of a larger file of
 * `length` bytes: lengths are checked against the whole, and parts past the end of what is
 * held are simply not looked at. RF64 and BW64, WAV with room for longer lengths, are read here.
 */
export function readWav(bytes: Uint8Array, length = bytes.length): Read {
  if (bytes.length < 12 || tag(bytes, 8) !== 'WAVE') throw notValid(NAME)
  const outer = tag(bytes, 0)
  if (outer === 'RIFF') return readParts(bytes, length, 'riff', NAME)
  if (outer === 'RF64' || outer === 'BW64') return readParts(bytes, length, 'rf64', NAME)
  throw notValid(NAME)
}

/** Read a Wave64 file: the same label as a WAV's, in a container of its own. */
export function readW64(bytes: Uint8Array, length = bytes.length): Read {
  if (bytes.length < 40 || !W64_RIFF.every((value, i) => bytes[i] === value) || !W64_WAVE.every((value, i) => bytes[24 + i] === value)) {
    throw notValid(W64_NAME)
  }
  return readParts(bytes, length, 'w64', W64_NAME)
}

function readParts(bytes: Uint8Array, length: number, container: Container, name: string): Read {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let format: Omit<Sound, 'frames' | 'at'> | undefined
  let block = 0
  let data: { at: number; size: number } | undefined
  const tags: Read['tags'] = []
  const notes: string[] = []
  const w64 = container === 'w64'
  const head = w64 ? 24 : 8
  // RF64: the real length of the sound, from the table that must come first.
  let stated: number | undefined

  let at = w64 ? 40 : 12
  for (let parts = 0; parts < MAX_PARTS && at + head <= bytes.length; parts++) {
    // A Wave64 part is named by sixteen bytes. Only names of the usual kind are read; any other
    // is passed over, as WAV passes over a part it does not know.
    const known = !w64 || W64_TAIL.every((value, i) => bytes[at + 4 + i] === value)
    const id = known ? tag(bytes, at) : ''
    let size: number
    if (w64) {
      const whole = long(view, at + 16, name)
      if (whole < head) throw notValid(name)
      size = whole - head
    } else {
      size = view.getUint32(at + 4, true)
    }
    const start = at + head
    if (container === 'rf64' && parts === 0) {
      // The table of long lengths is the first part, and is not optional.
      if (id !== 'ds64' || size < 24 || start + 24 > bytes.length) throw notValid(name)
      stated = long(view, start + 8, name)
    } else if (id === 'data' && !data) {
      if (container === 'rf64' && size === UNKNOWN) {
        size = stated!
      } else if (size === UNKNOWN && !w64) {
        size = length - start
        notes.push('The file did not say how long its sound is, so everything after its label was read.')
      }
      if (start + size > length) throw cutShort(name)
      data = { at: start, size }
    } else if (start + size > length) {
      // A part that runs past the end. Before the sound is found, the file cannot be followed.
      if (!data || !format) throw notValid(name)
      break
    } else if (id === 'fmt ' && !format) {
      ;({ format, block } = label(bytes, view, start, size, name))
    } else if (!w64 && id === 'LIST' && size >= 4 && start + size <= bytes.length && tag(bytes, start) === 'INFO') {
      // Notes about the sound: a list of labelled pieces of text inside this part.
      for (let entry = start + 4, seen = 0; entry + 8 <= start + size && seen < 64; seen++) {
        const long = view.getUint32(entry + 4, true)
        if (entry + 8 + long > start + size) break
        const label = INFO[tag(bytes, entry)]
        const value = label ? words(bytes.subarray(entry + 8, entry + 8 + long)) : ''
        if (label && value && !tags.some((found) => found.label === label)) tags.push({ label, value })
        entry += 8 + long + (long % 2)
      }
    } else if (!w64 && id === 'bext' && size >= 256 + 32 + 32 + 10 && start + 330 <= bytes.length) {
      // What a broadcaster's recorder writes: a description, who made it, and when.
      const add = (label: string, value: string) => value && !tags.some((found) => found.label === label) && tags.push({ label, value })
      add('Description', words(bytes.subarray(start, start + 256)))
      add('Recorded by', words(bytes.subarray(start + 256, start + 288)))
      add('Date', words(bytes.subarray(start + 320, start + 330)))
    } else if ((id === 'id3 ' || id === 'ID3 ') && size > 0) {
      tags.push({ label: 'Tags', value: 'Yes: a block of the kind an MP3 carries, with a title, an artist and perhaps a picture' })
    }
    // A WAV part starts on an even byte; a Wave64 part on every eighth.
    at = w64 ? start + size + ((8 - ((head + size) % 8)) % 8) : start + size + (size % 2)
  }
  if (!format || !data) throw notValid(name)
  if (block !== format.channels * format.bytes) throw notValid(name)
  const sound = checked(name, { ...format, frames: Math.floor(data.size / block), at: data.at }, length)
  return { sound, tags, notes }
}

/** The part that says how the sound is stored: the same in WAV, RF64 and Wave64. */
function label(bytes: Uint8Array, view: DataView, start: number, size: number, name: string): { format: Omit<Sound, 'frames' | 'at'>; block: number } {
  if (size < 16 || start + 16 > bytes.length) throw notValid(name)
  let kind = view.getUint16(start, true)
  const channels = view.getUint16(start + 2, true)
  const rate = view.getUint32(start + 4, true)
  const block = view.getUint16(start + 12, true)
  const bits = view.getUint16(start + 14, true)
  if (kind === EXTENSIBLE) {
    if (size < 40 || start + 40 > bytes.length) throw notValid(name)
    kind = view.getUint16(start + 24, true)
    if (!ORDINARY.every((value, i) => bytes[start + 26 + i] === value)) throw packed(name)
  }
  const wide = Math.ceil(bits / 8)
  if (kind === PCM && bits >= 1 && bits <= 32) return { format: { coding: wide === 1 ? 'uint' : 'int', bytes: wide, little: true, rate, channels }, block }
  if (kind === FLOAT && (bits === 32 || bits === 64)) return { format: { coding: 'float', bytes: wide, little: true, rate, channels }, block }
  if ((kind === ALAW || kind === ULAW) && bits === 8) return { format: { coding: kind === ALAW ? 'alaw' : 'ulaw', bytes: 1, little: true, rate, channels }, block }
  if (kind === PCM || kind === FLOAT || kind === ALAW || kind === ULAW) throw notValid(name)
  throw packed(name, PACKED[kind])
}

/** The label a WAV and a Wave64 share: how the sound is stored. Fourteen bytes past it, the numbers' own kind. */
function fmtBody(sound: Sound, to: { coding: string; bytes: number }, rate: number): Uint8Array {
  const block = sound.channels * to.bytes
  const float = to.coding === 'float'
  // More than two channels need the longer label, which has room to say which speaker each is
  // for. Omsett does not know, and says so by leaving that blank.
  const longer = sound.channels > 2
  const out = new Uint8Array(longer ? 40 : float ? 18 : 16)
  const view = new DataView(out.buffer)
  const kind = float ? FLOAT : PCM
  view.setUint16(0, longer ? EXTENSIBLE : kind, true)
  view.setUint16(2, sound.channels, true)
  view.setUint32(4, rate, true)
  view.setUint32(8, rate * block, true)
  view.setUint16(12, block, true)
  view.setUint16(14, to.bytes * 8, true)
  if (longer) {
    view.setUint16(16, 22, true)
    view.setUint16(18, to.bytes * 8, true)
    view.setUint32(20, 0, true)
    view.setUint16(24, kind, true)
    out.set(ORDINARY, 26)
  }
  return out
}

/** A WAV holding this sound: its label, then the numbers, smallest byte first. */
export function writeWav(sound: Sound, data: Uint8Array, notes: string[]): Uint8Array[] {
  const { body, fmt, float } = prepared(sound, data, notes, NAME)
  const parts: Array<[string, Uint8Array]> = [['fmt ', fmt]]
  // Anything but whole numbers must also say how many moments of sound there are.
  if (float) parts.push(['fact', uint32(sound.frames)])
  const head = new Uint8Array(12 + parts.reduce((sum, [, part]) => sum + 8 + part.length + (part.length % 2), 0) + 8)
  const view = new DataView(head.buffer)
  const put = (at: number, text: string) => [...text].forEach((letter, i) => (head[at + i] = letter.charCodeAt(0)))
  const pad = body.length % 2
  put(0, 'RIFF')
  view.setUint32(4, head.length - 8 + body.length + pad, true)
  put(8, 'WAVE')
  let at = 12
  for (const [id, part] of parts) {
    put(at, id)
    view.setUint32(at + 4, part.length, true)
    head.set(part, at + 8)
    at += 8 + part.length + (part.length % 2)
  }
  put(at, 'data')
  view.setUint32(at + 4, body.length, true)
  return pad ? [head, body, new Uint8Array(1)] : [head, body]
}

/** A Wave64 holding this sound: WAV's label in Sony's container, every length eight bytes. */
export function writeW64(sound: Sound, data: Uint8Array, notes: string[]): Uint8Array[] {
  const { body, fmt, float } = prepared(sound, data, notes, W64_NAME)
  const parts: Array<[string, Uint8Array]> = [['fmt ', fmt]]
  if (float) parts.push(['fact', uint64(sound.frames)])
  const padded = (size: number) => size + ((8 - (size % 8)) % 8)
  const head = new Uint8Array(40 + parts.reduce((sum, [, part]) => sum + padded(24 + part.length), 0) + 24)
  const view = new DataView(head.buffer)
  const name = (at: number, id: string) => {
    ;[...id].forEach((letter, i) => (head[at + i] = letter.charCodeAt(0)))
    head.set(W64_TAIL, at + 4)
  }
  const pad = (8 - (body.length % 8)) % 8
  head.set(W64_RIFF, 0)
  view.setBigUint64(16, BigInt(head.length + body.length + pad), true)
  head.set(W64_WAVE, 24)
  let at = 40
  for (const [id, part] of parts) {
    name(at, id)
    view.setBigUint64(at + 16, BigInt(24 + part.length), true)
    head.set(part, at + 24)
    at += padded(24 + part.length)
  }
  name(at, 'data')
  view.setBigUint64(at + 16, BigInt(24 + body.length), true)
  return pad ? [head, body, new Uint8Array(pad)] : [head, body]
}

/** What WAV and Wave64 both write: the numbers smallest byte first, and the label for them. */
function prepared(sound: Sound, data: Uint8Array, notes: string[], name: string) {
  const to = layoutIn(sound, true, true)
  const note = unpackedNote(sound.coding)
  if (note) notes.push(note)
  const body = recode(data, sound, to)
  const rate = wholeRate(sound.rate, name, notes)
  return { body, fmt: fmtBody(sound, to, rate), float: to.coding === 'float' }
}

const uint32 = (value: number) => {
  const out = new Uint8Array(4)
  new DataView(out.buffer).setUint32(0, value, true)
  return out
}
const uint64 = (value: number) => {
  const out = new Uint8Array(8)
  new DataView(out.buffer).setBigUint64(0, BigInt(value), true)
  return out
}
