import { Refusal } from '../util'
import { cutShort, notValid, noSound, recode, words, type Read, type Sound } from './sound'

// MP3: sound made small by leaving out what a listener is least likely to miss. A file is a row
// of short stretches, each of which opens by saying how it is packed and so how long it is.
//
// Unpacking the sound itself is the work of mpg123, and packing it the work of LAME: both are
// decades of other people's care, and neither is something to write again. Everything around
// them is Omsett's own. A decoder forgives: given a file with rubbish in the middle, it plays
// what it can find on either side. So before the decoder sees a file, the row of stretches is
// walked from the first to the last, and a file that breaks off, or stops being MP3 part-way,
// is refused.

const NAME = 'MP3'
/** The most sound an MP3 is unpacked to: the same as for any packed sound. */
const MAX_SOUND_BYTES = 1024 ** 3
const DAMAGED = 'This MP3 is damaged: part-way through, it stops being MP3'
export const LOSSY = 'MP3, about %s kbps. Sound was left out to make the file small, and converting does not bring it back'

const KBPS = { 1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320], 2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160] }
const RATES: Record<number, number[]> = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] }
/** The rates MP3 can hold, fastest first. */
const HELD = [48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000]

interface Stretch {
  /** 3 for the first edition of MPEG, 2 for the second, 0 for the unofficial "2.5". */
  edition: number
  rate: number
  kbps: number
  mono: boolean
  /** Bytes in this stretch, its four-byte opening included. */
  size: number
  /** Moments of sound in it. */
  moments: number
  /** Bytes between the opening and the sound, which say where each part of the sound is. */
  index: number
}

/** What four bytes say, if they open a stretch of MP3. */
function opening(bytes: Uint8Array, at: number): Stretch | 'unstated' | null {
  if (at + 4 > bytes.length || bytes[at] !== 0xFF || (bytes[at + 1]! & 0xE0) !== 0xE0) return null
  const edition = (bytes[at + 1]! >> 3) & 3
  // Layer three of MPEG audio is MP3. The other two layers are other formats.
  if (edition === 1 || ((bytes[at + 1]! >> 1) & 3) !== 1) return null
  const speed = bytes[at + 2]! >> 4
  const rate = RATES[edition]![(bytes[at + 2]! >> 2) & 3]
  if (speed === 15 || rate === undefined) return null
  // A stretch may leave its speed unsaid, and then nothing says how long it is.
  if (speed === 0) return 'unstated'
  const kbps = KBPS[edition === 3 ? 1 : 2][speed]!
  const mono = bytes[at + 3]! >> 6 === 3
  const size = Math.floor(((edition === 3 ? 144000 : 72000) * kbps) / rate) + ((bytes[at + 2]! >> 1) & 1)
  return { edition, rate, kbps, mono, size, moments: edition === 3 ? 1152 : 576, index: edition === 3 ? (mono ? 17 : 32) : mono ? 9 : 17 }
}

const ascii = (bytes: Uint8Array, at: number, length: number) => String.fromCharCode(...bytes.subarray(at, Math.min(bytes.length, at + length)))
const TAGS: Record<string, string> = { TIT2: 'Title', TT2: 'Title', TPE1: 'Artist', TP1: 'Artist', TALB: 'Album', TAL: 'Album', TDRC: 'Date', TYER: 'Date', TYE: 'Date', TCON: 'Genre', TCO: 'Genre', COMM: 'Comment', COM: 'Comment', TCOP: 'Copyright', TSSE: 'Made with', TENC: 'Made with' }

