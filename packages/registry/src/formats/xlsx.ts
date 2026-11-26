import type { Format } from '../types'

export const xlsx: Format = {
  id: 'xlsx',
  name: 'XLSX',
  category: 'spreadsheet',
  // Saved with macros (XLSM) or as a template (XLTX, XLTM): the same package under another
  // label, read as an XLSX. Macros never run, and formulas are never worked out.
  extensions: ['xlsx', 'xlsm', 'xltx', 'xltm'],
  mime: [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel.sheet.macroEnabled.12',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.template',
    'application/vnd.ms-excel.template.macroEnabled.12',
  ],
  detect: ['xlsx', 'xlsm', 'xltx', 'xltm'],
  explain:
    'XLSX is the Excel workbook. Excel, Numbers, Google Sheets and LibreOffice all open and save it, and it keeps numbers as numbers and dates as dates. A workbook saved with macros (XLSM) or as a template (XLTX, XLTM) is read the same way; its macros are never run and never carried over.',
  lossy: 'never',
  traits: [],
}
