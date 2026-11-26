import type { Format } from '../types'

export const rtf: Format = {
  id: 'rtf',
  name: 'RTF',
  category: 'document',
  extensions: ['rtf'],
  mime: ['application/rtf', 'text/rtf'],
  detect: ['rtf'],
  explain:
    'RTF is the Rich Text Format: an old document format that almost every word processor still opens, TextEdit and WordPad included. Converting it to DOCX, a web page, Markdown or a PDF keeps its headings, lists, tables and links; a document of any of those kinds can become one.',
  lossy: 'never',
  traits: [],
}
