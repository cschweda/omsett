import type { Format } from '../types'

export const webp: Format = {
  id: 'webp',
  name: 'WebP',
  category: 'image',
  extensions: ['webp'],
  mime: ['image/webp'],
  detect: ['webp'],
  explain:
    'WebP is a format made for the web. It produces files a good deal smaller than PNG or JPEG at a quality most people cannot tell apart, and it still supports transparency. Every current browser displays it. Reach for it when an image is headed for a website; keep the original if you will need to edit it again or hand it to someone using older software.',
  lossy: 'optional',
  traits: ['alpha', 'animation', 'metadata'],
  maxDimension: 16383,
}
