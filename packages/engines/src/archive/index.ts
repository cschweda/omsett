import { archiveInfo } from '../info'
import type { ConvertInput, ConvertOutput, Engine } from '../types'
import { outputName, Refusal, throwIfAborted } from '../util'
import { gunzipWithin, invalid, MAX_ENTRIES, MAX_UNPACKED_BYTES, pack, tooLarge, type Entry } from './entries'
import { readTar, writeTar } from './tar'
import { readZip, writeZip } from './zip'

// Archives: ZIP, TAR and TAR.GZ, each to the others. An archive is unpacked into its files and
// folders, in memory, and packed again as the other kind. Nothing is written anywhere, no file
// in it is opened or run, and what a file is called is checked before it is kept.

/** Larger than this is not read as an archive. */
const MAX_ARCHIVE_BYTES = 256 * 1024 * 1024
/** A TAR is its files plus a header for each, so it may be this much larger than they are. */
const MAX_TAR_BYTES = MAX_UNPACKED_BYTES + MAX_ENTRIES * 2048

async function read(format: string, bytes: Uint8Array): Promise<Entry[]> {
  if (format === 'zip') return readZip(bytes)
  if (format === 'tar') return readTar(bytes, 'TAR')
  if (format === 'tgz') {
    const tar = await gunzipWithin(bytes, MAX_TAR_BYTES)
    if (tar === 'too-large') throw tooLarge()
    if (tar === null) throw invalid('TAR.GZ')
    return readTar(tar, 'TAR.GZ')
  }
  throw new Error(`The archive engine does not read ${format}`)
}

async function write(format: string, entries: Entry[]): Promise<Uint8Array> {
  if (format === 'zip') return writeZip(entries)
  if (format === 'tar') return writeTar(entries)
  if (format === 'tgz') return pack(writeTar(entries), 'gzip')
  throw new Error(`The archive engine does not write ${format}`)
}

/** Several files → one ZIP, for downloading a batch of results together. */
export async function zipFiles(files: Array<{ name: string; data: Uint8Array }>): Promise<Uint8Array> {
  return writeZip(files.map((file) => ({ name: file.name, data: file.data, directory: false, modified: null, executable: false })))
}

export function createArchiveEngine(): Engine {
  return {
    ...archiveInfo,
    available: async () => typeof DecompressionStream !== 'undefined' && typeof CompressionStream !== 'undefined',
    load: async () => {},
    async convert(input: ConvertInput): Promise<ConvertOutput[]> {
      throwIfAborted(input.signal)
      if (input.blob.size > MAX_ARCHIVE_BYTES) throw new Refusal('This archive is too large to convert in a browser')
      const bytes = new Uint8Array(await input.blob.arrayBuffer())
      input.onProgress(0.1)
      let entries: Entry[]
      try {
        entries = await read(input.from.id, bytes)
      } catch (error) {
        // Reading past the end of a file that lied about its layout ends here too.
        throw error instanceof Refusal ? error : invalid(input.from.name)
      }
      throwIfAborted(input.signal)
      input.onProgress(0.6)
      const written = await write(input.to.id, entries)
      input.onProgress(1)
      return [
        {
          name: outputName(input.name, input.to),
          format: input.to.id,
          blob: new Blob([written as BlobPart], { type: input.to.mime[0] }),
        },
      ]
    },
  }
}
