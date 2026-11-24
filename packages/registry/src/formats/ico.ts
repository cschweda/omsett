import type { Format } from '../types'

export const ico: Format = {
  id: 'ico',
  name: 'ICO',
  category: 'image',
  extensions: ['ico'],
  mime: ['image/x-icon', 'image/vnd.microsoft.icon'],
  detect: ['ico'],
  explain:
    'ICO is the Windows icon format, and the format of the small picture a website shows in a browser tab. One file usually holds the same icon at several sizes. Omsett reads the largest one, and writes one at 16, 32, 48 and 256 pixels, made square and never larger than the picture it came from.',
  lossy: 'never',
  traits: ['alpha', 'multi-page', 'full-color'],
}
