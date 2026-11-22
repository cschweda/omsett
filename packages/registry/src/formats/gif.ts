import type { Format } from '../types'

export const gif: Format = {
  id: 'gif',
  name: 'GIF',
  category: 'image',
  extensions: ['gif'],
  mime: ['image/gif'],
  detect: ['gif'],
  explain:
    'GIF is the old format for simple animations and flat graphics. It can show only 256 colours at once, so photographs come out speckled, and its transparency is all or nothing, with no soft edges. Almost everything displays it. For a still picture, PNG or WebP will look better and usually be smaller.',
  lossy: 'never',
  traits: ['alpha', 'animation', 'metadata'],
  maxDimension: 65535,
}
