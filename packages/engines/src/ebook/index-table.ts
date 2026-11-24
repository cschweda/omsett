import { notBook } from './mobi'

// A Kindle book's indexes: its list of chapters, of the pieces each chapter is made of, and of
// its contents. Each is a few records. The first says how an entry is laid out; the rest hold
// the entries; any after that hold text the entries refer to.

export interface IndexEntry {
  /** What the entry is called. In some indexes it is a name, in others a number written as text. */
  name: string
  /** Its numbered values. */
  tags: Map<number, number[]>
}
export interface Index {
  entries: IndexEntry[]
  /** Text the entries point into, by where each piece starts. */
  texts: Map<number, string>
}

const MAX_ENTRIES = 200_000
const ascii = (bytes: Uint8Array, at: number, length: number) => String.fromCharCode(...bytes.subarray(at, at + length))

/** A number written forwards, seven bits to a byte, the last byte marked. */
function forward(data: Uint8Array, at: number): [value: number, used: number] {
  let value = 0
  for (let used = 0; used < 5 && at + used < data.length; used++) {
    const byte = data[at + used]!
    value = value * 128 + (byte & 0x7F)
    if (byte & 0x80) return [value, used + 1]
  }
  throw notBook()
}

export function readIndex(records: Uint8Array[], at: number, encoding: string): Index {
  const head = records[at]
  if (!head || head.length < 56 || ascii(head, 0, 4) !== 'INDX') throw notBook()
  const view = new DataView(head.buffer, head.byteOffset, head.byteLength)
  const many = view.getUint32(24)
  const textRecords = view.getUint32(52)
  if (at + many + textRecords >= records.length + 1 || many > 4096 || textRecords > 4096) throw notBook()

  // How an entry is laid out: for each numbered value, how many numbers it is, and which bits of a control byte say whether it is there.
  const layout = view.getUint32(4)
  if (layout + 12 > head.length || ascii(head, layout, 4) !== 'TAGX') throw notBook()
  const layoutEnd = layout + view.getUint32(layout + 4)
  const controls = view.getUint32(layout + 8)
  if (layoutEnd > head.length || controls > 16) throw notBook()
  const table: Array<{ tag: number; each: number; mask: number; end: boolean }> = []
  for (let entry = layout + 12; entry + 4 <= layoutEnd; entry += 4) table.push({ tag: head[entry]!, each: head[entry + 1]!, mask: head[entry + 2]!, end: head[entry + 3] === 1 })

  const entries: IndexEntry[] = []
  for (let r = at + 1; r <= at + many; r++) {
    const data = records[r]!
    if (data.length < 28 || ascii(data, 0, 4) !== 'INDX') throw notBook()
    const dv = new DataView(data.buffer, data.byteOffset, data.byteLength)
    const list = dv.getUint32(20)
    const count = dv.getUint32(24)
    if (list + 4 + count * 2 > data.length || ascii(data, list, 4) !== 'IDXT') throw notBook()
    for (let i = 0; i < count; i++) {
      const start = dv.getUint16(list + 4 + i * 2)
      const end = i + 1 < count ? dv.getUint16(list + 4 + (i + 1) * 2) : list
      if (start >= end || end > data.length) throw notBook()
      const length = data[start]!
      if (start + 1 + length + controls > end) throw notBook()
      const name = ascii(data, start + 1, length)
      let cursor = start + 1 + length + controls
      const tags = new Map<number, number[]>()
      // First pass: from the control bytes, which values this entry has and how many of each.
      const present: Array<{ tag: number; each: number; count?: number; bytes?: number }> = []
      let control = 0
      for (const { tag, each, mask, end: endOfByte } of table) {
        if (endOfByte) {
          control++
          continue
        }
        const byte = data[start + 1 + length + control]!
        let value = byte & mask
        if (value === 0) continue
        if (value === mask && (mask & (mask - 1)) !== 0) {
          // Every bit set, in a mask of more than one bit: the count is written out instead.
          const [bytes, used] = forward(data, cursor)
          cursor += used
          present.push({ tag, each, bytes })
        } else {
          let shifted = mask
          while ((shifted & 1) === 0) {
            shifted >>= 1
            value >>= 1
          }
          present.push({ tag, each, count: value })
        }
      }
      for (const found of present) {
        const values: number[] = []
        if (found.count !== undefined) {
          for (let n = 0; n < found.count * found.each; n++) {
            const [value, used] = forward(data, cursor)
            cursor += used
            values.push(value)
          }
        } else {
          const stop = cursor + found.bytes!
          while (cursor < stop) {
            const [value, used] = forward(data, cursor)
            cursor += used
            values.push(value)
          }
        }
        if (cursor > end) throw notBook()
        tags.set(found.tag, values)
      }
      entries.push({ name, tags })
      if (entries.length > MAX_ENTRIES) throw notBook()
    }
  }

  // Text the entries point into: each piece a length and then that many bytes.
  const texts = new Map<number, string>()
  const decoder = new TextDecoder(encoding)
  for (let r = 0; r < textRecords; r++) {
    const data = records[at + many + 1 + r]
    if (!data) break
    for (let pos = 0; pos < data.length && data[pos] !== 0; ) {
      const [length, used] = forward(data, pos)
      if (pos + used + length > data.length) break
      texts.set(r * 0x10000 + pos, decoder.decode(data.subarray(pos + used, pos + used + length)))
      pos += used + length
    }
  }
  return { entries, texts }
}
