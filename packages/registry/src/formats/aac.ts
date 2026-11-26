import type { Format } from '../types'

export const aac: Format = {
  id: 'aac',
  name: 'AAC',
  category: 'audio',
  extensions: ['aac', 'adts'],
  mime: ['audio/aac', 'audio/aacp'],
  detect: ['aac'],
  explain:
    'AAC on its own, outside an M4A: the sound of many radio streams and some recorders. It leaves out sound to stay small. Converting it to WAV, FLAC or MP3 makes it open everywhere.',
  lossy: 'always',
  traits: ['metadata'],
  readOnly: 'AAC can be read but not written: its encoders are covered by patents, so Omsett does not ship one. M4A is written as Apple Lossless instead',
}
