import type { Format } from '../types'

export const docx: Format = {
  id: 'docx',
  name: 'DOCX',
  category: 'document',
  extensions: ['docx'],
  mime: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  detect: ['docx'],
  explain:
    'DOCX is the Word document. Word, Pages, Google Docs and LibreOffice all open and save it, and it is what most people mean by "a document".',
  lossy: 'never',
  traits: [],
}
