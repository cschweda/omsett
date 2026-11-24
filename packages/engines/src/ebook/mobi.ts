import { Refusal } from '../util'

// Kindle books: MOBI, and AZW3, which is the same file with a newer book inside. The file is a
// list of numbered records. The first says how the book is stored; the next few hundred are its
// text, packed four thousand characters to a record; after them come its pictures.
//
// Everything is read by the numbers the file gives, and every one of them is checked against
// the file before it is used. A book that is locked (copy protection, DRM) is refused: its text
// is scrambled, and Omsett does not unlock books.

export const notBook = () => new Refusal('This file is not a valid Kindle book')
export const locked = () => new Refusal('This book is copy-protected (DRM), and Omsett does not unlock books. Only books without copy protection can be converted')
/** The most text a book is unpacked to. A novel is about a megabyte; the longest books, a few tens. */
export const MAX_TEXT_BYTES = 96 * 1024 * 1024
const MAX_RECORDS = 65_535

export interface Book {
  /** Every record of the file. */
  records: Uint8Array[]
  /** 6 or 7 for the older form of book, 8 for the newer (AZW3). */
  version: number
  /** The text, unpacked: HTML, in the encoding the book names. In the newer form, the stylesheets follow the pages. */
  text: Uint8Array
  /** How much of the text is the pages. */
  pages: number
  encoding: 'utf-8' | 'windows-1252'
  title: string
  /** What the book says about itself, by Kindle's own numbers for each kind of fact. */
  facts: Map<number, Uint8Array[]>
  /** The number of the first record that is a picture or another resource, and of the record the book's own numbers count from. */
  firstResource: number
  base: number
  /** The first record's own bytes, for the places only the newer form of book uses. */
  head: Uint8Array
}

/** A number written backwards from the end of a record: seven bits to a byte, the first byte marked. */
function sizeFromEnd(record: Uint8Array, end: number): number {
  let value = 0
  let shift = 0
  for (let at = end - 1; at >= 0 && at >= end - 4; at--) {
    const byte = record[at]!
    value |= (byte & 0x7F) << shift
    shift += 7
    if (byte & 0x80) break
  }
  return value
}

/** A record of text without the oddments some books put after it. Which oddments is said by a set of flags. */
function withoutTrailers(record: Uint8Array, flags: number): Uint8Array {
  let end = record.length
  for (let bit = 15; bit >= 1; bit--) {
    if (!(flags & (1 << bit))) continue
    const size = sizeFromEnd(record, end)
    if (size < 1 || size > end) return record.subarray(0, 0)
    end -= size
  }
  // The lowest flag: a few bytes of a character that straddles two records, counted in the last byte's low bits.
  if (flags & 1 && end > 0) {
    const size = (record[end - 1]! & 3) + 1
    end = size > end ? 0 : end - size
  }
  return record.subarray(0, end)
}

/** PalmDOC packing: a byte is itself, or a count of plain bytes, or "go back so far and copy so many". */
function unpackPalm(record: Uint8Array, out: Uint8Array, at: number): number {
  const start = at
  for (let i = 0; i < record.length; ) {
    const byte = record[i++]!
    if (byte === 0 || (byte >= 9 && byte <= 0x7F)) {
      if (at >= out.length) throw notBook()
      out[at++] = byte
    } else if (byte <= 8) {
      if (i + byte > record.length || at + byte > out.length) throw notBook()
      out.set(record.subarray(i, i + byte), at)
      at += byte
      i += byte
    } else if (byte >= 0xC0) {
      if (at + 2 > out.length) throw notBook()
      out[at++] = 0x20
      out[at++] = byte ^ 0x80
    } else {
      if (i >= record.length) throw notBook()
      const pair = (byte << 8) | record[i++]!
      const back = (pair >> 3) & 0x7FF
      const count = (pair & 7) + 3
      // It may copy only from what this record has already written.
      if (back < 1 || back > at - start || at + count > out.length) throw notBook()
      for (let n = 0; n < count; n++, at++) out[at] = out[at - back]!
    }
  }
  return at
}

/**
 * The other packing, which Kindle books use: a dictionary of phrases, and a code for each that
 * is shorter the commoner the phrase is. A phrase may itself be made of codes.
 */
class Phrases {
  private readonly lengths = new Uint8Array(256)
  private readonly ends = new Uint8Array(256)
  private readonly tops = new Float64Array(256)
  private readonly least = new Float64Array(33)
  private readonly most = new Float64Array(33)
  private readonly phrases: Array<{ bytes: Uint8Array; plain: boolean } | null> = []
  private budget: number

