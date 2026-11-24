import type { Format } from '../types'

export const mp3: Format = {
  id: 'mp3',
  name: 'MP3',
  category: 'audio',
  extensions: ['mp3'],
  mime: ['audio/mpeg', 'audio/mp3'],
  detect: ['mp3'],
  explain:
    'MP3 makes sound about a tenth the size of a WAV by leaving out what a listener is least likely to miss. Everything plays it. What is left out is gone for good, so keep the original if you may want it again.',
  lossy: 'always',
  traits: ['metadata'],
}
