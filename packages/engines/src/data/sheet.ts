import { readZip, writeZip } from '../archive/zip'
import type { Entry } from '../archive/entries'
import { cellOf, MAX_TABLE_CELLS, Refusal, tableTooLarge, withinTags } from '../util'
import { text as escapeXml } from './xml'

// Excel workbooks (XLSX). A workbook is a ZIP of XML files: one lists the sheets, one holds the
// text that cells share, one says which cells are dates, and each sheet is a file of its own.
// Reading one gives the rows of its first sheet, the first row as the names of the columns.
//
// Nothing in a workbook is run. A formula is not worked out: the value it last showed is stored
// beside it, and that is what is read. Macros, links to other files and embedded objects are
// never opened.

type Cell = string | number | boolean | null
type Row = Record<string, Cell>
type Xml = Record<string, unknown>

/** The most XML in one part of a workbook that will be read. */
const MAX_PART_BYTES = 64 * 1024 * 1024
/** The limits of a sheet, which are Excel's own. */
const MAX_ROWS = 1_048_576
const MAX_COLUMNS = 16_384
const MAX_CELL_CHARACTERS = 32_767
/** More cells than this is not read in a browser tab. */
const MAX_CELLS = 5_000_000
/** The most sheets one workbook is read for. */
const MAX_SHEETS = 256

const invalid = () => new Refusal('This file is not a valid XLSX workbook')
const tooLarge = () => new Refusal('This workbook is too large to convert in a browser')

const list = <T>(value: T | T[] | undefined): T[] => (value === undefined ? [] : Array.isArray(value) ? value : [value])
const record = (value: unknown): Xml => (typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Xml) : {})

async function parser() {
  const { XMLParser } = await import('fast-xml-parser')
  return new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@',
    removeNSPrefix: true,
    // Every value stays text until it is known what kind of cell it came from.
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: false,
    ignoreDeclaration: true,
    ignorePiTags: true,
  })
}

/** "BC12" → column 54 (counting from 0). Null for anything that is not a cell's name. */
function columnOf(reference: string): number | null {
  const letters = /^([A-Z]{1,3})\d{1,7}$/.exec(reference)?.[1]
  if (!letters) return null
  let column = 0
  for (const letter of letters) column = column * 26 + (letter.codePointAt(0)! - 64)
  return column - 1
}

function columnName(index: number): string {
  let name = ''
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCodePoint(65 + ((n - 1) % 26)) + name
  return name
}

/** The words of a piece of text, which may be plain or in runs of differing style. */
function words(item: unknown): string {
  const node = record(item)
  const plain = (value: unknown) => (typeof value === 'string' ? value : typeof record(value)['#text'] === 'string' ? (record(value)['#text'] as string) : '')
  if (node.t !== undefined) return plain(node.t)
  // Runs are joined. A guide to pronunciation (<rPh>) is not part of the text.
  return list(node.r)
    .map((run) => plain(record(run).t))
    .join('')
}

/** Number formats that Excel defines itself and that show a date or a time. */
const BUILT_IN_DATES = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58])

/** Whether a format someone wrote shows a date: it has a day, month, year, hour or second in it. */
function isDateFormat(code: string): boolean {
  // What is in quotes or square brackets is literal text or a colour, not part of the pattern.
  const pattern = code.replace(/"[^"]*"|\[[^\]]*\]|\\./g, '')
  return /[dmyhs]/i.test(pattern) && !/^general$/i.test(pattern.trim())
}

/** Excel counts days from the end of 1899, and wrongly believes 1900 was a leap year. */
function dateOf(serial: number, from1904: boolean): string | null {
  if (!Number.isFinite(serial) || serial < 0 || serial > 2_958_465) return null
  const days = from1904 ? serial + 1462 : serial
  // Day 60 is 29 February 1900, which never happened; days after it are one too many.
  const adjusted = !from1904 && days < 60 ? days + 1 : days
  const moment = new Date(Math.round((adjusted - 25_569) * 86_400_000))
  if (Number.isNaN(moment.getTime())) return null
  const iso = moment.toISOString()
  return Number.isInteger(serial) ? iso.slice(0, 10) : iso.slice(0, 19)
}