/** The words in a block of tags at the front of the file, and where the block ends. */
function tagsIn(bytes: Uint8Array, at: number, tags: Read['tags']): number {
  const version = bytes[at + 3]!
  const size = ((bytes[at + 6]! & 0x7F) << 21) | ((bytes[at + 7]! & 0x7F) << 14) | ((bytes[at + 8]! & 0x7F) << 7) | (bytes[at + 9]! & 0x7F)
  const end = at + 10 + size
  const stop = Math.min(end, bytes.length)
  const short = version === 2
  let entry = at + 10
  for (let seen = 0; seen < 200 && entry + (short ? 6 : 10) <= stop && bytes[entry] !== 0; seen++) {
    const id = ascii(bytes, entry, short ? 3 : 4)
    const long = short
      ? (bytes[entry + 3]! << 16) | (bytes[entry + 4]! << 8) | bytes[entry + 5]!
      : version === 4
        ? ((bytes[entry + 4]! & 0x7F) << 21) | ((bytes[entry + 5]! & 0x7F) << 14) | ((bytes[entry + 6]! & 0x7F) << 7) | (bytes[entry + 7]! & 0x7F)
        : ((bytes[entry + 4]! << 24) | (bytes[entry + 5]! << 16) | (bytes[entry + 6]! << 8) | bytes[entry + 7]!) >>> 0
    const start = entry + (short ? 6 : 10)
    if (start + long > stop) break
    const label = TAGS[id]
    if (label && long > 1 && !tags.some((found) => found.label === label)) {
      // The first byte says how the words are written. A comment has a language and a title first.
      const coding = bytes[start]!
      let text = bytes.subarray(start + 1, start + Math.min(long, 1500))
      if (label === 'Comment') {
        text = text.subarray(3)
        const wide = coding === 1 || coding === 2
        let skip = 0
        while (skip + (wide ? 1 : 0) < text.length && (text[skip] !== 0 || (wide && text[skip + 1] !== 0))) skip += wide ? 2 : 1
        text = text.subarray(skip + (wide ? 2 : 1))
      }
      let value: string
      if (coding === 1 || coding === 2) {
        const little = coding === 1 && text[0] === 0xFF && text[1] === 0xFE
        const body = coding === 1 && text.length >= 2 && (little || (text[0] === 0xFE && text[1] === 0xFF)) ? text.subarray(2) : text
        // eslint-disable-next-line no-control-regex -- control characters are exactly what this removes
        value = new TextDecoder(little ? 'utf-16le' : 'utf-16be').decode(body.subarray(0, body.length & ~1)).replace(/[\u0000-\u001F\u007F]+/g, ' ').trim().slice(0, 300)
      } else value = words(text)
      if (value) tags.push({ label, value })
    }
    if ((id === 'APIC' || id === 'PIC') && !tags.some((found) => found.label === 'Picture')) tags.push({ label: 'Picture', value: 'Yes: a cover or another picture is carried inside the file' })
    entry = start + long
  }
  return end + (bytes[at + 5]! & 0x10 ? 10 : 0)
}

export interface Mp3Label extends Read {
  /** Where the first stretch of sound is, and where the last one ends. */
  first: number
  end: number
  kbps: number
  /** The most moments of sound the file could unpack to: every stretch, full. */
  most: number
}

/**
 * Read what an MP3 says about itself and, when the whole file is held, walk it from its first
 * stretch to its last. `bytes` may be only the start of a file of `length` bytes; then the
 * length of the sound is worked out from the file's size and nothing is walked.
 */
