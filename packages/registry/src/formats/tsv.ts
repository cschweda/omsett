import type { Format } from '../types'

export const tsv: Format = {
  id: 'tsv',
  name: 'TSV',
  category: 'data',
  extensions: ['tsv', 'tab'],
  mime: ['text/tab-separated-values'],
  detect: ['tsv'],
  explain:
    'TSV is a table as plain text, like CSV, with a tab between the columns instead of a comma. It is what you get when you copy cells out of a spreadsheet.',
  lossy: 'never',
  traits: [],
}
