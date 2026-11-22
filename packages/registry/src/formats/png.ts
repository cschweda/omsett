import type { Format } from '../types'

export const png: Format = {
  id: 'png',
  name: 'PNG',
  category: 'image',
  extensions: ['png'],
  mime: ['image/png'],
  detect: ['png', 'apng'],
  explain:
    'PNG keeps every pixel exactly as it was saved, which makes it the safe choice for screenshots, logos, diagrams, and anything with sharp edges or text. It can also be transparent, so a logo sits cleanly on any background. The price is size: a photograph saved as PNG is often many times larger than it needs to be.',
  lossy: 'never',
  traits: ['alpha', 'metadata'],
}
