import { Refusal } from '../util'
import { Md5 } from './md5'
import { cutShort, MAX_RATE, notValid, noSound, words, type Read } from './sound'

// FLAC: sound packed without loss. Each stretch of sound is written as a guess at every number
// from the ones before it, and then how far off each guess was, which takes far fewer bits than
// the numbers do. Unpacking makes the same guesses and adds the differences back, and arrives
// at exactly the numbers that were packed. The file carries a checksum of them to prove it.
//
// Everything a FLAC says is checked as it is read: each stretch against its own two checksums,
// each number against the room it is meant to fit in, and the whole against the file's.

const NAME = 'FLAC'
/** The most sound a file is unpacked to. A FLAC of a few bytes can say it holds days. */
export const MAX_SOUND_BYTES = 1024 ** 3
export const tooMuch = () => new Refusal('This FLAC unpacks to more sound than Omsett can hold in a browser (1 GB)')
/** And the most where the file does not say how much it holds, so that nothing can be checked first. */
export const MAX_UNSTATED_BYTES = 256 * 1024 * 1024
export const tooMuchUnstated = () => new Refusal('This FLAC does not say how much sound it holds, and unpacks to more than Omsett will take on trust (256 MB)')
export const DAMAGED = 'This FLAC is damaged: part of it does not match its own checksum'
export const WRONG_SOUND = 'This FLAC is damaged: the sound it unpacks to is not the sound its checksum was made from'

/** Words about the sound, by the names FLAC gives them. */
const COMMENTS: Record<string, string> = {
  TITLE: 'Title',
  ARTIST: 'Artist',
  ALBUM: 'Album',
  DATE: 'Date',
  GENRE: 'Genre',
  COMMENT: 'Comment',
  DESCRIPTION: 'Comment',
  COPYRIGHT: 'Copyright',
  ENCODER: 'Made with',
}

/** Two checksums: one byte for the start of each stretch of sound, two for the whole of it. */
const CRC8 = Uint8Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = value & 0x80 ? ((value << 1) ^ 0x07) & 0xFF : (value << 1) & 0xFF
  return value
})
const CRC16 = Uint16Array.from({ length: 256 }, (_, i) => {
  let value = i << 8
  for (let bit = 0; bit < 8; bit++) value = value & 0x8000 ? ((value << 1) ^ 0x8005) & 0xFFFF : (value << 1) & 0xFFFF
  return value
})
export function crc8(bytes: Uint8Array, from: number, to: number): number {
  let crc = 0
  for (let i = from; i < to; i++) crc = CRC8[crc ^ bytes[i]!]!
  return crc
}
export function crc16(bytes: Uint8Array, from: number, to: number): number {
  let crc = 0
  for (let i = from; i < to; i++) crc = ((crc << 8) & 0xFFFF) ^ CRC16[(crc >> 8) ^ bytes[i]!]!
  return crc
}

export interface FlacLabel extends Read {
  /** Bits to a number, which need not be a whole count of bytes. */
  bits: number
  /** Where the sound starts. */
  first: number
  /** The checksum of the sound, or all zeros where the file gives none. */
  md5: Uint8Array
}

/**
 * Read what a FLAC says about itself, without unpacking any sound. `bytes` may be only the
 * start of a file of `length` bytes.
 */
