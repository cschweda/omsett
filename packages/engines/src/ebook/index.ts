import { ebookInfo } from '../info'
import type { ConvertInput, ConvertOutput, Engine } from '../types'
import { outputName, Refusal, throwIfAborted } from '../util'
import { notEpub, readEpub } from './epub-read'
import { writeEpub } from './epub-write'
import { readKindle } from './kindle'
import { notBook } from './mobi'
import { bookPage, pageParts } from './page'

export { readKindle, type Parts } from './kindle'
export { readMobi } from './mobi'
export { openedAndClosed, readEpub } from './epub-read'
export { bookPage, pageParts } from './page'

// E-books. A Kindle book (AZW3 or MOBI) is taken apart into its pages, stylesheets, pictures
// and list of contents, and those are written as an EPUB, which every reader but a Kindle
// opens. An EPUB is taken apart the same way. Either can be set out as one page, which is how a
// book becomes a PDF, a Word document or Markdown; and a page can be cut into chapters and
// written as an EPUB. All of it is done by Omsett's own code. A book with copy protection is refused.

/** Larger books than this are not read. */
const MAX_BOOK_BYTES = 256 * 1024 * 1024

/** A page is read whole. Larger than this is not read. */
const MAX_PAGE_BYTES = 16 * 1024 * 1024

/** A reader may run out of room on a page nested very deeply, and browsers name that differently. */
function tooDeep(error: unknown): unknown {
  const message = error instanceof Error ? `${error.name} ${error.message}` : ''
  return error instanceof RangeError || /recursion|call stack/i.test(message) ? new Refusal('This file is nested too deeply to convert') : error
}

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
      const output = (written: string | Uint8Array, note?: string): ConvertOutput[] => [
        { name: outputName(input.name, input.to), format: input.to.id, blob: new Blob([written as BlobPart], { type: input.to.mime[0] }), ...(note ? { note } : {}) },
      ]
      // A page, cut into chapters and written as a book.
      if (input.from.id === 'html') {
        if (bytes.length > MAX_PAGE_BYTES) throw new Refusal('This file is too large to make a book of in a browser')
        let text
        try {
          text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
        } catch {
          throw new Refusal('This file is not text in UTF-8, the encoding Omsett reads text in')
        }
        let parts
        try {
          parts = await pageParts(text, input.name)
        } catch (error) {
          throw tooDeep(error)
        }
        throwIfAborted(input.signal)
        input.onProgress(0.5)
        const epub = await writeEpub(parts)
        input.onProgress(1)
        return output(epub)
      }
      let parts
      try {
        parts = input.from.id === 'epub' ? await readEpub(bytes) : readKindle(bytes)
      } catch (error) {
        // Reading past the end of a file that lied about a length ends here too.
        throw error instanceof Refusal ? error : input.from.id === 'epub' ? notEpub() : notBook()
      }
      throwIfAborted(input.signal)
      input.onProgress(0.5)
      if (input.to.id === 'html') {
        let page
        try {
          page = await bookPage(parts, input.name)
        } catch (error) {
          throw tooDeep(error)
        }
        input.onProgress(1)
        return output(page.html, page.note)
      }
      const epub = await writeEpub(parts)
      input.onProgress(1)
      return output(epub, parts.contents.length === 0 ? 'The book has no list of contents of its own, so the EPUB has one entry: the beginning.' : undefined)
    },
  }
}
