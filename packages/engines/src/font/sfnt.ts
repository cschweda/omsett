import { Refusal } from '../util'

// A font file is a set of named tables. TTF and OTF hold them as they are; WOFF holds each one
// compressed. Reading either gives the same thing, and writing either starts from it.
//
// Everything a file says about itself is checked before it is believed: every table must lie
// inside the file, its contents must match the checksum the file gives for it, and nothing is
// inflated without a limit.

export interface Table {
  /** Four characters: 'head', 'glyf', 'CFF '. */
  tag: string
  data: Uint8Array
  /** Where the table sat in the file it was read from, so it can be put back in the same place. */
  position?: number
}

export interface Font {
  /** What kind of outlines: 0x00010000 or 'true' for TrueType, 'OTTO' for PostScript. */
  flavor: number
  tables: Table[]
}

export const TRUETYPE = 0x0001_0000
const APPLE_TRUETYPE = 0x7472_7565 // 'true'
export const POSTSCRIPT = 0x4F54_544F // 'OTTO'
const WOFF = 0x774F_4646 // 'wOFF'
const HEAD_MAGIC = 0x5F0F_3CF5

/** More tables than any font has. A file that claims more is not read. */
const MAX_TABLES = 256
/** The most a font may unpack to. The largest fonts in use, for Chinese, are about 30 MB. */
export const MAX_FONT_BYTES = 64 * 1024 * 1024

export const invalid = (name: string) => new Refusal(`This file is not a valid ${name} font`)
const damaged = () => new Refusal('This font is damaged: part of it does not match its own checksum')

const view = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
const pad4 = (length: number) => (length + 3) & ~3

function tagAt(data: DataView, offset: number): string | null {
  let tag = ''
  for (let i = 0; i < 4; i++) {
    const code = data.getUint8(offset + i)
    if (code < 0x20 || code > 0x7E) return null
    tag += String.fromCodePoint(code)
  }
  return tag
}

/** The sum of a table's bytes, taken four at a time, as the font format defines it. */
export function checksum(bytes: Uint8Array): number {
  const data = view(bytes)
  const whole = bytes.length & ~3
  let sum = 0
  for (let i = 0; i < whole; i += 4) sum = (sum + data.getUint32(i)) >>> 0
  let last = 0
  for (let i = whole; i < bytes.length; i++) last |= bytes[i]! << (24 - 8 * (i - whole))
  return (sum + (last >>> 0)) >>> 0
}

/** The checksum of the `head` table is taken as if the whole-file figure inside it were zero. */
function tableChecksum(table: Table): number {
  if (table.tag !== 'head' || table.data.length < 12) return checksum(table.data)
  const copy = table.data.slice()
  view(copy).setUint32(8, 0)
  return checksum(copy)
}

/** A font is only a font with these inside it. */
function requireShape(font: Font, name: string): Font {
  const tags = new Set(font.tables.map((table) => table.tag))
  const head = font.tables.find((table) => table.tag === 'head')
  if (!head || head.data.length < 54 || view(head.data).getUint32(12) !== HEAD_MAGIC) throw invalid(name)
  for (const needed of ['hhea', 'maxp', 'cmap']) if (!tags.has(needed)) throw invalid(name)
  const outlines =
    font.flavor === POSTSCRIPT
      ? tags.has('CFF ') || tags.has('CFF2')
      : (tags.has('glyf') && tags.has('loca')) || tags.has('CBDT') || tags.has('sbix') || tags.has('EBDT')
  if (!outlines) throw invalid(name)
  return font
}

const knownFlavor = (flavor: number) => flavor === TRUETYPE || flavor === APPLE_TRUETYPE || flavor === POSTSCRIPT

