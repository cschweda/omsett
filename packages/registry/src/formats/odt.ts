import type { Format } from '../types'

export const odt: Format = {
  id: 'odt',
  name: 'ODT',
  category: 'document',
  extensions: ['odt', 'ott'],
  mime: ['application/vnd.oasis.opendocument.text', 'application/vnd.oasis.opendocument.text-template'],
  detect: ['odt', 'ott'],
  explain:
    'ODT is the OpenDocument text document: what LibreOffice and OpenOffice save, and what many governments ask for. Converting it to DOCX, a web page, Markdown or a PDF makes it open in everything else, and a document of any of those kinds can become one.',
  lossy: 'never',
  traits: [],
}
