import type { Format } from '../types'

export const pdf: Format = {
  id: 'pdf',
  name: 'PDF',
  category: 'pdf',
  extensions: ['pdf'],
  mime: ['application/pdf'],
  detect: ['pdf'],
  explain:
    'A PDF looks the same on every screen and every printer, which is why forms, reports and contracts are sent as one. It records where each letter sits on the page, and only sometimes what the letters are: a heading, a list, a table.',
  lossy: 'never',
  traits: [],
  readOnly: 'PDF can be read but not written yet',
}