export function readSfnt(bytes: Uint8Array, name: string): Font {
  if (bytes.length < 12) throw invalid(name)
  const data = view(bytes)
  const flavor = data.getUint32(0)
  const count = data.getUint16(4)
  if (!knownFlavor(flavor) || count === 0 || count > MAX_TABLES) throw invalid(name)
  const directoryEnd = 12 + 16 * count
  if (bytes.length < directoryEnd) throw invalid(name)

  const tables: Table[] = []
  const seen = new Set<string>()
  for (let i = 0; i < count; i++) {
    const at = 12 + 16 * i
    const tag = tagAt(data, at)
    const stated = data.getUint32(at + 4)
    const offset = data.getUint32(at + 8)
    const length = data.getUint32(at + 12)
    if (tag === null || seen.has(tag)) throw invalid(name)
    // A table lies after the list of tables and wholly inside the file.
    if (offset < directoryEnd || offset + length > bytes.length) throw invalid(name)
    seen.add(tag)
    const table = { tag, data: bytes.subarray(offset, offset + length), position: offset }
    if (tableChecksum(table) !== stated) throw damaged()
    tables.push(table)
  }
  // No two tables may share bytes. A font whose every table points at the same megabyte is
  // small to read and, written out with each table given its own copy, hundreds of times larger.
  const inOrder = [...tables].sort((a, b) => a.position! - b.position!)
  for (let i = 1; i < inOrder.length; i++) {
    if (inOrder[i]!.position! < inOrder[i - 1]!.position! + inOrder[i - 1]!.data.length) throw invalid(name)
  }
  return requireShape({ flavor, tables }, name)
}

/**
 * Where each table goes. The list of tables is in alphabetical order, as the format requires;
 * the tables themselves stay in the order the font's maker put them, which is often chosen so
 * that the parts needed first load first.
 */
function place(tables: Table[], start: number, size: (table: Table) => number): Map<Table, number> {
  const inFileOrder = tables
    .map((table, index) => ({ table, index }))
    .sort((a, b) => (a.table.position ?? Infinity) - (b.table.position ?? Infinity) || a.index - b.index)
  const placed = new Map<Table, number>()
  let offset = start
  for (const { table } of inFileOrder) {
    placed.set(table, offset)
    offset += pad4(size(table))
  }
  return placed
}

/** The tables, in the order and layout the format asks for, with every checksum worked out. */
export function writeSfnt(font: Font): Uint8Array {
  const tables = [...font.tables].sort((a, b) => (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0))
  const count = tables.length
  const directoryEnd = 12 + 16 * count
  const total = directoryEnd + tables.reduce((sum, table) => sum + pad4(table.data.length), 0)
  const bytes = new Uint8Array(total)
  const data = view(bytes)

  // Three figures that let an old reader search the list of tables quickly.
  const power = 2 ** Math.floor(Math.log2(count))
  data.setUint32(0, font.flavor)
  data.setUint16(4, count)
  data.setUint16(6, power * 16)
  data.setUint16(8, Math.log2(power))
  data.setUint16(10, count * 16 - power * 16)

  const placed = place(tables, directoryEnd, (table) => table.data.length)
  let headAt = -1
  tables.forEach((table, i) => {
    const at = 12 + 16 * i
    const offset = placed.get(table)!
    for (let c = 0; c < 4; c++) data.setUint8(at + c, table.tag.codePointAt(c)!)
    data.setUint32(at + 4, tableChecksum(table))
    data.setUint32(at + 8, offset)
    data.setUint32(at + 12, table.data.length)
    bytes.set(table.data, offset)
    if (table.tag === 'head') headAt = offset
  })
  // The whole file's own checksum, kept inside `head`: worked out with its place held at zero.
  if (headAt >= 0) {
    data.setUint32(headAt + 8, 0)
    data.setUint32(headAt + 8, (0xB1B0_AFBA - checksum(bytes)) >>> 0)
  }
  return bytes
}

