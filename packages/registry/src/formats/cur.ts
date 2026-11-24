import type { Format } from '../types'

export const cur: Format = {
  id: 'cur',
  name: 'CUR',
  category: 'image',
  extensions: ['cur'],
  mime: ['image/x-win-bitmap', 'image/vnd.microsoft.icon'],
  detect: ['cur'],
  explain:
    'CUR is the Windows mouse pointer format: a small picture, often at several sizes, with a note of which point of it does the clicking. Omsett reads the largest picture; the clicking point belongs to a pointer and is not carried into an ordinary picture. It writes one at 32, 48 and 64 pixels, never larger than the picture it came from, that clicks with its top left corner.',
  lossy: 'never',
  traits: ['alpha', 'multi-page', 'full-color'],
}
