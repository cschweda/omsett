import { isTarHeader } from '@omsett/detect'
import { Refusal } from '../util'
import { Contents, invalid, tooLarge, type Entry } from './entries'

// TAR: one file after another, each behind a header of 512 bytes, with nothing at the end that
// lists them. A header says how long its file is, and that figure is checked against what is
// left of the archive before a byte is read.

const BLOCK = 512

const text = (bytes: Uint8Array, at: number, length: number) => {
  let end = at
  while (end < at + length && bytes[end] !== 0) end++
  return new TextDecoder('utf-8').decode(bytes.subarray(at, end))
}

/** A number written in octal digits, as TAR writes them. Null if it is anything else. */
function octal(bytes: Uint8Array, at: number, length: number): number | null {
  const written = text(bytes, at, length).trim()
  if (written === '') return 0
  return /^[0-7]+$/.test(written) ? Number.parseInt(written, 8) : null
}

/** "30 path=some/long/name\n": the records of an extended header. Only the name is wanted. */
function extendedPath(data: Uint8Array): string | null {
  const records = new TextDecoder('utf-8').decode(data)
  let at = 0
  let path: string | null = null
  while (at < records.length) {
    const space = records.indexOf(' ', at)
    const length = Number(records.slice(at, space))
    if (space < 0 || !Number.isInteger(length) || length <= 0) return path
    const record = records.slice(space + 1, at + length - 1)
    if (record.startsWith('path=')) path = record.slice(5)
    at += length
  }
  return path
}

export function readTar(bytes: Uint8Array, name: string): Entry[] {
  const contents = new Contents(name)
  let at = 0
  let headers = 0
  /** A name given ahead of the entry it belongs to, by one of the two ways long names are written. */
  let named: string | null = null
  for (;;) {
    // The end is two empty blocks, or simply the end of the file at the end of a block.
    if (at === bytes.length && headers > 0) break
    if (at + BLOCK > bytes.length) throw invalid(name)
    const header = bytes.subarray(at, at + BLOCK)
    if (header.every((byte) => byte === 0)) break
    if (!isTarHeader(header)) throw invalid(name)
    headers++
    // A hundred thousand headers of nothing are not an archive anyone made.
    if (headers > 100_000) throw invalid(name)

    // Sizes of eight gigabytes and more are written another way, marked by this bit.
    if (header[124]! & 0x80) throw tooLarge()
    const size = octal(header, 124, 12)
    const mode = octal(header, 100, 8)
    const seconds = octal(header, 136, 12)
    if (size === null) throw invalid(name)
    const start = at + BLOCK
    // The file must be there in full: an archive cut short is not unpacked as far as it goes.
    if (start + size > bytes.length) throw invalid(name)
    const data = bytes.subarray(start, start + size)
    at = start + Math.ceil(size / BLOCK) * BLOCK

    const type = String.fromCodePoint(header[156]!)
    if (type === 'x') {
      if (size > 1024 * 1024) throw invalid(name)
      named = extendedPath(data) ?? named
      continue
    }
    if (type === 'L') {
      if (size > 1024 * 1024) throw invalid(name)
      named = text(data, 0, data.length)
      continue
    }
    // Settings for the whole archive, and a long name for a link: neither is kept.
    if (type === 'g' || type === 'K') continue

    const prefix = text(header, 257, 5) === 'ustar' ? text(header, 345, 155) : ''
    const own = named ?? (prefix ? `${prefix}/${text(header, 0, 100)}` : text(header, 0, 100))
    named = null
    const modified = seconds === null || seconds > 253_402_300_799 ? null : new Date(seconds * 1000)
    if (type === 'S') throw new Refusal('This archive holds a file stored in a way Omsett does not read')
    if (type === '5') contents.add(own, new Uint8Array(0), true, modified, false)
    else if (type === '0' || type === '\0' || type === '7') {
      contents.reserve(size)
      // A plain file named like a folder is a folder, in the oldest archives.
      if (own.endsWith('/') && size === 0) contents.add(own, new Uint8Array(0), true, modified, false)
      else contents.add(own, data, false, modified, ((mode ?? 0) & 0o111) !== 0)
    }
    // Everything else is a link, a device or a pipe: a name that stands for something outside
    // the archive. Left out.
  }
  return contents.done()
}

export function writeTar(entries: Entry[]): Uint8Array {
  const encoder = new TextEncoder()
  const blocks: Uint8Array[] = []

  const header = (name: Uint8Array, prefix: Uint8Array, size: number, type: string, mode: number, seconds: number) => {
    const block = new Uint8Array(BLOCK)
    const put = (value: string, at: number) => block.set(encoder.encode(value), at)
    const number = (value: number, at: number, length: number) => put(value.toString(8).padStart(length - 1, '0'), at)
    block.set(name, 0)
    number(mode, 100, 8)
    // Who owned the file is not carried: user and group are both written as nobody.
    number(0, 108, 8)
    number(0, 116, 8)
    number(size, 124, 12)
    number(seconds, 136, 12)
    put(type, 156)
    put('ustar\u000000', 257)
    block.set(prefix, 345)
    // The checksum is worked out with its own place filled with spaces.
    block.fill(0x20, 148, 156)
    const sum = block.reduce((total, byte) => total + byte, 0)
    put(`${sum.toString(8).padStart(6, '0')}\0 `, 148)
    return block
  }
  const padded = (data: Uint8Array) => {
    const block = new Uint8Array(Math.ceil(data.length / BLOCK) * BLOCK)
    block.set(data)
    return block
  }

  for (const entry of entries) {
    const full = entry.directory ? `${entry.name}/` : entry.name
    const whole = encoder.encode(full)
    const seconds = entry.modified ? Math.max(0, Math.floor(entry.modified.getTime() / 1000)) : 0
    const mode = entry.directory || entry.executable ? 0o755 : 0o644
    let name = whole
    let prefix = new Uint8Array(0)
    if (whole.length > 100) {
      // A long name is split at a slash into two fields, where there is a slash that allows it.
      const split = [...full].map((char, i) => (char === '/' ? i : -1)).filter((i) => i > 0 && i < full.length - 1)
      const fits = split.find((i) => encoder.encode(full.slice(0, i)).length <= 155 && encoder.encode(full.slice(i + 1)).length <= 100)
      if (fits !== undefined) {
        prefix = encoder.encode(full.slice(0, fits))
        name = encoder.encode(full.slice(fits + 1))
      } else {
        // Otherwise the name goes ahead in a record of its own, and a short stand-in follows.
        const body = `path=${full}\n`
        let length = encoder.encode(body).length + 3
        while (encoder.encode(`${length} ${body}`).length !== length) length = encoder.encode(`${length} ${body}`).length
        const record = encoder.encode(`${length} ${body}`)
        blocks.push(header(encoder.encode('PaxHeader'), new Uint8Array(0), record.length, 'x', 0o644, seconds), padded(record))
        name = whole.subarray(0, 100)
      }
    }
    blocks.push(header(name, prefix, entry.data.length, entry.directory ? '5' : '0', mode, seconds), padded(entry.data))
  }
  blocks.push(new Uint8Array(BLOCK * 2))
  const out = new Uint8Array(blocks.reduce((sum, block) => sum + block.length, 0))
  let at = 0
  for (const block of blocks) {
    out.set(block, at)
    at += block.length
  }
  return out
}