export function readFlac(bytes: Uint8Array, length = bytes.length): FlacLabel {
  let at = 0
  // Some programs put a block of an MP3's tags in front. Its length is in its own header.
  if (bytes.length >= 10 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    at = 10 + ((bytes[6]! & 0x7F) << 21) + ((bytes[7]! & 0x7F) << 14) + ((bytes[8]! & 0x7F) << 7) + (bytes[9]! & 0x7F) + (bytes[5]! & 0x10 ? 10 : 0)
  }
  if (at + 4 + 4 + 34 > bytes.length || String.fromCharCode(...bytes.subarray(at, at + 4)) !== 'fLaC') throw notValid(NAME)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  at += 4
  let label: Omit<FlacLabel, 'tags' | 'notes' | 'first'> | undefined
  const tags: Read['tags'] = []
  const add = (name: string, value: string) => value && !tags.some((found) => found.label === name) && tags.push({ label: name, value })
  for (let blocks = 0; ; blocks++) {
    if (blocks > 1024 || at + 4 > bytes.length) {
      // The list of parts runs past what is held. Of a whole file that is damage; of the start
      // of one, it is only that there is more to the list than was read.
      if (bytes.length === length || !label) throw notValid(NAME)
      break
    }
    const kind = bytes[at]! & 0x7F
    const last = bytes[at]! >= 0x80
    const size = (bytes[at + 1]! << 16) | (bytes[at + 2]! << 8) | bytes[at + 3]!
    const start = at + 4
    if (start + size > length) throw label ? cutShort(NAME) : notValid(NAME)
    const held = start + size <= bytes.length
    if (blocks === 0) {
      // The first part is always the one that says how the sound is stored.
      if (kind !== 0 || size !== 34) throw notValid(NAME)
      const rate = (bytes[start + 10]! << 12) | (bytes[start + 11]! << 4) | (bytes[start + 12]! >> 4)
      const channels = ((bytes[start + 12]! >> 1) & 7) + 1
      const bits = (((bytes[start + 12]! & 1) << 4) | (bytes[start + 13]! >> 4)) + 1
      const frames = (bytes[start + 13]! & 0x0F) * 2 ** 32 + view.getUint32(start + 14)
      if (rate < 1 || rate > MAX_RATE || bits < 4) throw notValid(NAME)
      label = {
        sound: { coding: 'int', bytes: Math.ceil(bits / 8), little: true, rate, channels, frames, at: 0 },
        bits,
        md5: bytes.slice(start + 18, start + 34),
      }
    } else if (kind === 4 && held && size >= 8) {
      // Comments: who made the file, then a list of "NAME=words". Lengths here are smallest byte first.
      const end = start + size
      const vendor = view.getUint32(start, true)
      let entry = start + 4 + vendor
      if (entry + 4 <= end) {
        const count = Math.min(view.getUint32(entry, true), 256)
        entry += 4
        for (let i = 0; i < count && entry + 4 <= end; i++) {
          const long = view.getUint32(entry, true)
          if (entry + 4 + long > end) break
          const text = bytes.subarray(entry + 4, entry + 4 + Math.min(long, 1400))
          const equals = text.indexOf(0x3D)
          const name = equals > 0 ? COMMENTS[String.fromCharCode(...text.subarray(0, Math.min(equals, 32))).toUpperCase()] : undefined
          if (name) add(name, words(text.subarray(equals + 1)))
          entry += 4 + long
        }
        if (start + 4 + vendor <= end) add('Made with', words(bytes.subarray(start + 4, start + 4 + Math.min(vendor, 300))))
      }
    } else if (kind === 6 && size > 0) {
      add('Picture', 'Yes: a cover or another picture is carried inside the file')
    } else if (kind === 127) {
      throw notValid(NAME)
    }
    at = start + size
    if (last) break
  }
  if (!label) throw notValid(NAME)
  return { ...label, tags, notes: [], first: at, packing: 'packed by FLAC, with nothing lost' }
}

/** Thrown where the bits run out before the file said they would. */
const END = new Error('end')

/** A file read a few bits at a time, largest bit first. */
class Bits {
  private left = 0
  private byte = 0
  constructor(private readonly bytes: Uint8Array, public at: number) {}

  /** The next `count` bits as a number that is never negative. Up to 36 at once. */
  read(count: number): number {
    let value = 0
    while (count > 0) {
      if (this.left === 0) {
        if (this.at >= this.bytes.length) throw END
        this.byte = this.bytes[this.at++]!
        this.left = 8
      }
      const take = count < this.left ? count : this.left
      this.left -= take
      value = value * (1 << take) + ((this.byte >> this.left) & ((1 << take) - 1))
      count -= take
    }
    return value
  }

