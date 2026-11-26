import type { Format } from '../types'

export const tta: Format = {
  id: 'tta',
  name: 'TTA',
  category: 'audio',
  extensions: ['tta'],
  mime: ['audio/x-tta'],
  detect: ['tta'],
  explain:
    'TTA, the True Audio format, keeps every bit of the sound, like FLAC. It is rarely used now; converting it to FLAC or WAV keeps everything and opens everywhere.',
  lossy: 'never',
  traits: ['metadata'],
  readOnly: 'TTA can be read but not written: it is rarely used now, and FLAC or WavPack holds the same sound',
}
