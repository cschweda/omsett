import type { Format } from '../types'

export const fdx: Format = {
  id: 'fdx',
  name: 'Final Draft',
  category: 'screenplay',
  extensions: ['fdx'],
  mime: ['application/xml'],
  detect: ['fdx'],
  explain:
    "FDX is the file Final Draft saves, and what studios and most screenwriting programs exchange. It holds a script with every line marked as what it is.",
  lossy: 'never',
  traits: [],
}