/** A workbook opened: the sheets a person would see, in order, each read when it is asked for. */
interface Opened {
  /** Sheets that are not hidden, by the name on their tab. */
  shown: Array<{ name: string; path: string }>
  rows(path: string): Row[]
}

/**
 * @param bytes the workbook
 * @param named whether the first row holds the names of the columns. Where it does not, every
 *              row is data and the columns are called column_A, column_B and so on.
 */
async function openWorkbook(bytes: Uint8Array, named: boolean): Promise<Opened> {
  let entries: Entry[]
  try {
    entries = await readZip(bytes)
  } catch (error) {
    // A workbook that is a bomb is refused as one, in words about workbooks.
    if (error instanceof Refusal && /more than Omsett will handle/.test(error.message)) throw tooLarge()
    if (error instanceof Refusal && /password/.test(error.message)) throw error
    throw invalid()
  }
  const parts = new Map(entries.filter((entry) => !entry.directory).map((entry) => [entry.name.toLowerCase(), entry.data]))
  const xml = await parser()
  const open = (path: string): Xml | null => {
    const data = parts.get(path.toLowerCase())
    if (!data) return null
    if (data.length > MAX_PART_BYTES) throw tooLarge()
    const source = new TextDecoder('utf-8').decode(data)
    // A workbook's XML never declares a document type. One that does is defining shorthand of
    // its own, which is how a small file is made to expand into a vast one.
    if (/<!DOCTYPE/i.test(source.slice(0, 4096))) throw invalid()
    // Counted before it is read: empty rows and cells cost as much to read as full ones.
    if (!withinTags(source)) throw tooLarge()
    return record(xml.parse(source))
  }

  const workbook = record(open('xl/workbook.xml')?.workbook)
  const sheets = list(record(workbook.sheets).sheet).map(record)
  if (sheets.length === 0) throw invalid()
  const from1904 = ['1', 'true'].includes(String(record(workbook.workbookPr)['@date1904'] ?? ''))

  // Each sheet is named by an id, and another file says which file that id is.
  const links = new Map(
    list(record(open('xl/_rels/workbook.xml.rels')?.Relationships).Relationship)
      .map(record)
      .map((link) => [String(link['@Id']), String(link['@Target'])]),
  )
  const shared = list(record(open('xl/sharedStrings.xml')?.sst).si).map(words)

  // Which cell styles show their number as a date.
  const styles = record(open('xl/styles.xml')?.styleSheet)
  const custom = new Map(
    list(record(styles.numFmts).numFmt)
      .map(record)
      .map((format) => [Number(format['@numFmtId']), String(format['@formatCode'] ?? '')]),
  )
  const dated = list(record(styles.cellXfs).xf)
    .map(record)
    .map((style) => {
      const id = Number(style['@numFmtId'] ?? 0)
      return custom.has(id) ? isDateFormat(custom.get(id)!) : BUILT_IN_DATES.has(id)
    })

  // The sheets that are not hidden. A sheet is listed once: a list that names one sheet ten
  // thousand times is asking for it to be read ten thousand times.
  const looked = new Set<string>()
  const shown: Opened['shown'] = []
  for (const sheet of sheets) {
    if (['hidden', 'veryHidden'].includes(String(sheet['@state'] ?? ''))) continue
    const target = links.get(String(sheet['@id'] ?? ''))
    if (!target) continue
    // A target is a path inside the workbook, from its xl folder or from its top.
    const path = target.startsWith('/') ? target.slice(1) : `xl/${target}`
    if (path.includes('..')) throw invalid()
    if (looked.has(path.toLowerCase())) continue
    looked.add(path.toLowerCase())
    shown.push({ name: String(sheet['@name'] ?? `Sheet ${shown.length + 1}`).slice(0, 64), path })
    if (shown.length > MAX_SHEETS) throw tooLarge()
  }
  return { shown, rows: (path) => tableOf(record(open(path)?.worksheet), shared, dated, from1904, named) }
}