/** Inflate to exactly `length` bytes. More, fewer, or a damaged stream: null. */
async function inflate(packed: Uint8Array, length: number): Promise<Uint8Array | null> {
  const out = new Uint8Array(length)
  let filled = 0
  try {
    const stream = new Blob([packed as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate'))
    const reader = stream.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (filled + value.length > length) {
        // It unpacks to more than it said it would. Stop reading; nothing more is wanted.
        await reader.cancel().catch(() => {})
        return null
      }
      out.set(value, filled)
      filled += value.length
    }
  } catch {
    return null
  }
  return filled === length ? out : null
}

async function deflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream('deflate'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

export async function readWoff(bytes: Uint8Array): Promise<Font> {
  const name = 'WOFF'
  if (bytes.length < 44) throw invalid(name)
  const data = view(bytes)
  const flavor = data.getUint32(4)
  const count = data.getUint16(12)
  if (data.getUint32(0) !== WOFF || !knownFlavor(flavor)) throw invalid(name)
  // The file says how long it is. One that is shorter was cut off; one that is longer has
  // something added after the font.
  if (data.getUint32(8) !== bytes.length) throw invalid(name)
  if (count === 0 || count > MAX_TABLES) throw invalid(name)
  const directoryEnd = 44 + 20 * count
  if (bytes.length < directoryEnd) throw invalid(name)

  // Every size is read and added up before anything is unpacked.
  const entries: Array<{ tag: string; offset: number; packed: number; length: number; stated: number }> = []
  const seen = new Set<string>()
  let total = 0
  for (let i = 0; i < count; i++) {
    const at = 44 + 20 * i
    const tag = tagAt(data, at)
    const entry = {
      tag: tag ?? '',
      offset: data.getUint32(at + 4),
      packed: data.getUint32(at + 8),
      length: data.getUint32(at + 12),
      stated: data.getUint32(at + 16),
    }
    if (tag === null || seen.has(tag)) throw invalid(name)
    if (entry.offset < directoryEnd || entry.offset + entry.packed > bytes.length) throw invalid(name)
    // Compression that makes a table larger is not used; a file that says it was is wrong.
    if (entry.packed > entry.length) throw invalid(name)
    seen.add(tag)
    total += entry.length
    if (total > MAX_FONT_BYTES) throw new Refusal('This font is too large to convert')
    entries.push(entry)
  }

  const tables: Table[] = []
  for (const entry of entries) {
    const stored = bytes.subarray(entry.offset, entry.offset + entry.packed)
    const unpacked = entry.packed === entry.length ? stored : await inflate(stored, entry.length)
    if (!unpacked) throw invalid(name)
    const table = { tag: entry.tag, data: unpacked, position: entry.offset }
    if (tableChecksum(table) !== entry.stated) throw damaged()
    tables.push(table)
  }
  return requireShape({ flavor, tables }, name)
}

export async function writeWoff(font: Font): Promise<Uint8Array> {
  const tables = [...font.tables].sort((a, b) => (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0))
  const stored = await Promise.all(
    tables.map(async (table) => {
      const packed = await deflate(table.data)
      // Kept compressed only where that is smaller.
      return packed.length < table.data.length ? packed : table.data
    }),
  )
  const count = tables.length
  const directoryEnd = 44 + 20 * count
  const total = directoryEnd + stored.reduce((sum, part) => sum + pad4(part.length), 0)
  const bytes = new Uint8Array(total)
  const data = view(bytes)
  const head = tables.find((table) => table.tag === 'head')

  data.setUint32(0, WOFF)
  data.setUint32(4, font.flavor)
  data.setUint32(8, total)
  data.setUint16(12, count)
  // The size the font has unpacked, as a plain TTF or OTF.
  data.setUint32(16, 12 + 16 * count + tables.reduce((sum, table) => sum + pad4(table.data.length), 0))
  // The font's own version number, which `head` holds as two halves.
  if (head && head.data.length >= 8) {
    data.setUint16(20, view(head.data).getUint16(4))
    data.setUint16(22, view(head.data).getUint16(6))
  }

  const sizes = new Map(tables.map((table, i) => [table, stored[i]!.length]))
  const placed = place(tables, directoryEnd, (table) => sizes.get(table)!)
  tables.forEach((table, i) => {
    const at = 44 + 20 * i
    const offset = placed.get(table)!
    for (let c = 0; c < 4; c++) data.setUint8(at + c, table.tag.codePointAt(c)!)
    data.setUint32(at + 4, offset)
    data.setUint32(at + 8, stored[i]!.length)
    data.setUint32(at + 12, table.data.length)
    data.setUint32(at + 16, tableChecksum(table))
    bytes.set(stored[i]!, offset)
  })
  return bytes
}
