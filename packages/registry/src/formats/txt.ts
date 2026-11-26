import type { Format } from '../types'

export const txt: Format = {
  id: 'txt',
  name: 'Plain text',
  category: 'text',
  extensions: ['txt', 'text'],
  mime: ['text/plain'],
  detect: ['txt'],
  explain:
    'Plain text is words and nothing else: no headings, no bold, no pictures. Everything opens it. A document becomes plain text with its headings and lists set out as lines; plain text becomes a document a paragraph to each block of lines.',
  lossy: 'never',
  traits: [],
}
