import { Refusal, UNSAFE } from '../util'

// What an archive holds, whatever kind it is: files and folders, each with a name. Reading any
// archive gives this, and writing any archive starts from it.
//
// An archive is the classic way to attack whatever opens it, so three things are settled here,
// once, for every format: how much may be unpacked, how many files there may be, and what a
// file may be called.

export interface Entry {
  /** Forward slashes, no leading slash, no "..": always inside the archive's own folder. */
  name: string
  data: Uint8Array
  directory: boolean
  /** When the file was last changed, to the second. Null where the archive does not say. */
  modified: Date | null
  /** Whether the file is marked as a program that can be run. */
  executable: boolean
}

/** The most an archive may unpack to. A few kilobytes can claim to hold terabytes. */
export const MAX_UNPACKED_BYTES = 256 * 1024 * 1024
/** The most files and folders. */
export const MAX_ENTRIES = 10_000
/** The longest name, in characters. */
const MAX_NAME = 1024

export const invalid = (name: string) => new Refusal(`This file is not a valid ${name} archive`)
export const tooLarge = () => new Refusal('This archive unpacks to more than Omsett will handle (256 MB)')
export const tooMany = () => new Refusal('This archive holds more files than Omsett will handle (10,000)')
const escapes = () => new Refusal('This archive holds a file named so that it would land outside the folder it is unpacked into')
const twice = () => new Refusal('This archive holds two files with the same name')

/**
 * The name an entry is kept under, or null for one that names nothing ("./"). A name that
 * points outside the archive is not cleaned up into one that does not: the archive was built
 * to do harm, and is refused.
 */
export function safeName(raw: string, format: string): string | null {
  if (raw.length > MAX_NAME) throw invalid(format)
  // Archives made on Windows write folders with backslashes; treated as the same thing here,
  // so that "..\\..\\x" is caught as surely as "../../x".
  const name = raw.replaceAll('\\', '/')
  if (name.startsWith('/') || /^[a-z]:/i.test(name) || name.includes('\0')) throw escapes()
  const parts: string[] = []
  for (const part of name.split('/')) {
    if (part === '..') throw escapes()
    const cleaned = part.replace(UNSAFE, '')
    if (cleaned !== '' && cleaned !== '.') parts.push(cleaned)
  }
  return parts.length === 0 ? null : parts.join('/')
}

/** Collects entries, and refuses an archive that turns out to hold more than it should. */
export class Contents {
  readonly entries: Entry[] = []
  private readonly names = new Set<string>()
  private bytes = 0

  constructor(private readonly format: string) {}

  /** Called with each size an archive states, before anything is unpacked to that size. */
  reserve(bytes: number): void {
    this.bytes += bytes
    if (this.bytes > MAX_UNPACKED_BYTES) throw tooLarge()
  }

  add(raw: string, data: Uint8Array, directory: boolean, modified: Date | null, executable: boolean): void {
    const name = safeName(raw, this.format)
    if (name === null) return
    // Two entries with one name: which a program keeps depends on the program, and that
    // difference is how a file is slipped past one that checks and another that unpacks.
    if (this.names.has(name)) {
      // A folder listed twice is harmless, and common.
      if (directory && this.entries.some((entry) => entry.name === name && entry.directory)) return
      throw twice()
    }
    if (this.entries.length >= MAX_ENTRIES) throw tooMany()
    this.names.add(name)
    this.entries.push({ name, data, directory, modified, executable })
  }

  done(): Entry[] {
    if (!this.entries.some((entry) => !entry.directory)) throw new Refusal('This archive has no files in it')
    return this.entries
  }
}

/** Unpack to exactly `length` bytes. More, fewer, or a damaged stream: null. */
export async function unpack(
  packed: Uint8Array,
  length: number,
  format: 'deflate-raw' | 'gzip',
): Promise<Uint8Array | null> {
  const out = new Uint8Array(length)
  let filled = 0
  try {
    const stream = new Blob([packed as BlobPart]).stream().pipeThrough(new DecompressionStream(format))
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

/** Unpack a gzip stream whose size is not stated, to at most `limit` bytes. */
export async function gunzipWithin(packed: Uint8Array, limit: number): Promise<Uint8Array | 'too-large' | null> {
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    const stream = new Blob([packed as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'))
    const reader = stream.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.length
      if (total > limit) {
        await reader.cancel().catch(() => {})
        return 'too-large'
      }
      chunks.push(value)
    }
  } catch {
    return null
  }
  const out = new Uint8Array(total)
  let at = 0
  for (const chunk of chunks) {
    out.set(chunk, at)
    at += chunk.length
  }
  return out
}

export async function pack(data: Uint8Array, format: 'deflate-raw' | 'gzip'): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream(format))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}
