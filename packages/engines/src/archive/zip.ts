import { crc32 } from '@omsett/detect'
import { Refusal } from '../util'
import { Contents, invalid, MAX_ENTRIES, pack, tooMany, unpack, type Entry } from './entries'

// ZIP. The list of what a ZIP holds is at its end (the "central directory"), and each file is
// stored earlier with a short header of its own. The two can disagree, and files can be made to
// overlap, and both have been used to attack whatever unpacks them. Here the list is read once,
// every file's place is checked against every other's, and a file's own header must name the
// file the list named.

const NAME = 'ZIP'
const END = 0x0605_4B50
const LISTED = 0x0201_4B50
const LOCAL = 0x0403_4B50
const BIG_LOCATOR = 0x0706_4B50

const view = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
const tooBig = () => new Refusal('This archive is in the ZIP64 form, for very large archives, which Omsett does not read yet')

/** A name, as UTF-8 where the archive says so or where it reads as UTF-8, else byte for byte. */
function decodeName(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('latin1').decode(bytes)
  }
}

/** The date and time a ZIP holds, which is to two seconds and in no stated time zone. */
function dosTime(date: number, time: number): Date | null {
  const [year, month, day] = [(date >>> 9) + 1980, (date >>> 5) & 15, date & 31]
  if (month < 1 || month > 12 || day < 1) return null
  const moment = new Date(Date.UTC(year, month - 1, day, time >>> 11, (time >>> 5) & 63, (time & 31) * 2))
  return Number.isNaN(moment.getTime()) ? null : moment
}

export async function readZip(bytes: Uint8Array): Promise<Entry[]> {
  const data = view(bytes)
  // The end record is the last thing in the file, followed only by a comment whose length it
  // gives. Looked for from the end, and only where it would account for every byte after it.
  let end = -1
  for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 22 - 0xFFFF); at--) {
    if (data.getUint32(at, true) === END && at + 22 + data.getUint16(at + 20, true) === bytes.length) {
      end = at
      break
    }
  }
  if (end < 0) throw invalid(NAME)
  const count = data.getUint16(end + 10, true)
  const listSize = data.getUint32(end + 12, true)
  const listAt = data.getUint32(end + 16, true)
  if (count === 0xFFFF || listAt === 0xFFFF_FFFF || (end >= 20 && data.getUint32(end - 20, true) === BIG_LOCATOR)) throw tooBig()
  // One file, not a piece of a set; and the list ends exactly where the end record begins.
  if (data.getUint16(end + 4, true) !== 0 || data.getUint16(end + 8, true) !== count) throw invalid(NAME)
  if (listAt + listSize !== end) throw invalid(NAME)
  if (count > MAX_ENTRIES) throw tooMany()

  interface Listed {
    name: Uint8Array
    method: number
    crc: number
    packed: number
    size: number
    at: number
    modified: Date | null
    mode: number
  }
  const listed: Listed[] = []
  let at = listAt
  for (let i = 0; i < count; i++) {
    if (at + 46 > end || data.getUint32(at, true) !== LISTED) throw invalid(NAME)
    const flags = data.getUint16(at + 8, true)
    const nameLength = data.getUint16(at + 28, true)
    const next = at + 46 + nameLength + data.getUint16(at + 30, true) + data.getUint16(at + 32, true)
    if (next > end) throw invalid(NAME)
    if (flags & 1) throw new Refusal('This archive is protected by a password, which Omsett cannot open')
    const packed = data.getUint32(at + 20, true)
    const size = data.getUint32(at + 24, true)
    if (packed === 0xFFFF_FFFF || size === 0xFFFF_FFFF) throw tooBig()
    // The top half of this field holds the file's kind and permissions, when Unix made the archive.
    const unix = data.getUint8(at + 5) === 3
    listed.push({
      name: bytes.subarray(at + 46, at + 46 + nameLength),
      method: data.getUint16(at + 10, true),
      crc: data.getUint32(at + 16, true),
      packed,
      size,
      at: data.getUint32(at + 42, true),
      modified: dosTime(data.getUint16(at + 14, true), data.getUint16(at + 12, true)),
      mode: unix ? data.getUint32(at + 38, true) >>> 16 : 0,
    })
    at = next
  }
  if (at !== end) throw invalid(NAME)

  // Where each file's bytes are. Each must lie before the list, name the file the list named,
  // and share no byte with another: files made to overlap are how 42 kilobytes become
  // petabytes.
  const placed = listed.map((entry) => {
    if (entry.at + 30 > listAt || data.getUint32(entry.at, true) !== LOCAL) throw invalid(NAME)
    const nameLength = data.getUint16(entry.at + 26, true)
    const start = entry.at + 30 + nameLength + data.getUint16(entry.at + 28, true)
    if (start + entry.packed > listAt) throw invalid(NAME)
    const own = bytes.subarray(entry.at + 30, entry.at + 30 + nameLength)
    if (own.length !== entry.name.length || own.some((byte, i) => byte !== entry.name[i])) throw invalid(NAME)
    return { ...entry, start, stop: start + entry.packed }
  })
  const inOrder = [...placed].sort((a, b) => a.at - b.at)
  for (let i = 1; i < inOrder.length; i++) if (inOrder[i]!.at < inOrder[i - 1]!.stop) throw invalid(NAME)

  const contents = new Contents(NAME)
  // Every size is added up before anything is unpacked.
  for (const entry of placed) contents.reserve(entry.size)
  for (const entry of placed) {
    const name = decodeName(entry.name)
    const kind = entry.mode & 0o170000
    // A link is a name that points somewhere else, possibly outside the archive. Left out.
    if (kind === 0o120000) continue
    const directory = name.endsWith('/') || kind === 0o040000
    if (directory) {
      contents.add(name, new Uint8Array(0), true, entry.modified, false)
      continue
    }
    const stored = bytes.subarray(entry.start, entry.stop)
    let unpacked: Uint8Array | null
    if (entry.method === 0) unpacked = entry.packed === entry.size ? stored : null
    else if (entry.method === 8) unpacked = await unpack(stored, entry.size, 'deflate-raw')
    else throw new Refusal('This archive is packed in a way Omsett does not read')
    if (!unpacked) throw invalid(NAME)
    if (crc32(unpacked, 0, unpacked.length) !== entry.crc) {
      throw new Refusal('This archive is damaged: a file in it does not match its own checksum')
    }
    contents.add(name, unpacked, false, entry.modified, (entry.mode & 0o111) !== 0)
  }
  return contents.done()
}