  /** The same, where the first bit is a sign. */
  signed(count: number): number {
    const value = this.read(count)
    return value >= 2 ** (count - 1) ? value - 2 ** count : value
  }

  /** How many zeros come before the next one, which is passed over too. */
  zeros(): number {
    let count = 0
    for (;;) {
      if (this.left === 0) {
        if (this.at >= this.bytes.length) throw END
        this.byte = this.bytes[this.at++]!
        this.left = 8
      }
      const rest = this.byte & ((1 << this.left) - 1)
      if (rest === 0) {
        count += this.left
        this.left = 0
        continue
      }
      const before = Math.clz32(rest) - (32 - this.left)
      this.left -= before + 1
      return count + before
    }
  }

  /** Pass over what is left of the byte being read. */
  align(): void {
    this.left = 0
  }
}

const invalid = () => notValid(NAME)

/** How far off each guess was, for the numbers of one channel from `from` on. */
function differences(bits: Bits, out: Float64Array, from: number, count: number): void {
  const method = bits.read(2)
  if (method > 1) throw invalid()
  const order = bits.read(4)
  const parts = 1 << order
  if (order > 0 && count % parts !== 0) throw invalid()
  const each = count >> order
  const wide = method ? 5 : 4
  const escape = method ? 31 : 15
  let at = from
  for (let part = 0; part < parts; part++) {
    const many = each - (part === 0 ? from : 0)
    if (many < 0) throw invalid()
    const k = bits.read(wide)
    if (k === escape) {
      // Written plainly, each in the same few bits.
      const plain = bits.read(5)
      for (let i = 0; i < many; i++) out[at++] = plain ? bits.signed(plain) : 0
    } else {
      const scale = 2 ** k
      for (let i = 0; i < many; i++) {
        const folded = bits.zeros() * scale + (k ? bits.read(k) : 0)
        // No difference is wider than thirty-two bits; one that claims to be is not sound.
        if (folded >= 2 ** 33) throw invalid()
        out[at++] = folded % 2 ? -(folded + 1) / 2 : folded / 2
      }
    }
  }
}

/** One channel of one stretch: `count` numbers of `depth` bits, in whichever way it was packed. */
function channel(bits: Bits, out: Float64Array, count: number, depth: number): void {
  if (bits.read(1) !== 0) throw invalid()
  const kind = bits.read(6)
  // Low bits that are nothing in every number are left out and counted instead.
  const spare = bits.read(1) ? bits.zeros() + 1 : 0
  depth -= spare
  if (depth < 1) throw invalid()
  if (kind === 0) {
    out.fill(bits.signed(depth), 0, count)
  } else if (kind === 1) {
    for (let i = 0; i < count; i++) out[i] = bits.signed(depth)
  } else if (kind >= 8 && kind <= 12) {
    // A guess by one of five fixed rules, from the last few numbers.
    const order = kind - 8
    if (order > count) throw invalid()
    for (let i = 0; i < order; i++) out[i] = bits.signed(depth)
    differences(bits, out, order, count)
    if (order === 1) for (let i = 1; i < count; i++) out[i]! += out[i - 1]!
    else if (order === 2) for (let i = 2; i < count; i++) out[i]! += 2 * out[i - 1]! - out[i - 2]!
    else if (order === 3) for (let i = 3; i < count; i++) out[i]! += 3 * out[i - 1]! - 3 * out[i - 2]! + out[i - 3]!
    else if (order === 4) for (let i = 4; i < count; i++) out[i]! += 4 * out[i - 1]! - 6 * out[i - 2]! + 4 * out[i - 3]! - out[i - 4]!
  } else if (kind >= 32) {
    // A guess by a rule made for this stretch: so much of each of the last few numbers.
    const order = (kind & 31) + 1
    if (order > count) throw invalid()
    for (let i = 0; i < order; i++) out[i] = bits.signed(depth)
    const precision = bits.read(4) + 1
    if (precision === 16) throw invalid()
    const shift = bits.signed(5)
    if (shift < 0) throw invalid()
    const weights = new Float64Array(order)
    for (let i = 0; i < order; i++) weights[i] = bits.signed(precision)
    differences(bits, out, order, count)
    const scale = 2 ** shift
    // Ordinary arithmetic is exact to fifty-three bits. Where a sum could pass that, it is done
    // the slow way, with numbers that have no limit.
    if (depth + precision + Math.ceil(Math.log2(order)) <= 52) {
      for (let i = order; i < count; i++) {
        let sum = 0
        for (let j = 0; j < order; j++) sum += weights[j]! * out[i - 1 - j]!
        out[i]! += Math.floor(sum / scale)
      }
    } else {
      const big = Array.from(weights, (weight) => BigInt(weight))
      for (let i = order; i < count; i++) {
        let sum = 0n
        for (let j = 0; j < order; j++) sum += big[j]! * BigInt(out[i - 1 - j]!)
        out[i]! += Number(sum >> BigInt(shift))
      }
    }
  } else {
    throw invalid()
  }
  if (spare) {
    const scale = 2 ** spare
    for (let i = 0; i < count; i++) out[i]! *= scale
  }
}

