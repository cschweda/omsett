import type { Format } from '../types'

export const zip: Format = {
  id: 'zip',
  name: 'ZIP',
  category: 'archive',
  extensions: ['zip'],
  mime: ['application/zip'],
  detect: ['zip'],
  explain:
    'A ZIP file is several files and folders packed into one and made smaller. Every computer can open one without extra software.',
  lossy: 'never',
  traits: [],
}
