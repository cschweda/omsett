import type { Format } from '../types'

export const xls: Format = {
  id: 'xls',
  name: 'XLS',
  category: 'spreadsheet',
  extensions: ['xls', 'xlt'],
  mime: ['application/vnd.ms-excel'],
  detect: ['xls'],
  explain:
    'XLS is the Excel workbook as it was until 2007. Excel still opens it, but newer programs and websites often will not. Converting it to XLSX, or to CSV, makes it usable everywhere.',
  lossy: 'never',
  traits: [],
  readOnly: 'XLS can be read but not written: it is an old format, and XLSX has taken its place',
}
