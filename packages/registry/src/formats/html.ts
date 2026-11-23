import type { Format } from '../types'

export const html: Format = {
  id: 'html',
  name: 'HTML',
  category: 'text',
  extensions: ['html', 'htm', 'xhtml'],
  mime: ['text/html'],
  detect: ['html'],
  explain:
    'HTML is the format web pages are written in. A browser opens it directly, and it can hold headings, links, pictures and tables.',
  lossy: 'never',
  traits: [],
}
