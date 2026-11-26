import type { Format } from '../types'

export const wv: Format = {
  id: 'wv',
  name: 'WavPack',
  category: 'audio',
  extensions: ['wv'],
  mime: ['audio/wavpack', 'audio/x-wavpack'],
  detect: ['wv'],
  explain:
    'WavPack keeps every bit of the sound, like FLAC, and is often a little smaller. Music collectors use it. Everything in it can be turned back into the original WAV.',
  lossy: 'never',
  traits: ['metadata'],
}