export function readMp3(bytes: Uint8Array, length = bytes.length): Mp3Label {
  const tags: Read['tags'] = []
  const whole = bytes.length === length
  let at = 0
  for (let blocks = 0; blocks < 8 && at + 10 <= bytes.length && ascii(bytes, at, 3) === 'ID3'; blocks++) at = tagsIn(bytes, at, tags)
  if (at > length) throw notValid(NAME)
  // Room left empty after the tags, for more to be written later.
  while (at < bytes.length && bytes[at] === 0 && at < 1 << 20) at++
  const first = at
  const one = opening(bytes, at)
  if (one === 'unstated') throw new Refusal('This MP3 does not say how fast its sound is packed, which Omsett cannot read yet')
  if (!one) throw whole || at + 4 <= bytes.length ? notValid(NAME) : cutShort(NAME)

  // The first stretch may hold no sound, and say instead how many stretches follow and how
  // many moments at each end are padding. Files of uneven speed need it to know their length.
  let stated: number | undefined
  let trim = 0
  let counted = false
  const note = at + 4 + one.index
  const kind = ascii(bytes, note, 4)
  if (kind === 'Xing' || kind === 'Info') {
    counted = true
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const flags = note + 8 <= bytes.length ? view.getUint32(note + 4) : 0
    if (flags & 1 && note + 12 <= bytes.length) stated = view.getUint32(note + 8)
    const more = note + 8 + (flags & 1 ? 4 : 0) + (flags & 2 ? 4 : 0) + (flags & 4 ? 100 : 0) + (flags & 8 ? 4 : 0)
    if (more + 24 <= bytes.length && /^(?:LAME|Lavc|Lavf)/.test(ascii(bytes, more, 4))) {
      trim = (bytes[more + 21]! << 4) + (bytes[more + 22]! >> 4) + ((bytes[more + 22]! & 15) << 8) + bytes[more + 23]!
    }
  }

  let stretches = 0
  let walked = 0
  let end = length
  let kbps = one.kbps
  if (whole) {
    let total = 0
    for (;;) {
      const next = opening(bytes, at)
      if (next === 'unstated' || !next || next.edition !== one.edition || next.rate !== one.rate || next.mono !== one.mono) break
      // The last stretch must be all there. A file that stops inside one was cut short.
      if (at + next.size > length) throw cutShort(NAME)
      at += next.size
      total += next.kbps
      stretches++
    }
    end = at
    // After the sound there may be a block of tags, or empty room, and nothing else.
    const rest = bytes.subarray(at)
    const tail = ascii(rest, 0, 11)
    if (rest.some((byte) => byte !== 0) && !/^(?:TAG|APETAGEX|LYRICSBEGIN|ID3|3DI)/.test(tail)) throw new Refusal(DAMAGED)
    kbps = Math.round(total / Math.max(1, stretches))
    walked = stretches
    if (counted) stretches--
    // Some programs count the stretch that holds the count, and some do not.
    if (stated !== undefined && stretches + 1 < stated) throw cutShort(NAME)
    if (stretches < 1) throw noSound(NAME)
  } else {
    // From the start alone: the count the file gives, or its size over its speed.
    stretches = stated ?? Math.floor(((length - first) * one.rate) / (one.kbps * 125 * one.moments))
    if (stated !== undefined && length > first) kbps = Math.round(((length - first) * 8 * one.rate) / (stated * one.moments * 1000))
  }
  const frames = Math.max(0, stretches * one.moments - (stated !== undefined ? trim : 0))
  const sound: Sound = { coding: 'int', bytes: 2, little: true, rate: one.rate, channels: one.mono ? 1 : 2, frames, at: 0 }
  return { sound, tags, notes: [], first, end, kbps, most: walked * one.moments, stored: LOSSY.replace('%s', String(kbps)) }
}

/** What the engine needs of mpg123: something that is fed pieces of a file and hands back sound. */
export interface Mp3Decoder {
  ready: Promise<void>
  decode(data: Uint8Array): { channelData: Float32Array[]; samplesDecoded: number; sampleRate: number; errors: unknown[] }
  free(): void
}
/** And of LAME: something that is fed sound and hands back pieces of a file. */
export interface Mp3Encoder {
  configure(params: { sampleRate: number; channels: 1 | 2; bitrate?: number; vbrQuality?: number; outputSampleRate?: number }): void
  encode(samples: readonly Float32Array[]): Uint8Array
  finalize(): Uint8Array
}
export interface Mp3Host {
  decoder(): Promise<Mp3Decoder>
  encoder(): Promise<Mp3Encoder>
}