  constructor(huff: Uint8Array, dictionaries: Uint8Array[], budget: number) {
    this.budget = budget
    const view = new DataView(huff.buffer, huff.byteOffset, huff.byteLength)
    if (huff.length < 24 || String.fromCharCode(...huff.subarray(0, 4)) !== 'HUFF') throw notBook()
    const [first, second] = [view.getUint32(8), view.getUint32(12)]
    if (first + 1024 > huff.length || second + 256 > huff.length) throw notBook()
    for (let i = 0; i < 256; i++) {
      const entry = view.getUint32(first + i * 4)
      const length = entry & 0x1F
      if (length === 0) throw notBook()
      this.lengths[i] = length
      this.ends[i] = entry & 0x80 ? 1 : 0
      this.tops[i] = ((entry >>> 8) + 1) * 2 ** (32 - length) - 1
    }
    for (let length = 1; length <= 32; length++) {
      this.least[length] = view.getUint32(second + (length - 1) * 8) * 2 ** (32 - length)
      this.most[length] = (view.getUint32(second + (length - 1) * 8 + 4) + 1) * 2 ** (32 - length) - 1
    }
    for (const part of dictionaries) {
      const dv = new DataView(part.buffer, part.byteOffset, part.byteLength)
      if (part.length < 16 || String.fromCharCode(...part.subarray(0, 4)) !== 'CDIC') throw notBook()
      const total = dv.getUint32(8)
      const bits = dv.getUint32(12)
      if (bits > 16) throw notBook()
      const count = Math.min(1 << bits, total - this.phrases.length)
      if (count < 0 || 16 + count * 2 > part.length) throw notBook()
      for (let i = 0; i < count; i++) {
        const at = 16 + dv.getUint16(16 + i * 2)
        if (at + 2 > part.length) throw notBook()
        const size = dv.getUint16(at)
        if (at + 2 + (size & 0x7FFF) > part.length) throw notBook()
        this.phrases.push({ bytes: part.subarray(at + 2, at + 2 + (size & 0x7FFF)), plain: (size & 0x8000) !== 0 })
      }
    }
  }

  /** Unpack some packed bytes. A phrase that is made of codes is unpacked once, and kept. */
  unpack(packed: Uint8Array, depth = 0): Uint8Array {
    if (depth > 32) throw notBook()
    const parts: Uint8Array[] = []
    let size = 0
    let left = packed.length * 8
    // Eight bytes of nothing after the end, so that the window can always be filled.
    const data = new Uint8Array(packed.length + 8)
    data.set(packed)
    const view = new DataView(data.buffer)
    let at = 0
    let high = view.getUint32(0)
    let low = view.getUint32(4)
    let n = 32
    for (;;) {
      if (n <= 0) {
        at += 4
        high = view.getUint32(at)
        low = view.getUint32(at + 4)
        n += 32
      }
      // Thirty-two bits of a sixty-four bit window, starting n bits from its low end.
      const code = n === 32 ? high : ((high * 2 ** (32 - n)) % 2 ** 32) + Math.floor(low / 2 ** n)
      const lead = Math.floor(code / 2 ** 24)
      let length = this.lengths[lead]!
      let top = this.tops[lead]!
      if (!this.ends[lead]) {
        while (length < 32 && code < this.least[length]!) length++
        top = this.most[length]!
      }
      n -= length
      left -= length
      if (left < 0) break
      const index = Math.floor((top - code) / 2 ** (32 - length))
      const phrase = this.phrases[index]
      // A phrase that is being unpacked and names itself is a circle.
      if (!phrase) throw notBook()
      if (!phrase.plain) {
        this.phrases[index] = null
        phrase.bytes = this.unpack(phrase.bytes, depth + 1)
        phrase.plain = true
        this.phrases[index] = phrase
      }
      size += phrase.bytes.length
      if (depth === 0) {
        this.budget -= phrase.bytes.length
        if (this.budget < 0) throw new Refusal('This book unpacks to more text than Omsett will handle')
      } else if (size > 1 << 20) throw notBook()
      parts.push(phrase.bytes)
    }
    const out = new Uint8Array(size)
    let to = 0
    for (const part of parts) {
      out.set(part, to)
      to += part.length
    }
    return out
  }
}

/** Open a Kindle book: its records, what it says of itself, and its text unpacked. */
export function readMobi(bytes: Uint8Array): Book {
  if (bytes.length < 86 || String.fromCharCode(...bytes.subarray(60, 68)) !== 'BOOKMOBI') throw notBook()
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const count = view.getUint16(76)
  if (count < 2 || count > MAX_RECORDS || 78 + count * 8 > bytes.length) throw notBook()
  const records: Uint8Array[] = []
  for (let i = 0; i < count; i++) {
    const from = view.getUint32(78 + i * 8)
    const to = i + 1 < count ? view.getUint32(78 + (i + 1) * 8) : bytes.length
    // Each record starts where the list says and runs to the next: in order, and inside the file.
    if (from > to || to > bytes.length || from < 78 + count * 8) throw notBook()
    records.push(bytes.subarray(from, to))
  }
  return open(records, 0)
}

