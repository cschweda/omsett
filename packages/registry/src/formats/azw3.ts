import type { Format } from '../types'

export const azw3: Format = {
  id: 'azw3',
  name: 'AZW3',
  category: 'ebook',
  extensions: ['azw3', 'azw'],
  mime: ['application/vnd.amazon.ebook'],
  detect: ['azw3'],
  explain:
    'AZW3 is the Kindle’s e-book. Only Kindles and the Kindle app open it. Converted to EPUB, a book without copy protection can be read on anything.',
  lossy: 'never',
  traits: [],
  readOnly: 'AZW3 can be read but not written',
}
