import type { Format } from '../types'

export const psb: Format = {
  id: 'psb',
  name: 'PSB',
  category: 'image',
  extensions: ['psb'],
  mime: ['image/vnd.adobe.photoshop', 'application/x-photoshop'],
  detect: ['psb'],
  explain:
    'PSB is Photoshop’s format for pictures too large for a PSD: the same file with room for more. Every layer is kept separate so the picture can go on being edited. Omsett reads the finished picture, with the layers merged.',
  lossy: 'never',
  traits: ['alpha', 'metadata', 'layers', 'full-color'],
  readOnly: 'PSB can be read but not written',
}
