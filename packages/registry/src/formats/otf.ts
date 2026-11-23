import type { Format } from '../types'

export const otf: Format = {
  id: 'otf',
  name: 'OTF',
  category: 'font',
  extensions: ['otf'],
  mime: ['font/otf'],
  detect: ['otf'],
  explain:
    'OTF (OpenType) is a font file a computer installs, like TTF. Typefaces from professional foundries often come this way.',
  lossy: 'never',
  traits: [],
}
