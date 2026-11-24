import type { Format } from '../types'

export const dds: Format = {
  id: 'dds',
  name: 'DDS',
  category: 'image',
  extensions: ['dds'],
  mime: ['image/vnd.ms-dds', 'image/x-dds'],
  detect: ['dds'],
  explain:
    'DDS is the format games use for the pictures wrapped around their 3D models, stored the way a graphics card reads them. One file often holds the same picture at several smaller sizes as well. Omsett reads the largest, and writes the picture plainly: every pixel as it is, with no smaller copies.',
  lossy: 'optional',
  traits: ['alpha', 'multi-page', 'full-color'],
}
