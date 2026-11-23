import type { Format } from '../types'

export const woff2: Format = {
  id: 'woff2',
  name: 'WOFF2',
  category: 'font',
  extensions: ['woff2'],
  mime: ['font/woff2'],
  detect: ['woff2'],
  explain:
    'WOFF2 is the smallest way to send a font to a browser, about a third smaller than WOFF, and what most websites use today.',
  lossy: 'never',
  traits: [],
}
