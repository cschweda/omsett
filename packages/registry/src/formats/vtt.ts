import type { Format } from '../types'

export const vtt: Format = {
  id: 'vtt',
  name: 'WebVTT',
  category: 'subtitle',
  extensions: ['vtt'],
  mime: ['text/vtt'],
  detect: ['vtt'],
  explain:
    'WebVTT is the subtitle format of the web. It is what a video on a web page uses for its captions, and looks much like SRT with a few more options.',
  lossy: 'never',
  traits: ['styling'],
}
