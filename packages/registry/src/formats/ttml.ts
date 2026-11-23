import type { Format } from '../types'

export const ttml: Format = {
  id: 'ttml',
  name: 'TTML',
  category: 'subtitle',
  extensions: ['ttml', 'dfxp'],
  mime: ['application/ttml+xml'],
  detect: ['ttml'],
  explain:
    'TTML (Timed Text) is the subtitle format broadcasters and streaming services exchange. It is written as XML and can carry detailed styling.',
  lossy: 'never',
  traits: ['styling'],
}
