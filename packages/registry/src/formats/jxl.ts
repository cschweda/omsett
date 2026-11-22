import type { Format } from '../types'

export const jxl: Format = {
  id: 'jxl',
  name: 'JPEG XL',
  category: 'image',
  extensions: ['jxl'],
  mime: ['image/jxl'],
  detect: ['jxl'],
  explain:
    'JPEG XL was designed to replace JPEG: smaller files at higher quality, with transparency and very large pictures supported. It is excellent for keeping photographs. Its weakness is support: Safari displays it, Chrome and Firefox do not by default, so it is a format for storing pictures, not yet for publishing them.',
  lossy: 'optional',
  traits: ['alpha', 'animation', 'metadata', 'full-color'],
}
