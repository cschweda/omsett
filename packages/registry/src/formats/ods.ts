import type { Format } from '../types'

export const ods: Format = {
  id: 'ods',
  name: 'ODS',
  category: 'spreadsheet',
  extensions: ['ods', 'ots'],
  mime: ['application/vnd.oasis.opendocument.spreadsheet', 'application/vnd.oasis.opendocument.spreadsheet-template'],
  detect: ['ods', 'ots'],
  explain:
    'ODS is the OpenDocument spreadsheet: what LibreOffice and OpenOffice save. Converting it to XLSX, CSV or JSON makes it open in everything else, with numbers kept as numbers and dates as dates.',
  lossy: 'never',
  traits: [],
  readOnly: 'ODS can be read but not written yet',
}