const noRows = () => new Refusal('This workbook has no rows in it')

/** The first sheet that is not hidden and has something in it, as rows. */
export async function readWorkbook(bytes: Uint8Array, named = true): Promise<Row[]> {
  const book = await openWorkbook(bytes, named)
  for (const sheet of book.shown) {
    const rows = book.rows(sheet.path)
    if (rows.length > 0) return rows
  }
  throw noRows()
}

export interface NamedSheet {
  name: string
  rows: Row[]
}

/**
 * Sheets by choice: every sheet that is shown and has something in it, or the one at a
 * position among the sheets shown, counted from 1 as the tabs are.
 */
export async function readSheets(bytes: Uint8Array, named: boolean, which: 'all' | number): Promise<NamedSheet[]> {
  const book = await openWorkbook(bytes, named)
  if (which !== 'all') {
    const sheet = Number.isInteger(which) ? book.shown[which - 1] : undefined
    if (!sheet) throw new Refusal('This workbook has no such sheet')
    const rows = book.rows(sheet.path)
    if (rows.length === 0) throw new Refusal(`The sheet “${sheet.name}” has no rows in it`)
    return [{ name: sheet.name, rows }]
  }
  const read = book.shown.map((sheet) => ({ name: sheet.name, rows: book.rows(sheet.path) })).filter((sheet) => sheet.rows.length > 0)
  if (read.length === 0) throw noRows()
  return read
}

/** The names of the sheets a person would see, in order. Never throws: a file that is not a workbook has none. */
export async function listSheets(bytes: Uint8Array): Promise<string[]> {
  try {
    return (await openWorkbook(bytes, true)).shown.map((sheet) => sheet.name)
  } catch {
    return []
  }
}

function tableOf(worksheet: Xml, shared: string[], dated: boolean[], from1904: boolean, named: boolean): Row[] {
  const grid: Cell[][] = []
  // Counted as the room the cells take, not as how many there are: one cell in the last
  // column of a row makes that row sixteen thousand cells wide.
  let cells = 0
  for (const row of list(record(worksheet.sheetData).row).map(record)) {
    const line: Cell[] = []
    let next = 0
    for (const cell of list(row.c).map(record)) {
      // A cell says where it is ("C7"); one that does not is the one after the last.
      const column = typeof cell['@r'] === 'string' ? columnOf(cell['@r']) : next
      if (column === null || column >= MAX_COLUMNS) throw invalid()
      next = column + 1
      const value = valueOf(cell, shared, dated, from1904)
      if (value !== null) line[column] = value
    }
    if (line.length === 0) continue
    cells += line.length
    if (cells > MAX_CELLS || grid.length >= MAX_ROWS) throw tooLarge()
    grid.push(Array.from(line, (value) => value ?? null))
  }
  if (grid.length === 0) return []

  // The first row names the columns. A name used twice, or missing, is given one of its own.
  const width = grid.reduce((most, line) => Math.max(most, line.length), 0)
  // Every row is given every column, so the table is as wide as its widest row all the way down.
  if (width * grid.length > MAX_CELLS) throw tooLarge()
  const taken = new Set<string>()
  // Where the count for each repeated name has got to, so that a row of one name sixteen
  // thousand times is not counted through from the start for every column.
  const reached = new Map<string, number>()
  const names = Array.from({ length: width }, (_, i) => {
    const stated = named ? grid[0]![i] : null
    const base = stated === null || stated === undefined || String(stated).trim() === '' ? `column_${columnName(i)}` : String(stated).trim()
    let name = base
    let n = reached.get(base) ?? 1
    while (taken.has(name)) name = `${base}_${++n}`
    reached.set(base, n)
    taken.add(name)
    return name
  })
  // Object.fromEntries, so that a column called "__proto__" is a column and nothing else.
  return grid.slice(named ? 1 : 0).map((line) => Object.fromEntries(names.map((name, i) => [name, line[i] ?? null])))
}

