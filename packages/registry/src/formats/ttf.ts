import type { Format } from '../types'

export const ttf: Format = {
  id: 'ttf',
  name: 'TTF',
  category: 'font',
  extensions: ['ttf'],
  mime: ['font/ttf'],
  detect: ['ttf'],
  explain:
    'TTF (TrueType) is the font file a computer installs. Windows, macOS and Linux all use it, and so do design and office programs.',
  lossy: 'never',
  traits: [],
}
