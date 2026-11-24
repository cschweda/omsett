import type { Format } from '../types'

export const flac: Format = {
  id: 'flac',
  name: 'FLAC',
  category: 'audio',
  extensions: ['flac'],
  mime: ['audio/flac', 'audio/x-flac'],
  detect: ['flac'],
  explain:
    'FLAC packs sound to about half the size of a WAV and loses nothing: unpacked, every number is the one that went in. Most players read it. Use it to keep a recording; use WAV where a program asks for one.',
  lossy: 'never',
  traits: ['metadata'],
}
