import type { Format } from '../types'

export const pcx: Format = {
  id: 'pcx',
  name: 'PCX',
  category: 'image',
  extensions: ['pcx'],
  mime: ['image/x-pcx'],
  detect: ['pcx'],
  explain:
    'PCX was the format of PC Paintbrush and of DOS-era games and clip art. It is found today in old archives, and little current software opens it.',
  lossy: 'never',
  traits: ['full-color'],
  readOnly: 'PCX can be read but not written',
}
