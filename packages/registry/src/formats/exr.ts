import type { Format } from '../types'

export const exr: Format = {
  id: 'exr',
  name: 'OpenEXR',
  category: 'image',
  extensions: ['exr'],
  mime: ['image/x-exr'],
  detect: ['exr'],
  explain:
    'OpenEXR is the film industry format for pictures with more range and precision than a screen can show. Visual effects and 3D software write it. Converted to an ordinary format, the brightest and darkest parts are cut to what a screen shows.',
  lossy: 'optional',
  traits: ['alpha', 'metadata', 'full-color'],
  readOnly: 'OpenEXR can be read but not written',
}
