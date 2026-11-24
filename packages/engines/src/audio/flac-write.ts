import { Refusal } from '../util'
import { crc16, crc8 } from './flac'
import { Md5 } from './md5'
import { recode, unpackedNote, wholeRate, type Sound } from './sound'

// Packing sound as FLAC. Each stretch of 4,096 moments is written channel by channel: a guess
// at each number from the few before it, by one of five fixed rules, and then how far off the
// guess was, in a code that spends few bits on small numbers. Whichever rule leaves the least
// to write is used; where none helps, the numbers are written as they are. Nothing is rounded
// and nothing is left out, and the file carries a checksum of the sound to prove it.
//
// The reference packer also fits a rule to each stretch, which this does not, so its files
// come out a few percent smaller. The sound in both is the same.

const NAME = 'FLAC'
const BLOCK = 4096
/** The most a FLAC can say: eight channels, and a rate that fits in twenty bits. */
const MAX_CHANNELS = 8
const MAX_RATE = 0xFFFFF

/** Bits written one after another, largest first. */
class Writer {
  bytes: Uint8Array
  at = 0
  private byte = 0
  private used = 0
  constructor(room: number) {
    this.bytes = new Uint8Array(room)
  }

  /** The low `count` bits of a number that is not negative. Up to 32 at once. */
  put(value: number, count: number): void {
    while (count > 0) {
      const take = Math.min(count, 8 - this.used)
      count -= take
      this.byte = (this.byte << take) | (Math.floor(value / 2 ** count) & ((1 << take) - 1))
      this.used += take
      if (this.used === 8) {
        this.bytes[this.at++] = this.byte
        this.byte = 0
        this.used = 0
      }
    }
  }

  signed(value: number, count: number): void {
    this.put(value < 0 ? value + 2 ** count : value, count)
  }

  /** So many zeros and then a one. */
  zeros(count: number): void {
    while (count >= 8 - this.used) {
      count -= 8 - this.used
      this.bytes[this.at++] = this.byte << (8 - this.used)
      this.byte = 0
      this.used = 0
    }
    this.byte = (this.byte << (count + 1)) | 1
    this.used += count + 1
    if (this.used === 8) {
      this.bytes[this.at++] = this.byte
      this.byte = 0
      this.used = 0
    }
  }

  align(): void {
    if (this.used > 0) this.put(0, 8 - this.used)
  }
}

/** A number as UTF-8 would write a character: how each stretch says which one it is. */
function counted(writer: Writer, value: number): void {
  if (value < 0x80) return writer.put(value, 8)
  let more = 1
  while (more < 6 && value >= 2 ** (6 + 5 * more)) more++
  writer.put((0xFF << (7 - more)) & 0xFF | Math.floor(value / 2 ** (6 * more)), 8)
  for (let i = more - 1; i >= 0; i--) writer.put(0x80 | (Math.floor(value / 2 ** (6 * i)) & 0x3F), 8)
}

interface Plan {
  /** Which of the five rules, or -1 for all the same number, or -2 for the numbers as they are. */
  order: number
  /** Low bits that are nothing in every number. */
  spare: number
  /** About how many bits this will take. */
  cost: number
}

const scratch = new Float64Array(5)
const reach = new Float64Array(5)

