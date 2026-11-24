import type { Format } from '../types'

export const au: Format = {
  id: 'au',
  name: 'AU',
  category: 'audio',
  extensions: ['au', 'snd'],
  mime: ['audio/basic'],
  detect: ['au'],
  explain:
    'AU is the sound format of early Unix workstations and of the first sounds on the web. Most audio programs still read it; few people need to make one today.',
  lossy: 'never',
  traits: ['metadata'],
}
