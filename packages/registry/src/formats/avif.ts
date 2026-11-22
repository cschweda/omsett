import type { Format } from '../types'

export const avif: Format = {
  id: 'avif',
  name: 'AVIF',
  category: 'image',
  extensions: ['avif'],
  mime: ['image/avif'],
  detect: ['avif'],
  explain:
    'AVIF is the newest of the web formats and makes the smallest files: often half the size of a JPEG that looks the same. It supports transparency and is displayed by every current browser. It is slower to create than WebP, and older software, including some email programs and image editors, cannot open it.',
  lossy: 'optional',
  traits: ['alpha', 'animation', 'metadata', 'full-color'],
  maxDimension: 65536,
}