/** Unpack an MP3 to 16-bit sound, having first walked it from end to end. */
export async function unpackMp3(bytes: Uint8Array, host: Mp3Host, onProgress: (fraction: number) => void = () => {}): Promise<Read & { data: Uint8Array }> {
  const label = readMp3(bytes)
  const { channels, rate } = label.sound
  // The walk counted the stretches, so the most sound there can be is known before any is unpacked.
  const room = (label.most + 2 * 1152) * channels * 2
  if (room > MAX_SOUND_BYTES) throw new Refusal('This MP3 unpacks to more sound than Omsett can hold in a browser (1 GB)')
  const out = new Int16Array(room / 2)
  let frames = 0
  const decoder = await host.decoder()
  await decoder.ready
  try {
    const PIECE = 256 * 1024
    for (let at = label.first; at < label.end; at += PIECE) {
      const found = decoder.decode(bytes.subarray(at, Math.min(label.end, at + PIECE)))
      if (found.errors.length > 0) throw new Refusal(DAMAGED)
      if (found.samplesDecoded > 0) {
        if (found.sampleRate !== rate || found.channelData.length < channels) throw notValid(NAME)
        if ((frames + found.samplesDecoded) * channels > out.length) throw notValid(NAME)
        for (let c = 0; c < channels; c++) {
          const values = found.channelData[c]!
          for (let i = 0, to = frames * channels + c; i < found.samplesDecoded; i++, to += channels) {
            // Sound comes back as fractions, sometimes a little past the loudest a file can
            // hold. Each is given the nearest of the 65,536 numbers sixteen bits have.
            const value = Math.round(values[i]! * 32768)
            out[to] = value > 32767 ? 32767 : value < -32768 ? -32768 : value || 0
          }
        }
        frames += found.samplesDecoded
      }
      onProgress((at - label.first) / (label.end - label.first))
    }
  } finally {
    decoder.free()
  }
  if (frames === 0) throw noSound(NAME)
  const data = new Uint8Array(out.buffer, 0, frames * channels * 2)
  return { ...label, sound: { ...label.sound, frames }, data }
}

/** How much to leave out, by the names the page gives the choice. */
const QUALITY: Record<string, { vbrQuality?: number; bitrate?: number; said: number }> = {
  smaller: { vbrQuality: 5, said: 50 },
  standard: { vbrQuality: 2, said: 80 },
  best: { bitrate: 320, said: 100 },
}

function crc16(bytes: Uint8Array, from: number, to: number, crc = 0): number {
  for (let i = from; i < to; i++) {
    crc ^= bytes[i]!
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? (crc >>> 1) ^ 0xA001 : crc >>> 1
  }
  return crc
}

/**
 * The stretch that goes first and holds no sound: how many stretches follow, where each
 * hundredth of the file is, and how many moments at each end are padding, so that a player
 * shows the right length and plays exactly the sound that was packed.
 */
function contents(music: Uint8Array, one: Stretch, uneven: boolean, quality: number, moments: number): Uint8Array {
  const offsets: number[] = []
  for (let at = 0; at < music.length; ) {
    const next = opening(music, at)
    if (!next || next === 'unstated') break
    offsets.push(at)
    at += next.size
  }
  // The smallest stretch with room for the list: 4 bytes, the index, 120 for the list, 36 after.
  const speeds = KBPS[one.edition === 3 ? 1 : 2]
  const need = 4 + one.index + 156
  const speed = speeds.findIndex((kbps) => kbps > 0 && Math.floor(((one.edition === 3 ? 144000 : 72000) * kbps) / one.rate) >= need)
  const size = Math.floor(((one.edition === 3 ? 144000 : 72000) * speeds[speed]!) / one.rate)
  const frame = new Uint8Array(size)
  const view = new DataView(frame.buffer)
  frame.set([0xFF, music[1]! | 1, (speed << 4) | (music[2]! & 0x0C), music[3]! & 0xC0])
  let at = 4 + one.index
  const put = (text: string) => {
    for (const letter of text) frame[at++] = letter.charCodeAt(0)
  }
  put(uneven ? 'Xing' : 'Info')
  view.setUint32(at, 0x0F)
  view.setUint32(at + 4, offsets.length)
  view.setUint32(at + 8, size + music.length)
  at += 12
  for (let i = 0; i < 100; i++) frame[at++] = Math.min(255, Math.floor(((size + (offsets[Math.floor((i * offsets.length) / 100)] ?? 0)) * 256) / (size + music.length)))
  view.setUint32(at, quality)
  at += 4
  // What LAME itself would write here. The packer inside is LAME 3.100; players look for its
  // name before they believe the padding counts.
  const extra = at
  put('LAME3.100')
  frame[at++] = uneven ? 4 : 1
  at += 10
  frame[at++] = uneven ? 0 : Math.min(255, one.kbps)
  // LAME holds back 576 moments at the start. What is over at the end is the rest of the last stretch.
  const before = 576
  const after = Math.max(0, Math.min(4095, offsets.length * one.moments - before - moments))
  frame[at++] = before >> 4
  frame[at++] = ((before & 15) << 4) | (after >> 8)
  frame[at++] = after & 0xFF
  at = extra + 28
  view.setUint32(at, size + music.length)
  view.setUint16(at + 4, crc16(music, 0, music.length))
  view.setUint16(at + 6, crc16(frame, 0, at + 6))
  return frame
}

