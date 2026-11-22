import type { Format } from '../types'

export const svg: Format = {
  id: 'svg',
  name: 'SVG',
  category: 'vector',
  extensions: ['svg'],
  mime: ['image/svg+xml'],
  detect: ['svg'],
  explain:
    'SVG describes a picture as shapes and lines instead of pixels, so it stays sharp at any size. Logos, icons and diagrams are usually SVG. Converting one to PNG, JPEG or WebP fixes it at one size, which is what email, slides and older software need.',
  lossy: 'never',
  traits: ['alpha', 'metadata', 'full-color'],
  readOnly: 'SVG can be read but not written',
}
