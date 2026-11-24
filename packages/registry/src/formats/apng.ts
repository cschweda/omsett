import type { Format } from '../types'

export const apng: Format = {
  id: 'apng',
  name: 'Animated PNG',
  category: 'image',
  // Most are simply named .png: an animated PNG is a PNG with more pictures inside it.
  extensions: ['apng', 'png'],
  mime: ['image/apng', 'image/png'],
  detect: ['apng'],
  explain:
    'An animated PNG is a PNG that moves: a short loop of pictures in one file, with full colour and real transparency, which a GIF cannot manage. It usually has an ordinary .png name, and a program that does not know about the animation shows its first picture and nothing more. Omsett reads that first picture too, and says so before you convert.',
  lossy: 'never',
  traits: ['alpha', 'animation', 'metadata', 'full-color'],
  readOnly: 'Animated PNG can be read but not written yet',
}