/** Choose how to write one channel of one stretch, by trying each rule and adding up what is left. */
function plan(values: Int32Array, count: number, depth: number): Plan {
  let all = 0
  let same = true
  for (let i = 0; i < count; i++) {
    all |= values[i]!
    if (values[i] !== values[0]) same = false
  }
  if (same) return { order: -1, spare: 0, cost: depth }
  const spare = all === 0 ? 0 : Math.min(31 - Math.clz32(all & -all), depth - 1)
  const plain = { order: -2, spare, cost: (depth - spare) * count }
  if (count <= 4) return plain
  // What is left by each rule is the difference of what was left by the one before.
  const sums = scratch.fill(0)
  const widest = reach.fill(0)
  let [a, b, c, d] = [0, 0, 0, 0]
  const scale = 2 ** spare
  for (let i = 0; i < count; i++) {
    const e0 = values[i]! / scale
    const e1 = e0 - a
    const e2 = e1 - b
    const e3 = e2 - c
    const e4 = e3 - d
    a = e0
    b = e1
    c = e2
    d = e3
    if (i >= 4) {
      const sizes = [Math.abs(e0), Math.abs(e1), Math.abs(e2), Math.abs(e3), Math.abs(e4)]
      for (let rule = 0; rule < 5; rule++) {
        sums[rule]! += sizes[rule]!
        if (sizes[rule]! > widest[rule]!) widest[rule] = sizes[rule]!
      }
    }
  }
  // A difference must fit in thirty-two bits. With 32-bit sound some rules can leave wider
  // ones; those rules are passed over, and if none is left the numbers are written as they are.
  let order = -1
  for (let rule = 0; rule < 5; rule++) if (widest[rule]! < 2 ** 30 && (order < 0 || sums[rule]! < sums[order]!)) order = rule
  if (order < 0) return plain
  const mean = (sums[order]! * 2) / (count - 4)
  const k = mean > 1 ? Math.floor(Math.log2(mean)) : 0
  const cost = order * (depth - spare) + (count - order) * (k + 1) + (sums[order]! * 2) / 2 ** k + 16
  return cost < plain.cost ? { order, spare, cost } : plain
}

const left = new Float64Array(BLOCK)

/** Write one channel of one stretch as planned. */
function channel(writer: Writer, values: Int32Array, count: number, depth: number, chosen: Plan): void {
  const { spare } = chosen
  let { order } = chosen
  const inner = depth - spare
  const scale = 2 ** spare
  let best = { parts: 0, bits: Infinity, ks: [] as number[] }
  if (order >= 0) {
    // What each guess left, folded so that small numbers of either sign are small and positive.
    const x = (i: number) => values[i]! / scale
    for (let i = order; i < count; i++) {
      const e =
        order === 0 ? x(i)
        : order === 1 ? x(i) - x(i - 1)
        : order === 2 ? x(i) - 2 * x(i - 1) + x(i - 2)
        : order === 3 ? x(i) - 3 * x(i - 1) + 3 * x(i - 2) - x(i - 3)
        : x(i) - 4 * x(i - 1) + 6 * x(i - 2) - 4 * x(i - 3) + x(i - 4)
      left[i] = e < 0 ? -2 * e - 1 : 2 * e
    }
    // The stretch is cut into equal parts, each with its own setting for the code, where that
    // saves more than saying the settings costs. Tried at every size of part; the best is kept.
    for (let parts = 0; parts <= 6 && count % (1 << parts) === 0 && count >> parts > order; parts++) {
      const each = count >> parts
      const ks: number[] = []
      let bits = 0
      for (let part = 0; part < 1 << parts; part++) {
        const from = part === 0 ? order : part * each
        const to = (part + 1) * each
        let sum = 0
        for (let i = from; i < to; i++) sum += left[i]!
        const mean = sum / (to - from)
        let k = mean > 1 ? Math.min(30, Math.floor(Math.log2(mean))) : 0
        const spend = (at: number) => (to - from) * (at + 1) + sum / 2 ** at
        if (k < 30 && spend(k + 1) < spend(k)) k++
        ks.push(k)
        bits += 5 + spend(k)
      }
      if (bits < best.bits) best = { parts, bits, ks }
    }
    // That count is never under what the code really takes. Where it is no better than the
    // numbers as they are, they are written as they are, so no stretch can outgrow its room.
    if (best.bits + order * inner + 6 >= inner * count) order = -2
  }

  writer.put(0, 1)
  writer.put(order === -1 ? 0 : order === -2 ? 1 : 8 + order, 6)
  if (spare > 0) {
    writer.put(1, 1)
    writer.zeros(spare - 1)
  } else writer.put(0, 1)
  if (order === -1) return writer.signed(values[0]!, inner)
  if (order === -2) {
    for (let i = 0; i < count; i++) writer.signed(values[i]! / scale, inner)
    return
  }
  for (let i = 0; i < order; i++) writer.signed(values[i]! / scale, inner)
  const long = best.ks.some((k) => k > 14)
  writer.put(long ? 1 : 0, 2)
  writer.put(best.parts, 4)
  const each = count >> best.parts
  for (let part = 0; part < 1 << best.parts; part++) {
    const k = best.ks[part]!
    writer.put(k, long ? 5 : 4)
    const scaleK = 2 ** k
    for (let i = part === 0 ? order : part * each; i < (part + 1) * each; i++) {
      const high = Math.floor(left[i]! / scaleK)
      writer.zeros(high)
      if (k) writer.put(left[i]! - high * scaleK, k)
    }
  }
}

