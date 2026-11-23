import { pdfInfo } from '../info'
import { officeToHtml } from '../markup'
import type { ConvertInput, ConvertOutput, Engine } from '../types'
import { outputName, Refusal, throwIfAborted } from '../util'
import { readPdf } from './read'

// PDF, read to a web page; and from there, by the page's own route, to Markdown or Word.

/** Larger than this is not read in a browser tab. */
const MAX_PDF_BYTES = 64 * 1024 * 1024

export const TAGGED = "This PDF is tagged, so its headings, lists and tables were read from the PDF's own structure, not guessed."
export const ESTIMATED = 'This PDF has no structure marked in it, so headings, lists and paragraphs were estimated from how the pages look. Tables are not found this way. Check the result.'
export const ESTIMATED_DESPITE_TAGS = 'This PDF has tags, but they do not describe its text: they mark whole pages, or only the pictures. So headings, lists and paragraphs were estimated from how the pages look. Tables are not found this way. Check the result.'

export function createPdfEngine(): Engine {
  return {
    ...pdfInfo,
    available: async () => true,
    // The reader is a script that arrives with the first PDF.
    load: async () => {},
    async convert(input: ConvertInput): Promise<ConvertOutput[]> {
      throwIfAborted(input.signal)
      if (input.blob.size > MAX_PDF_BYTES) throw new Refusal('This PDF is too large to convert in a browser')
      const bytes = new Uint8Array(await input.blob.arrayBuffer())
      input.onProgress(0.1)
      const read = await readPdf(bytes)
      throwIfAborted(input.signal)
      input.onProgress(0.8)
      // What was read is cleaned like any other page: a link in a PDF can be code too.
      const html = await officeToHtml(read, input.name)
      input.onProgress(1)
      return [
        {
          name: outputName(input.name, input.to),
          format: input.to.id,
          blob: new Blob([html], { type: input.to.mime[0] }),
          note: read.structure === 'tags' ? TAGGED : read.structure === 'layout' ? ESTIMATED : ESTIMATED_DESPITE_TAGS,
        },
      ]
    },
  }
}
