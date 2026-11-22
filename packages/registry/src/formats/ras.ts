import type { Format } from '../types'

export const ras: Format = {
  id: 'ras',
  name: 'Sun Raster',
  category: 'image',
  extensions: ['ras', 'sun'],
  mime: ['image/x-sun-raster'],
  detect: ['ras'],
  explain:
    'Sun Raster is the picture format of Sun workstations, found in older scientific and Unix archives. Little current software opens it.',
  lossy: 'never',
  traits: ['full-color'],
  readOnly: 'Sun Raster can be read but not written',
}
