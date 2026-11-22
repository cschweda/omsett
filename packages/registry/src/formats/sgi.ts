import type { Format } from '../types'

export const sgi: Format = {
  id: 'sgi',
  name: 'SGI',
  category: 'image',
  extensions: ['sgi', 'rgb', 'bw'],
  mime: ['image/x-sgi'],
  detect: ['sgi'],
  explain:
    'SGI is the picture format of Silicon Graphics workstations, found in older 3D, film and scientific work. Little current software opens it.',
  lossy: 'never',
  traits: ['alpha', 'full-color'],
  readOnly: 'SGI can be read but not written',
}
