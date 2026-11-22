import type { Format } from '../types'

export const hdr: Format = {
  id: 'hdr',
  name: 'Radiance HDR',
  category: 'image',
  extensions: ['hdr'],
  mime: ['image/vnd.radiance'],
  detect: ['hdr'],
  explain:
    'Radiance HDR stores far more range between dark and bright than a screen can show. It is used for lighting in 3D work and for panoramas. Converted to an ordinary format, the brightest and darkest parts are cut to what a screen shows.',
  lossy: 'never',
  traits: ['full-color'],
  readOnly: 'Radiance HDR can be read but not written',
}