function open(records: Uint8Array[], base: number): Book {
  const head = records[base]!
  if (head.length < 16 + 116 || String.fromCharCode(...head.subarray(16, 20)) !== 'MOBI') throw notBook()
  const view = new DataView(head.buffer, head.byteOffset, head.byteLength)
  const packing = view.getUint16(0)
  const length = view.getUint32(4)
  const textRecords = view.getUint16(8)
  if (view.getUint16(12) !== 0) throw locked()
  const headerLength = view.getUint32(20)
  const version = view.getUint32(36)
  const encoding = view.getUint32(28) === 65001 ? 'utf-8' : 'windows-1252'
  if (length > MAX_TEXT_BYTES) throw new Refusal('This book unpacks to more text than Omsett will handle')
  if (base + textRecords >= records.length || textRecords < 1) throw notBook()

  // What the book says of itself: a list of numbered facts, after the header.
  const facts = new Map<number, Uint8Array[]>()
  const list = 16 + headerLength
  if (view.getUint32(128) & 0x40 && list + 12 <= head.length && String.fromCharCode(...head.subarray(list, list + 4)) === 'EXTH') {
    const many = Math.min(view.getUint32(list + 8), 4096)
    for (let at = list + 12, i = 0; i < many && at + 8 <= head.length; i++) {
      const kind = view.getUint32(at)
      const size = view.getUint32(at + 4)
      if (size < 8 || at + size > head.length) break
      facts.set(kind, [...(facts.get(kind) ?? []), head.subarray(at + 8, at + size)])
      at += size
    }
  }
  // A book made for old Kindles and new ones holds two books. The newer one starts at a record
  // the older one names, and is the one to read.
  const newer = facts.get(121)?.[0]
  if (version < 8 && base === 0 && newer && newer.length === 4) {
    const at = new DataView(newer.buffer, newer.byteOffset, 4).getUint32(0)
    if (at !== 0xFFFFFFFF && at > 0 && at < records.length && records[at]!.length >= 132 && String.fromCharCode(...records[at]!.subarray(16, 20)) === 'MOBI') return open(records, at)
  }

  const flags = headerLength >= 0xE4 && head.length >= 244 ? view.getUint16(242) : 0
  // Each record of text unpacks to four thousand characters, give or take. The length the book
  // states is for its pages alone; the newer form keeps its stylesheets after them, so all of
  // what the records hold is taken, up to twice what that many records should come to.
  const most = Math.min(MAX_TEXT_BYTES, textRecords * 8192 + 65_536)
  const pieces: Uint8Array[] = []
  let total = 0
  const keep = (piece: Uint8Array) => {
    total += piece.length
    if (total > most) throw new Refusal('This book unpacks to more text than Omsett will handle')
    pieces.push(piece)
  }
  if (packing === 17480) {
    const first = view.getUint32(112) + base
    const many = view.getUint32(116)
    if (many < 2 || many > 64 || first < 1 || first + many > records.length) throw notBook()
    const phrases = new Phrases(records[first]!, records.slice(first + 1, first + many), most)
    for (let i = 1; i <= textRecords; i++) keep(phrases.unpack(withoutTrailers(records[base + i]!, flags)))
  } else if (packing === 2) {
    for (let i = 1; i <= textRecords; i++) {
      const piece = withoutTrailers(records[base + i]!, flags)
      // Room for the most a record of this packing can unpack to: each pair of bytes at most ten.
      const room = new Uint8Array(Math.min(65_536, 16 + piece.length * 8))
      keep(room.slice(0, unpackPalm(piece, room, 0)))
    }
  } else if (packing === 1) {
    for (let i = 1; i <= textRecords; i++) keep(withoutTrailers(records[base + i]!, flags))
  } else throw notBook()
  const out = new Uint8Array(total)
  let at = 0
  for (const piece of pieces) {
    out.set(piece, at)
    at += piece.length
  }
  if (at < length) throw notBook()

  const decode = (raw: Uint8Array) => new TextDecoder(encoding).decode(raw).replaceAll('\0', '').trim().slice(0, 500)
  const named = facts.get(503)?.[0]
  const nameAt = view.getUint32(84)
  const nameLength = Math.min(view.getUint32(88), 1024)
  const title = named ? decode(named) : nameAt + nameLength <= head.length ? decode(head.subarray(nameAt, nameAt + nameLength)) : ''
  const firstResource = view.getUint32(108)
  return { records, version, text: out, pages: length, encoding, title, facts, firstResource: firstResource === 0xFFFFFFFF ? records.length : firstResource + base, base, head }
}
