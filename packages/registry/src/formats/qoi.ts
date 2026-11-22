import type { Format } from '../types'

export const qoi: Format = {
  id: 'qoi',
  name: 'QOI',
  category: 'image',
  extensions: ['qoi'],
  mime: ['image/qoi'],
  detect: ['qoi'],
  explain:
    'QOI, the Quite OK Image format, stores a picture without loss, like PNG, but is far simpler and much faster to read and write. It is used in games and by programmers; ordinary software mostly does not open it.',
  lossy: 'never',
  traits: ['alpha', 'full-color'],
}
