import type { Format } from '../types'

export const icns: Format = {
  id: 'icns',
  name: 'ICNS',
  category: 'image',
  extensions: ['icns'],
  mime: ['image/icns', 'image/x-icns'],
  detect: ['icns'],
  explain:
    'ICNS is the Mac icon format: the picture an app or a folder shows in the Finder and the Dock. One file holds the same icon at several sizes, up to 1024 pixels. Omsett reads the largest one, and writes one at each of those sizes the picture is large enough for, made square.',
  lossy: 'never',
  traits: ['alpha', 'multi-page', 'full-color'],
}
