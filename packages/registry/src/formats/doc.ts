import type { Format } from '../types'

export const doc: Format = {
  id: 'doc',
  name: 'DOC',
  category: 'document',
  extensions: ['doc', 'dot'],
  mime: ['application/msword'],
  detect: ['doc'],
  explain:
    'DOC is the Word document as it was until 2007. Word still opens it, but many newer programs and websites will not. Converting it to DOCX, a web page or Markdown makes it usable everywhere.',
  lossy: 'never',
  traits: [],
  readOnly: 'DOC can be read but not written: it is an old format, and DOCX has taken its place',
}
