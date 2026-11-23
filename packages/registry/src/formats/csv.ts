import type { Format } from '../types'

export const csv: Format = {
  id: 'csv',
  name: 'CSV',
  category: 'data',
  extensions: ['csv'],
  mime: ['text/csv'],
  detect: ['csv'],
  explain:
    'CSV is a table as plain text: one row per line, with commas between the columns. Every spreadsheet program opens it, which makes it the usual way to move a table from one program to another.',
  lossy: 'never',
  traits: [],
}
