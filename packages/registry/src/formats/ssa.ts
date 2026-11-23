import type { Format } from '../types'

export const ssa: Format = {
  id: 'ssa',
  name: 'SSA',
  category: 'subtitle',
  extensions: ['ssa'],
  mime: ['text/x-ssa'],
  detect: ['ssa'],
  explain:
    'SSA (SubStation Alpha) is the older form of ASS: subtitles with fonts, colours and positions. Some players and older files still use it.',
  lossy: 'never',
  traits: ['styling'],
}
