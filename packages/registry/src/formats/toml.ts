import type { Format } from '../types'

export const toml: Format = {
  id: 'toml',
  name: 'TOML',
  category: 'data',
  extensions: ['toml'],
  mime: ['application/toml'],
  detect: ['toml'],
  explain:
    'TOML is a settings format made to be easy to read: names, values, and sections in square brackets. Many programming tools keep their configuration in it.',
  lossy: 'never',
  traits: ['nesting', 'comments'],
}
