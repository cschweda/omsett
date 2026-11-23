import type { Format } from '../types'

export const xlsx: Format = {
  id: 'xlsx',
  name: 'XLSX',
  category: 'spreadsheet',
  extensions: ['xlsx'],
  mime: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  detect: ['xlsx'],
  explain:
    'XLSX is the Excel workbook. Excel, Numbers, Google Sheets and LibreOffice all open and save it, and it keeps numbers as numbers and dates as dates.',
  lossy: 'never',
  traits: [],
}
