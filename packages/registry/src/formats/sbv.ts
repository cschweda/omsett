import type { Format } from '../types'

export const sbv: Format = {
  id: 'sbv',
  name: 'SBV',
  category: 'subtitle',
  extensions: ['sbv'],
  mime: ['text/x-sbv'],
  detect: ['sbv'],
  explain:
    'SBV is the simple caption file YouTube gives you when you download captions from a video: a start and end time, then the text.',
  lossy: 'never',
  traits: [],
}