const BLOCKS = [0, 192, 576, 1152, 2304, 4608, 0, 0, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768]
const DEPTHS = [0, 8, 12, 0, 16, 20, 24, 32]

/**
 * Unpack a FLAC to its numbers: whole numbers, smallest byte first, as many bytes each as its
 * bits need. Refuses a file that does not unpack to exactly what it says it holds.
 */
export function unpackFlac(bytes: Uint8Array, onProgress: (fraction: number) => void = () => {}): Read & { data: Uint8Array } {
  const label = readFlac(bytes)
  const { sound, bits: depth } = label
  const { channels, bytes: wide } = sound
  const moment = channels * wide
  if (sound.frames * moment > MAX_SOUND_BYTES) throw tooMuch()
  // Where the file does not say how much sound it holds, room is made as the sound arrives.
  const known = sound.frames > 0
  let out = new Uint8Array(known ? sound.frames * moment : 1 << 20)
  let frames = 0
  const work = Array.from({ length: channels }, () => new Float64Array(65535))
  const half = 2 ** (depth - 1)
  const reader = new Bits(bytes, label.first)
  try {
    while (known ? frames < sound.frames : reader.at < bytes.length) {
      const start = reader.at
      // Every stretch opens with the same fourteen bits, so that a reader can find its place.
      if (reader.read(15) !== 0x7FFC) throw invalid()
      reader.read(1)
      const sizeCode = reader.read(4)
      const rateCode = reader.read(4)
      const layout = reader.read(4)
      const depthCode = reader.read(3)
      if (reader.read(1) !== 0 || sizeCode === 0 || rateCode === 15 || layout > 10 || depthCode === 3) throw invalid()
      // Which stretch this is, written the way UTF-8 writes a character. It is not needed here.
      const lead = reader.read(8)
      const more = lead < 0x80 ? 0 : Math.clz32(~(lead << 24))  - 1
      if (lead >= 0x80 && (more < 1 || more > 6)) throw invalid()
      for (let i = 0; i < more; i++) if (reader.read(8) >> 6 !== 2) throw invalid()
      const count = sizeCode === 6 ? reader.read(8) + 1 : sizeCode === 7 ? reader.read(16) + 1 : BLOCKS[sizeCode]!
      if (rateCode === 12) reader.read(8)
      else if (rateCode === 13 || rateCode === 14) reader.read(16)
      if (reader.read(8) !== crc8(bytes, start, reader.at - 1)) throw new Refusal(DAMAGED)
      // A stretch that disagrees with the file about how the sound is stored is not followed.
      if ((layout < 8 ? layout + 1 : 2) !== channels || (depthCode !== 0 && DEPTHS[depthCode] !== depth)) throw invalid()
      if (count > 65535 || (known && frames + count > sound.frames)) throw invalid()

      // Two channels are often written as one of them and the difference between the two, which
      // is smaller. The difference needs one bit more than either.
      for (let c = 0; c < channels; c++) {
        const side = (layout === 8 && c === 1) || (layout === 9 && c === 0) || (layout === 10 && c === 1)
        channel(reader, work[c]!, count, depth + (side ? 1 : 0))
      }
      reader.align()
      if (reader.read(16) !== crc16(bytes, start, reader.at - 2)) throw new Refusal(DAMAGED)
      const [a, b] = [work[0]!, work[1]!]
      if (layout === 8) for (let i = 0; i < count; i++) b[i] = a[i]! - b[i]!
      else if (layout === 9) for (let i = 0; i < count; i++) a[i]! += b[i]!
      else if (layout === 10) {
        for (let i = 0; i < count; i++) {
          const side = b[i]!
          const middle = a[i]! * 2 + Math.abs(side % 2)
          a[i] = (middle + side) / 2
          b[i] = (middle - side) / 2
        }
      }

      if (!known && (frames + count) * moment > out.length) {
        if ((frames + count) * moment > MAX_UNSTATED_BYTES) throw tooMuchUnstated()
        const larger = new Uint8Array(Math.min(MAX_UNSTATED_BYTES, Math.max(out.length * 2, (frames + count) * moment)))
        larger.set(out.subarray(0, frames * moment))
        out = larger
      }
      for (let c = 0; c < channels; c++) {
        const values = work[c]!
        let at = frames * moment + c * wide
        for (let i = 0; i < count; i++, at += moment) {
          const value = values[i]!
          // A number that does not fit the bits the file promised is not one this file packed.
          if (!(value >= -half && value < half)) throw invalid()
          out[at] = value & 0xFF
          if (wide > 1) out[at + 1] = (value >> 8) & 0xFF
          if (wide > 2) out[at + 2] = (value >> 16) & 0xFF
          if (wide > 3) out[at + 3] = (value >> 24) & 0xFF
        }
      }
      frames += count
      onProgress(known ? frames / sound.frames : reader.at / bytes.length)
    }
  } catch (error) {
    if (error === END) throw cutShort(NAME)
    throw error
  }
  if (frames === 0) throw noSound(NAME)
  const data = out.subarray(0, frames * moment)
  // The file's own proof: a checksum of every number, made when it was packed.
  if (label.md5.some((byte) => byte !== 0)) {
    const found = new Md5().update(data).digest()
    if (found.some((byte, i) => byte !== label.md5[i])) throw new Refusal(WRONG_SOUND)
  }
  // Numbers of, say, twenty bits are moved to the top of their three bytes, where WAV, AIFF
  // and AU all keep them. Each is multiplied by the same power of two; none is changed.
  const lift = wide * 8 - depth
  if (lift > 0) {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
    for (let at = 0; at < data.length; at += wide) {
      if (wide === 1) data[at] = (data[at]! << lift) & 0xFF
      else if (wide === 2) view.setInt16(at, view.getInt16(at, true) << lift, true)
      else if (wide === 3) {
        const value = ((data[at]! | (data[at + 1]! << 8) | (data[at + 2]! << 16)) << lift) & 0xFFFFFF
        data[at] = value & 0xFF
        data[at + 1] = (value >> 8) & 0xFF
        data[at + 2] = value >> 16
      } else view.setInt32(at, view.getInt32(at, true) << lift, true)
    }
  }
  const notes = known ? [] : ['The file did not say how much sound it holds, so it was unpacked to its end.']
  return { ...label, notes, sound: { ...sound, frames, at: 0 }, data }
}
