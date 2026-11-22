import type { Format } from '../types'

export const svgz: Format = {
  id: 'svgz',
  name: 'SVGZ',
  category: 'vector',
  extensions: ['svgz'],
  mime: ['image/svg+xml'],
  detect: ['svgz'],
  explain:
    'SVGZ is an SVG that has been compressed to save space. It is the same drawing, and converts the same way.',
  lossy: 'never',
  traits: ['alpha', 'metadata', 'full-color'],
  readOnly: 'SVGZ can be read but not written',
}
