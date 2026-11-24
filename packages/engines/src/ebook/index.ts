import { ebookInfo } from '../info'
import type { ConvertInput, ConvertOutput, Engine } from '../types'
import { outputName, Refusal, throwIfAborted } from '../util'
import { writeEpub } from './epub-write'
import { readKindle } from './kindle'
import { notBook } from './mobi'

export { readKindle, type Parts } from './kindle'
export { readMobi } from './mobi'

// E-books. A Kindle book (AZW3 or MOBI) is taken apart into its pages, stylesheets, pictures
// and list of contents, and those are written as an EPUB, which every reader but a Kindle
// opens. Both are done by Omsett's own code. A book with copy protection is refused.

/** Larger books than this are not read. */
const MAX_BOOK_BYTES = 256 * 1024 * 1024

export function createEbookEngine(): Engine {
  return {
    ...ebookInfo,
    available: async () => typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined',
    load: async () => {},
    async convert(input: ConvertInput): Promise<ConvertOutput[]> {
      throwIfAborted(input.signal)
      if (input.blob.size > MAX_BOOK_BYTES) throw new Refusal('This book is too large to convert in a browser')
      const bytes = new Uint8Array(await input.blob.arrayBuffer())
      input.onProgress(0.1)
      let parts
      try {
        parts = readKindle(bytes)
      } catch (error) {
        // Reading past the end of a file that lied about a length ends here too.
        throw error instanceof Refusal ? error : notBook()
      }
      throwIfAborted(input.signal)
      input.onProgress(0.5)
      const epub = await writeEpub(parts)
      input.onProgress(1)
      const said = parts.contents.length === 0 ? 'The book has no list of contents of its own, so the EPUB has one entry: the beginning.' : undefined
      return [{ name: outputName(input.name, input.to), format: input.to.id, blob: new Blob([epub as BlobPart], { type: input.to.mime[0] }), ...(said ? { note: said } : {}) }]
    },
  }
}
