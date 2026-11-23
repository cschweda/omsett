import type { Format } from '../types'

export const srt: Format = {
  id: 'srt',
  name: 'SRT',
  category: 'subtitle',
  extensions: ['srt'],
  mime: ['application/x-subrip'],
  detect: ['srt'],
  explain:
    'SRT (SubRip) is the most common subtitle file: numbered lines of text, each with the time it appears and the time it goes. Almost every video player reads it.',
  lossy: 'never',
  traits: ['styling'],
}
