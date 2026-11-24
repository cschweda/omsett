import type { Format } from '../types'

export const aiff: Format = {
  id: 'aiff',
  name: 'AIFF',
  category: 'audio',
  extensions: ['aiff', 'aif', 'aifc'],
  mime: ['audio/aiff', 'audio/x-aiff'],
  detect: ['aif'],
  explain:
    'AIFF is Apple’s counterpart to WAV: sound held exactly, with nothing squeezed out, in large files. Mac software and most audio programs read it.',
  lossy: 'never',
  traits: ['metadata'],
}