function valueOf(cell: Xml, shared: string[], dated: boolean[], from1904: boolean): Cell {
  const kind = String(cell['@t'] ?? 'n')
  const stored = typeof cell.v === 'string' ? cell.v : typeof record(cell.v)['#text'] === 'string' ? String(record(cell.v)['#text']) : null
  if (kind === 'inlineStr') return words(cell.is)
  if (stored === null) return null
  if (kind === 's') return shared[Number(stored)] ?? ''
  if (kind === 'b') return stored === '1'
  // The result of a formula that is text, an error such as #DIV/0!, or a date written out.
  if (kind === 'str' || kind === 'e' || kind === 'd') return stored
  const number = Number(stored)
  if (!Number.isFinite(number)) return stored
  if (dated[Number(cell['@s'] ?? 0)]) return dateOf(number, from1904) ?? number
  return number
}

// --- Writing -----------------------------------------------------------------------------------

const part = (name: string, body: string): Entry => ({
  name,
  data: new TextEncoder().encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${body}`),
  directory: false,
  modified: null,
  executable: false,
})

const TYPES =
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
  '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
  '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
  '</Types>'
const RELS =
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
  '</Relationships>'
const WORKBOOK =
  '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
  '<sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>'
const WORKBOOK_RELS =
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
  '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
  '</Relationships>'
// One plain style, and one in bold for the row of column names.
const STYLES =
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
  '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>' +
  '</styleSheet>'

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

export async function writeWorkbook(values: unknown[]): Promise<Uint8Array> {
  const rows = values.map((value) => (isRecord(value) ? value : { value }))
  const columns: string[] = []
  const known = new Set<string>()
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!known.has(key)) {
        known.add(key)
        columns.push(key)
      }
    }
  }
  if (columns.length === 0) throw new Refusal('There is nothing here to put in a table')
  if (columns.length > MAX_COLUMNS || rows.length + 1 > MAX_ROWS) {
    throw new Refusal('This is more than one sheet can hold: 1,048,576 rows and 16,384 columns')
  }
  if (columns.length * rows.length > MAX_TABLE_CELLS) throw tableTooLarge()

  // Text is always written as text. A cell that reads "=1+1" is those four characters, and no
  // spreadsheet will work it out.
  const words = (at: string, value: string, style = '') => {
    if ([...value].length > MAX_CELL_CHARACTERS) throw new Refusal('A value here is longer than a spreadsheet cell can hold (32,767 characters)')
    return `<c r="${at}"${style} t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`
  }
  const cell = (at: string, value: unknown): string => {
    if (value === null || value === undefined) return ''
    if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${at}"><v>${value}</v></c>`
    if (typeof value === 'boolean') return `<c r="${at}" t="b"><v>${value ? 1 : 0}</v></c>`
    // Lists and groups have no cell of their own to live in, and are written out as text.
    return words(at, typeof value === 'string' ? value : JSON.stringify(value))
  }
  const lines = [`<row r="1">${columns.map((name, i) => words(`${columnName(i)}1`, name, ' s="1"')).join('')}</row>`]
  rows.forEach((row, r) => {
    lines.push(`<row r="${r + 2}">${columns.map((name, i) => cell(`${columnName(i)}${r + 2}`, cellOf(row, name))).join('')}</row>`)
  })
  const sheet = `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${lines.join('')}</sheetData></worksheet>`

  return writeZip([
    part('[Content_Types].xml', TYPES),
    part('_rels/.rels', RELS),
    part('xl/workbook.xml', WORKBOOK),
    part('xl/_rels/workbook.xml.rels', WORKBOOK_RELS),
    part('xl/styles.xml', STYLES),
    part('xl/worksheets/sheet1.xml', sheet),
  ])
}
