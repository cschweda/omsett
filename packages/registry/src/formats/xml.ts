import type { Format } from '../types'

export const xml: Format = {
  id: 'xml',
  name: 'XML',
  category: 'data',
  extensions: ['xml'],
  mime: ['application/xml', 'text/xml'],
  detect: ['xml'],
  explain:
    'XML holds data inside named tags, like the ones in a web page. Older systems, feeds and many office and government formats are built on it.',
  lossy: 'never',
  traits: ['nesting', 'comments'],
}