/** A FLAC holding this sound. */
export function writeFlac(sound: Sound, source: Uint8Array, notes: string[], onProgress: (fraction: number) => void = () => {}): Uint8Array[] {
  if (sound.channels > MAX_CHANNELS) throw new Refusal(`FLAC holds up to ${MAX_CHANNELS} channels of sound, and this file has ${sound.channels}. Choose WAV or AIFF`)
  const rate = wholeRate(sound.rate, NAME, notes)
  if (rate > MAX_RATE) throw new Refusal(`FLAC cannot state a rate above ${MAX_RATE.toLocaleString('en')} a second, and this sound runs at ${rate.toLocaleString('en')}. Choose WAV or AIFF`)
  const note = unpackedNote(sound.coding)
  if (note) notes.push(note)
  const float = sound.coding === 'float'
  // FLAC holds whole numbers only. Fractions are written as the nearest of 16.7 million steps.
  if (float) notes.push('The sound was stored as fractions, which FLAC cannot hold. It is written as 24-bit whole numbers, the nearest FLAC has. The difference is far below anything that can be heard.')
  const law = sound.coding === 'ulaw' || sound.coding === 'alaw'
  const data = law ? recode(source, sound, { coding: 'int', bytes: 2, little: true }) : source
  const from = law ? 2 : sound.bytes
  const wide = float ? 3 : from
  const depth = wide * 8
  const { channels, frames } = sound
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const little = law ? true : sound.little
  const read: (at: number) => number =
    float
      ? (at) => {
          const value = Math.round((from === 4 ? view.getFloat32(at, little) : view.getFloat64(at, little)) * 8388608)
          return value > 8388607 ? 8388607 : value < -8388608 ? -8388608 : value || 0
        }
      : sound.coding === 'uint' ? (at) => data[at]! - 128
      : from === 1 ? (at) => view.getInt8(at)
      : from === 2 ? (at) => view.getInt16(at, little)
      : from === 3 ? (at) => (little ? data[at]! | (data[at + 1]! << 8) | (view.getInt8(at + 2) << 16) : (view.getInt8(at) << 16) | (data[at + 1]! << 8) | data[at + 2]!)
      : (at) => view.getInt32(at, little)

  const work = Array.from({ length: channels }, () => new Int32Array(BLOCK))
  const middle = new Int32Array(BLOCK)
  const side = new Int32Array(BLOCK)
  const plain = new Uint8Array(BLOCK * channels * wide)
  const md5 = new Md5()
  const parts: Uint8Array[] = []
  let [smallest, largest] = [Infinity, 0]
  // A stretch never takes more room than its numbers written as they are, and a little over.
  let writer = new Writer(1 << 20)
  const room = BLOCK * channels * (wide + 1) + 64
  const depthCode = { 8: 1, 16: 4, 24: 6, 32: 7 }[depth]!

  for (let done = 0, index = 0; done < frames; index++) {
    const count = Math.min(BLOCK, frames - done)
    if (writer.at + room > writer.bytes.length) {
      parts.push(writer.bytes.subarray(0, writer.at))
      writer = new Writer(1 << 20)
    }
    for (let c = 0; c < channels; c++) {
      const values = work[c]!
      let at = (done * channels + c) * from
      let out = c * wide
      for (let i = 0; i < count; i++, at += channels * from, out += channels * wide) {
        const value = read(at)
        values[i] = value
        plain[out] = value & 0xFF
        if (wide > 1) plain[out + 1] = (value >> 8) & 0xFF
        if (wide > 2) plain[out + 2] = (value >> 16) & 0xFF
        if (wide > 3) plain[out + 3] = (value >> 24) & 0xFF
      }
    }
    md5.update(plain.subarray(0, count * channels * wide))

    // Two channels may be written as they are, as one and their difference, or as their
    // middle and their difference, whichever is least. The difference needs one bit more.
    let layout = channels - 1
    let signals = work
    let plans = work.map((values) => plan(values, count, depth))
    if (channels === 2 && depth < 32) {
      const [l, r] = [work[0]!, work[1]!]
      for (let i = 0; i < count; i++) {
        middle[i] = (l[i]! + r[i]!) >> 1
        side[i] = l[i]! - r[i]!
      }
      const [m, s] = [plan(middle, count, depth), plan(side, count, depth + 1)]
      const costs = [plans[0]!.cost + plans[1]!.cost, plans[0]!.cost + s.cost, s.cost + plans[1]!.cost, m.cost + s.cost]
      const least = costs.indexOf(Math.min(...costs))
      if (least === 1) [layout, signals, plans] = [8, [l, side], [plans[0]!, s]]
      else if (least === 2) [layout, signals, plans] = [9, [side, r], [s, plans[1]!]]
      else if (least === 3) [layout, signals, plans] = [10, [middle, side], [m, s]]
    }

    const start = writer.at
    writer.put(0xFFF8, 16)
    writer.put(count === BLOCK ? 12 : count <= 256 ? 6 : 7, 4)
    writer.put(0, 4)
    writer.put(layout, 4)
    writer.put(depthCode, 3)
    writer.put(0, 1)
    counted(writer, index)
    if (count !== BLOCK) writer.put(count - 1, count <= 256 ? 8 : 16)
    writer.put(crc8(writer.bytes, start, writer.at), 8)
    for (let c = 0; c < channels; c++) {
      const wider = (layout === 8 && c === 1) || (layout === 9 && c === 0) || (layout === 10 && c === 1)
      channel(writer, signals[c]!, count, depth + (wider ? 1 : 0), plans[c]!)
    }
    writer.align()
    writer.put(crc16(writer.bytes, start, writer.at), 16)
    const size = writer.at - start
    smallest = Math.min(smallest, size)
    largest = Math.max(largest, size)
    done += count
    if (index % 16 === 0) onProgress(done / frames)
  }
  parts.push(writer.bytes.subarray(0, writer.at))

  // The label: how the sound is stored, how much of it there is, and the checksum of it all.
  const head = new Uint8Array(4 + 4 + 34)
  const label = new DataView(head.buffer)
  head.set([0x66, 0x4C, 0x61, 0x43, 0x80, 0, 0, 34])
  label.setUint16(8, BLOCK)
  label.setUint16(10, BLOCK)
  label.setUint32(12, (smallest << 8) | (largest >>> 16))
  label.setUint16(16, largest & 0xFFFF)
  label.setUint32(18, ((rate << 12) | ((channels - 1) << 9) | ((depth - 1) << 4) | Math.floor(frames / 2 ** 32)) >>> 0)
  label.setUint32(22, frames >>> 0)
  head.set(md5.digest(), 26)
  return [head, ...parts]
}
