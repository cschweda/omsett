import type { Format } from '../types'

export const tga: Format = {
  id: 'tga',
  name: 'TGA',
  category: 'image',
  extensions: ['tga'],
  mime: ['image/x-tga'],
  detect: ['tga'],
  explain:
    'TGA, or Targa, is an old, simple picture format still used for textures in games and 3D software. Files are large and nothing is lost. Outside those tools, little opens it.',
  lossy: 'never',
  traits: ['alpha', 'full-color'],
}
