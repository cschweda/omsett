import type { Format } from '../types'

export const ass: Format = {
  id: 'ass',
  name: 'ASS',
  category: 'subtitle',
  extensions: ['ass'],
  mime: ['text/x-ass'],
  detect: ['ass'],
  explain:
    'ASS (Advanced SubStation Alpha) is a subtitle format that can also say how the text looks and where it sits on screen. It is the usual choice for styled and animated subtitles.',
  lossy: 'never',
  traits: ['styling'],
}
