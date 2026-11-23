import type { Format } from '../types'

export const md: Format = {
  id: 'md',
  name: 'Markdown',
  category: 'text',
  extensions: ['md', 'markdown', 'mdown'],
  mime: ['text/markdown'],
  detect: ['md'],
  explain:
    'Markdown is plain text with a few marks for structure: a # for a heading, asterisks for emphasis, a dash for a list. It is easy to write by hand, and many websites and content systems accept it.',
  lossy: 'never',
  traits: [],
}
