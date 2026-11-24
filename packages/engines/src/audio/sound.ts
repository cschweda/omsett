import { Refusal } from '../util'

// Sound that is stored unpacked: one number for each channel, so many times a second. WAV, AIFF
// and AU all hold it that way and differ only in the label on the front and the order of the
// bytes in each number. Converting moves the numbers from one to another and changes none of
// them. Nothing here listens to the sound or works anything out from it.

/** How each number is written: a whole number, one with no sign, a fraction, or a telephone code. */
export type Coding = 'int' | 'uint' | 'float' | 'ulaw' | 'alaw'

export interface Layout {
  coding: Coding
  /** Bytes to a number, as stored. */
  bytes: number
  /** Whether the smallest byte of a number comes first. */
  little: boolean
}

export interface Sound extends Layout {
  /** Numbers a second for each channel. AIFF can state a fraction; old Macs recorded at one. */
  rate: number
  channels: number
  /** How many moments of sound: one number for every channel in each. */
  frames: number
  /** Where the sound starts in the file. */
  at: number
}

export interface Read {
  sound: Sound
  /** What the file says about itself: a title, who made it. None of it is carried across. */
  tags: Array<{ label: string; value: string }>
  /** Something found on the way that the person should know. */
  notes: string[]
}

/** More channels than this is not read. Surround sound has eight; a recording desk, sixty-four. */
export const MAX_CHANNELS = 64
/** The fastest rate read. Studio sound is 192,000 a second; nothing real is near this. */
export const MAX_RATE = 4_000_000

export const notValid = (name: string) => new Refusal(`This file is not a valid ${name} file`)
export const cutShort = (name: string) => new Refusal(`This ${name} says it holds more sound than the file has. It may have been cut short`)
export const noSound = (name: string) => new Refusal(`This ${name} has no sound in it`)
export const packed = (name: string, how?: string) =>
  new Refusal(`This ${name} holds its sound ${how ? `as ${how}` : 'packed'}, which Omsett cannot read yet. It reads sound that is stored unpacked`)

/** A rate and a count of channels that a sound could have, or the file is refused. */
export function checked(name: string, sound: Sound, length: number): Sound {
  const { rate, channels, frames, bytes, at } = sound
  if (!Number.isFinite(rate) || rate < 1 || rate > MAX_RATE) throw notValid(name)
  if (!Number.isInteger(channels) || channels < 1) throw notValid(name)
  if (channels > MAX_CHANNELS) throw new Refusal(`This ${name} says it has ${channels.toLocaleString('en')} channels of sound. Omsett reads up to ${MAX_CHANNELS}`)
  if (!Number.isInteger(frames) || frames < 0) throw notValid(name)
  if (at + frames * channels * bytes > length) throw cutShort(name)
  if (frames === 0) throw noSound(name)
  return sound
}

/** Words a file gave for itself, made fit to show: no control codes, and not long. */
export function words(bytes: Uint8Array): string {
  let end = bytes.indexOf(0)
  if (end < 0) end = bytes.length
  const raw = bytes.subarray(0, Math.min(end, 1200))
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(raw)
  } catch {
    text = new TextDecoder('latin1').decode(raw)
  }
  // eslint-disable-next-line no-control-regex -- control characters are exactly what this removes
  return text.replace(/[\u0000-\u001F\u007F]+/g, ' ').trim().slice(0, 300)
}

// The two telephone codes, µ-law and A-law, squeeze a sound into eight bits by spacing loud
// values further apart than quiet ones. Each of the 256 codes stands for one 16-bit value, so
// unpacking is a lookup and is exact. These are the reference tables of the G.711 standard.
function ulaw(code: number): number {
  const u = ~code & 0xFF
  const t = (((u & 0x0F) << 3) + 0x84) << ((u & 0x70) >> 4)
  return u & 0x80 ? 0x84 - t : t - 0x84
}
function alaw(code: number): number {
  const a = code ^ 0x55
  const segment = (a & 0x70) >> 4
  let t = (a & 0x0F) << 4
  if (segment === 0) t += 8
  else t = (t + 0x108) << (segment - 1)
  return a & 0x80 ? t : -t
}
const table = (unpack: (code: number) => number) => Int16Array.from({ length: 256 }, (_, code) => unpack(code))
let tables: { ulaw: Int16Array; alaw: Int16Array } | undefined

/** The layout a sound takes in a file whose numbers run one way: the same numbers, that way round. */
export function layoutIn(sound: Layout, little: boolean, unsignedBytes: boolean): Layout {
  // A telephone code is unpacked to the sixteen bits it stands for.
  if (sound.coding === 'ulaw' || sound.coding === 'alaw') return { coding: 'int', bytes: 2, little }
  if (sound.coding === 'float') return { coding: 'float', bytes: sound.bytes, little }
  // A single byte is written without a sign in WAV and with one everywhere else.
  return { coding: sound.bytes === 1 && unsignedBytes ? 'uint' : 'int', bytes: sound.bytes, little }
}

/**
 * The same sound in another layout. No number changes: the bytes of each are turned round, a
 * single byte gains or loses its sign, or a telephone code is unpacked to what it stands for.
 */
export function recode(data: Uint8Array, from: Layout, to: Layout): Uint8Array {
  if (from.coding === 'ulaw' || from.coding === 'alaw') {
    tables ??= { ulaw: table(ulaw), alaw: table(alaw) }
    const values = tables[from.coding]
    const out = new Uint8Array(data.length * 2)
    const [low, high] = to.little ? [0, 1] : [1, 0]
    for (let i = 0; i < data.length; i++) {
      const value = values[data[i]!]!
      out[i * 2 + low] = value & 0xFF
      out[i * 2 + high] = (value >> 8) & 0xFF
    }
    return out
  }
  const width = from.bytes
  const turn = width > 1 && from.little !== to.little
  const sign = (from.coding === 'uint') !== (to.coding === 'uint')
  if (!turn && !sign) return data
  const out = new Uint8Array(data.length)
  if (turn) {
    for (let i = 0; i + width <= data.length; i += width) {
      for (let b = 0; b < width; b++) out[i + b] = data[i + width - 1 - b]!
    }
  } else {
    for (let i = 0; i < data.length; i++) out[i] = data[i]! ^ 0x80
  }
  return out
}

/** What a telephone code was unpacked from, said once in the result. */
export const unpackedNote = (coding: Coding): string | null =>
  coding === 'ulaw' || coding === 'alaw'
    ? `The sound was stored in ${coding === 'ulaw' ? 'µ-law' : 'A-law'}, a telephone code of eight bits. It is written as the 16-bit sound that code stands for, which every player reads.`
    : null

/** A rate with a fraction, for a format that states whole numbers only. */
export function wholeRate(rate: number, name: string, notes: string[]): number {
  const whole = Math.max(1, Math.round(rate))
  if (whole !== rate) notes.push(`The file's rate, ${rate.toLocaleString('en', { maximumFractionDigits: 3 })} a second, has a fraction. ${name} states whole numbers, so it is written as ${whole.toLocaleString('en')}.`)
  return whole
}
