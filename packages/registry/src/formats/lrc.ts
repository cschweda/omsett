import type { Format } from '../types'

export const lrc: Format = {
  id: 'lrc',
  name: 'LRC',
  category: 'subtitle',
  extensions: ['lrc'],
  mime: ['application/x-lrc'],
  detect: ['lrc'],
  explain:
    'LRC holds song lyrics with the time each line is sung, so a music player can show the words in step with the music.',
  lossy: 'never',
  traits: [],
}
