import type { Format } from '../types'

export const microdvd: Format = {
  id: 'microdvd',
  name: 'MicroDVD',
  category: 'subtitle',
  extensions: ['sub'],
  mime: ['text/x-microdvd'],
  detect: ['microdvd'],
  explain:
    'MicroDVD is an old subtitle format that counts video frames, not time, so it only lines up with a video that plays at the speed it was made for.',
  lossy: 'never',
  traits: ['styling'],
}
