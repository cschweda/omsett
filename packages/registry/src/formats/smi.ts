import type { Format } from '../types'

export const smi: Format = {
  id: 'smi',
  name: 'SAMI',
  category: 'subtitle',
  extensions: ['smi', 'sami'],
  mime: ['application/x-sami'],
  detect: ['smi'],
  explain:
    'SAMI is an older caption format from Microsoft that looks like a web page. Some players and older videos still use it.',
  lossy: 'never',
  traits: ['styling'],
}
