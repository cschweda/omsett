import type { Format } from '../types'

export const wav: Format = {
  id: 'wav',
  name: 'WAV',
  category: 'audio',
  extensions: ['wav', 'wave'],
  mime: ['audio/wav', 'audio/x-wav', 'audio/vnd.wave'],
  detect: ['wav'],
  explain:
    'WAV holds sound exactly as it was recorded, with nothing squeezed out, so its files are large. Every computer and every audio program reads it.',
  lossy: 'never',
  traits: ['metadata'],
}