/** An MP3 of this sound. Sound is left out to make it small; how much is the person's choice. */
export async function packMp3(sound: Sound, data: Uint8Array, notes: string[], options: Record<string, unknown>, host: Mp3Host, onProgress: (fraction: number) => void = () => {}): Promise<Uint8Array[]> {
  if (sound.channels > 2) throw new Refusal(`MP3 holds one or two channels of sound, and this file has ${sound.channels}. Choose FLAC or WAV`)
  const from = Math.max(1, Math.round(sound.rate))
  // MP3 holds nine rates and no others. Sound at another is brought to the nearest below it.
  const rate = HELD.find((held) => held <= from) ?? 8000
  if (rate !== from) notes.push(`MP3 cannot hold sound at ${sound.rate.toLocaleString('en', { maximumFractionDigits: 3 })} a second. It is written at ${rate.toLocaleString('en')}, the nearest rate it has.`)
  const chosen = QUALITY[typeof options.soundQuality === 'string' ? options.soundQuality : 'standard'] ?? QUALITY.standard!
  // The slower rates have a lower ceiling on how many bits a second they may use.
  const ceiling = rate >= 32000 ? 320 : rate >= 16000 ? 160 : 64
  const encoder = await host.encoder()
  const channels = sound.channels as 1 | 2
  encoder.configure({ sampleRate: from, channels, outputSampleRate: rate, ...(chosen.bitrate ? { bitrate: Math.min(chosen.bitrate, ceiling) } : { vbrQuality: chosen.vbrQuality }) })

  // A telephone code is unpacked to the sixteen bits it stands for before anything else.
  const law = sound.coding === 'ulaw' || sound.coding === 'alaw'
  if (law) data = recode(data, sound, { coding: 'int', bytes: 2, little: true })
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const { bytes: wide, little, coding } = law ? { bytes: 2, little: true, coding: 'int' as const } : sound
  const read: (at: number) => number =
    coding === 'float' ? (wide === 4 ? (at) => view.getFloat32(at, little) : (at) => view.getFloat64(at, little))
    : coding === 'uint' ? (at) => (data[at]! - 128) / 128
    : wide === 1 ? (at) => view.getInt8(at) / 128
    : wide === 2 ? (at) => view.getInt16(at, little) / 32768
    : wide === 3 ? (at) => (little ? data[at]! | (data[at + 1]! << 8) | (view.getInt8(at + 2) << 16) : (view.getInt8(at) << 16) | (data[at + 1]! << 8) | data[at + 2]!) / 8388608
    : (at) => view.getInt32(at, little) / 2147483648
  const BLOCK = 1152 * 32
  const blocks = Array.from({ length: channels }, () => new Float32Array(BLOCK))
  const parts: Uint8Array[] = []
  let size = 0
  for (let done = 0; done < sound.frames; done += BLOCK) {
    const count = Math.min(BLOCK, sound.frames - done)
    for (let c = 0; c < channels; c++) {
      const block = blocks[c]!
      for (let i = 0, at = (done * channels + c) * wide; i < count; i++, at += channels * wide) block[i] = read(at) || 0
    }
    // What comes back belongs to the encoder and is written over by the next call, so it is copied.
    const packed = encoder.encode(blocks.map((block) => block.subarray(0, count))).slice()
    parts.push(packed)
    size += packed.length
    onProgress(done / sound.frames)
  }
  const last = encoder.finalize().slice()
  parts.push(last)
  size += last.length
  const music = new Uint8Array(size)
  let at = 0
  for (const part of parts) {
    music.set(part, at)
    at += part.length
  }
  const one = opening(music, 0)
  if (!one || one === 'unstated') throw new Refusal('This sound could not be packed as MP3')
  const moments = Math.round((sound.frames * rate) / from)
  return [contents(music, one, chosen.bitrate === undefined, chosen.said, moments), music]
}
