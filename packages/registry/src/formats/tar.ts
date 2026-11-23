import type { Format } from '../types'

export const tar: Format = {
  id: 'tar',
  name: 'TAR',
  category: 'archive',
  extensions: ['tar'],
  mime: ['application/x-tar'],
  detect: ['tar'],
  explain:
    'A TAR file is several files and folders joined into one, without making them smaller. It is the usual way to bundle files on Linux and macOS.',
  lossy: 'never',
  traits: [],
}
