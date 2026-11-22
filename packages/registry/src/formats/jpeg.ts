import type { Format } from '../types'

export const jpeg: Format = {
  id: 'jpeg',
  name: 'JPEG',
  category: 'image',
  extensions: ['jpg', 'jpeg'],
  mime: ['image/jpeg'],
  detect: ['jpg'],
  explain:
    'JPEG is the everyday format for photographs. It makes files small by discarding detail the eye is unlikely to miss, and it opens everywhere, on anything. It has no transparency, and it copes badly with text and hard edges, where the discarded detail shows up as smudges. Each time a JPEG is saved again it loses a little more.',
  lossy: 'always',
  traits: ['metadata', 'full-color'],
  maxDimension: 65535,
}
