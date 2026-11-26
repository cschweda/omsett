import type { Format } from '../types'

export const m4a: Format = {
  id: 'm4a',
  name: 'M4A',
  category: 'audio',
  extensions: ['m4a', 'm4b'],
  mime: ['audio/mp4', 'audio/x-m4a'],
  detect: ['m4a'],
  explain:
    'M4A is the sound file phones, iTunes and most podcasts use. Inside is AAC, which leaves out sound to stay small, or Apple Lossless, which keeps it all. Omsett reads both, and writes M4A as Apple Lossless: nothing is left out.',
  lossy: 'optional',
  traits: ['metadata'],
}
