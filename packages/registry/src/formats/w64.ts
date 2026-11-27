import type { Format } from '../types'

export const w64: Format = {
  id: 'w64',
  name: 'Wave64',
  category: 'audio',
  extensions: ['w64'],
  mime: ['audio/x-w64'],
  detect: ['w64'],
  explain:
    'Wave64 is WAV made by Sony for recordings too long for a WAV, past four gigabytes: the same sound, kept exactly, with room for longer lengths. Sound editors such as Sound Forge, Audacity and Reaper read it.',
  lossy: 'never',
  traits: ['metadata'],
}
