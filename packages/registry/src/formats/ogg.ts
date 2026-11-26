import type { Format } from '../types'

export const ogg: Format = {
  id: 'ogg',
  name: 'Ogg Vorbis',
  category: 'audio',
  extensions: ['ogg', 'oga'],
  mime: ['audio/ogg', 'audio/vorbis'],
  detect: ['ogg'],
  explain:
    'Ogg Vorbis is an open sound format, free of patents, used by many games and by Wikipedia. Like MP3 it leaves out sound to stay small, and it sounds better than MP3 at the same size.',
  lossy: 'always',
  traits: ['metadata'],
}
