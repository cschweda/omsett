import type { Format } from '../types'

export const tgz: Format = {
  id: 'tgz',
  name: 'TAR.GZ',
  category: 'archive',
  extensions: ['tar.gz', 'tgz', 'gz'],
  mime: ['application/gzip'],
  detect: ['tgz'],
  explain:
    'A TAR.GZ file (also written .tgz) is a TAR file made smaller with gzip. Software for Linux and macOS is commonly distributed this way.',
  lossy: 'never',
  traits: [],
}