/**
 * @param entries the files and folders, in the order they are written
 * @param options how to write them
 * @param options.stored names of entries kept as they are, never packed. An OpenDocument
 *                file's first entry, its type, must be readable without unpacking anything.
 */
export async function writeZip(entries: Entry[], options: { stored?: string[] } = {}): Promise<Uint8Array> {
  const encoder = new TextEncoder()
  const files: Uint8Array[] = []
  const list: Uint8Array[] = []
  let offset = 0
  for (const entry of entries) {
    const name = encoder.encode(entry.directory ? `${entry.name}/` : entry.name)
    const asItIs = entry.directory || options.stored?.includes(entry.name) === true
    const packed = asItIs ? entry.data : await pack(entry.data, 'deflate-raw')
    // Kept packed only where that is smaller.
    const deflated = !asItIs && packed.length < entry.data.length
    const stored = deflated ? packed : entry.data
    const when = entry.modified && entry.modified.getUTCFullYear() >= 1980 ? entry.modified : new Date(Date.UTC(1980, 0, 1))
    const time = (when.getUTCHours() << 11) | (when.getUTCMinutes() << 5) | (when.getUTCSeconds() >> 1)
    const date = ((when.getUTCFullYear() - 1980) << 9) | ((when.getUTCMonth() + 1) << 5) | when.getUTCDate()
    const crc = crc32(entry.data, 0, entry.data.length)
    const mode = entry.directory ? 0o040755 : entry.executable ? 0o100755 : 0o100644

    const local = new Uint8Array(30 + name.length)
    const l = view(local)
    l.setUint32(0, LOCAL, true)
    l.setUint16(4, 20, true)
    l.setUint16(6, 0x0800, true) // the name is UTF-8
    l.setUint16(8, deflated ? 8 : 0, true)
    l.setUint16(10, time, true)
    l.setUint16(12, date, true)
    l.setUint32(14, crc, true)
    l.setUint32(18, stored.length, true)
    l.setUint32(22, entry.data.length, true)
    l.setUint16(26, name.length, true)
    local.set(name, 30)

    const item = new Uint8Array(46 + name.length)
    const c = view(item)
    c.setUint32(0, LISTED, true)
    c.setUint16(4, 0x0314, true) // made on Unix, to version 2.0 of the format
    c.setUint16(6, 20, true)
    c.setUint16(8, 0x0800, true)
    c.setUint16(10, deflated ? 8 : 0, true)
    c.setUint16(12, time, true)
    c.setUint16(14, date, true)
    c.setUint32(16, crc, true)
    c.setUint32(20, stored.length, true)
    c.setUint32(24, entry.data.length, true)
    c.setUint16(28, name.length, true)
    c.setUint32(38, ((mode << 16) | (entry.directory ? 0x10 : 0)) >>> 0, true)
    c.setUint32(42, offset, true)
    item.set(name, 46)

    files.push(local, stored)
    list.push(item)
    offset += local.length + stored.length
  }
  const listSize = list.reduce((sum, item) => sum + item.length, 0)
  const end = new Uint8Array(22)
  const e = view(end)
  e.setUint32(0, END, true)
  e.setUint16(8, entries.length, true)
  e.setUint16(10, entries.length, true)
  e.setUint32(12, listSize, true)
  e.setUint32(16, offset, true)

  const out = new Uint8Array(offset + listSize + 22)
  let at = 0
  for (const part of [...files, ...list, end]) {
    out.set(part, at)
    at += part.length
  }
  return out
}
