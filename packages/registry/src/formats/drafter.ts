import type { Format } from '../types'

export const drafter: Format = {
  id: 'drafter',
  name: 'Drafter',
  category: 'screenplay',
  extensions: ['drafter'],
  mime: ['application/vnd.drafter.package+zip'],
  detect: ['drafter'],
  explain:
    "A Drafter package is one file that holds a whole writing project: the script as plain Fountain, with its drafts and notes beside it. It is an open format, and unzips to ordinary files.",
  lossy: 'never',
  traits: [],
}
