import type { Format } from '../types'

export const docx: Format = {
  id: 'docx',
  name: 'DOCX',
  category: 'document',
  // A Word document saved with macros (DOCM), a template (DOTX) and a template with macros
  // (DOTM) are the same package under another label, and are read as a DOCX. Macros never run.
  extensions: ['docx', 'docm', 'dotx', 'dotm'],
  mime: [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-word.document.macroEnabled.12',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.template',
    'application/vnd.ms-word.template.macroEnabled.12',
  ],
  detect: ['docx', 'docm', 'dotx', 'dotm'],
  explain:
    'DOCX is the Word document. Word, Pages, Google Docs and LibreOffice all open and save it, and it is what most people mean by "a document". A document saved with macros (DOCM) or as a template (DOTX, DOTM) is read the same way; its macros are never run and never carried over.',
  lossy: 'never',
  traits: [],
}
