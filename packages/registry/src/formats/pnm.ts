import type { Format } from '../types'

export const pnm: Format = {
  id: 'pnm',
  name: 'Netpbm',
  category: 'image',
  extensions: ['ppm', 'pgm', 'pbm', 'pnm', 'pam'],
  mime: ['image/x-portable-anymap'],
  detect: ['pnm'],
  explain:
    'The Netpbm formats (PPM, PGM, PBM and PAM) are about the simplest picture files there are: a line of text giving the size, then the pixels. Scientific and command-line tools write them. Ordinary software does not open them.',
  lossy: 'never',
  traits: ['full-color'],
}
