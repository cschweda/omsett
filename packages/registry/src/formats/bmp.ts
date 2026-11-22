import type { Format } from '../types'

export const bmp: Format = {
  id: 'bmp',
  name: 'BMP',
  category: 'image',
  extensions: ['bmp'],
  mime: ['image/bmp'],
  detect: ['bmp'],
  explain:
    'BMP is the plain, uncompressed picture format Windows has had since the 1980s. Every pixel is stored as it is, so files are large and nothing is lost. Almost nothing needs BMP today except old software and some hardware, which is the usual reason to make one.',
  lossy: 'never',
  traits: ['full-color'],
}
