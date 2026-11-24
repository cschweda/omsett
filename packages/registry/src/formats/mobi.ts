import type { Format } from '../types'

export const mobi: Format = {
  id: 'mobi',
  name: 'MOBI',
  category: 'ebook',
  extensions: ['mobi', 'prc'],
  mime: ['application/x-mobipocket-ebook'],
  detect: ['mobi'],
  explain:
    'MOBI is the older Kindle e-book, from before 2011. Kindles still open it and little else does. Converted to EPUB, a book without copy protection can be read on anything.',
  lossy: 'never',
  traits: [],
  readOnly: 'MOBI can be read but not written',
}
