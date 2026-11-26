import { readZip } from '../archive/zip'
import type { Entry } from '../archive/entries'
import { attrs, kids, resolve, tagOf, type Node } from '../markup/docx-read'
import { ODF } from '../markup/odt-read'
import { Refusal, withinTags } from '../util'
import { rowsFrom, tooLarge, type Cell, type Opened } from './sheet'

// OpenDocument spreadsheets (ODS): what LibreOffice and OpenOffice save. A ZIP of XML, opened
// into the same `Opened` an XLSX and an XLS are, so sheets, limits, dates and the column names
// are one piece of code. Read with the archive's limits, with any part that declares a
// DOCTYPE refused, and with names resolved by namespace as an ODT's are, so that a part of
// another vocabulary is never taken for one of OpenDocument's.
//
// A cell gives its value as a number, a date, a time, a truth or text, beside the text it
// shows. Formulas are never worked out: the value a formula last showed is the value. Comments
// on a cell are left out. A sheet hidden by its style is not shown, as an XLSX's hidden sheets
// are not.

export const notOds = () => new Refusal('This file is not a valid ODS spreadsheet')
const TYPES = new Set(['application/vnd.oasis.opendocument.spreadsheet', 'application/vnd.oasis.opendocument.spreadsheet-template'])
const MAX_PART_BYTES = 64 * 1024 * 1024
const MAX_ROWS = 1_048_576
const MAX_COLUMNS = 16_384
const MAX_CELLS = 5_000_000
const MAX_SHEETS = 256
const MAX_DEPTH = 64
/** The most letters one cell's text may hold. */
const MAX_TEXT = 1_000_000

/** Whether a ZIP's parts are an OpenDocument spreadsheet's. */
export const isOds = (parts: Map<string, Uint8Array>): boolean => TYPES.has(new TextDecoder().decode(parts.get('mimetype') ?? new Uint8Array()).trim())

/**
 * Whether a file says, in its first bytes, that it is an OpenDocument spreadsheet: its first
 * part is named "mimetype", stored as it is, and holds the spreadsheet's type. Enough to say
 * which reader opens it, so that a damaged one is refused as what it is.
 */
export function looksLikeOds(bytes: Uint8Array): boolean {
  if (bytes.length < 38 || bytes[0] !== 0x50 || bytes[1] !== 0x4B || bytes[2] !== 3 || bytes[3] !== 4) return false
  const name = new TextDecoder().decode(bytes.subarray(30, 38))
  const type = new TextDecoder().decode(bytes.subarray(38, 38 + 64))
  return name === 'mimetype' && type.startsWith('application/vnd.oasis.opendocument.spreadsheet')
}

export async function openOds(bytes: Uint8Array, named: boolean): Promise<Opened> {
  let entries: Entry[]
  try {
    entries = await readZip(bytes)
  } catch (error) {
    if (error instanceof Refusal && /more than Omsett will handle/.test(error.message)) throw tooLarge()
    if (error instanceof Refusal && /password/.test(error.message)) throw error
    throw notOds()
  }
  const parts = new Map(entries.filter((entry) => !entry.directory).map((entry) => [entry.name.toLowerCase(), entry.data]))
  if (!isOds(parts)) throw notOds()
  const manifest = new TextDecoder().decode(parts.get('meta-inf/manifest.xml') ?? new Uint8Array())
  if (/encryption-data/.test(manifest)) throw new Refusal('This workbook is locked with a password, and cannot be read without it')

  const { XMLParser } = await import('fast-xml-parser')
  const parse = (name: string): Node[] => {
    const data = parts.get(name)
    if (!data) return []
    if (data.length > MAX_PART_BYTES) throw tooLarge()
    const source = new TextDecoder('utf-8').decode(data)
    if (/<!DOCTYPE/i.test(source)) throw notOds()
    if (!withinTags(source)) throw tooLarge()
    let tree: Node[]
    try {
      tree = new XMLParser({
      preserveOrder: true,
      ignoreAttributes: false,
      attributeNamePrefix: '@',
      removeNSPrefix: false,
      parseTagValue: false,
      parseAttributeValue: false,
      trimValues: false,
      ignoreDeclaration: true,
      ignorePiTags: true,
      }).parse(source) as Node[]
    } catch {
      throw notOds()
    }
    resolve(tree, ODF)
    return tree
  }
  if (!parts.has('content.xml')) throw notOds()
  const find = (node: Node | undefined, tag: string) => kids(node ?? {}).find((kid) => tagOf(kid) === tag)
  const content = parse('content.xml').find((node) => tagOf(node) === 'document-content')
  const styled = parse('styles.xml').find((node) => tagOf(node) === 'document-styles')
  const sheet = find(find(content, 'body'), 'spreadsheet')
  if (!sheet) throw notOds()

  // Which table styles hide the sheets they are given: by saying so in any part of themselves,
  // or by taking it from the style they are based on, wherever that style is kept. The
  // document's own styles take the place of named ones of the same name.
  const tableStyles = new Map<string, { parent?: string; hidden?: boolean }>()
  for (const holder of [find(styled, 'styles'), find(styled, 'automatic-styles'), find(content, 'automatic-styles')]) {
    for (const style of kids(holder ?? {})) {
      if (tagOf(style) !== 'style' || attrs(style)['@family'] !== 'table' || !attrs(style)['@name']) continue
      const said = kids(style).filter((part) => tagOf(part) === 'table-properties').map((part) => attrs(part)['@display'])
      tableStyles.set(attrs(style)['@name']!, { parent: attrs(style)['@parent-style-name'], hidden: said.includes('false') ? true : said.includes('true') ? false : undefined })
    }
  }
  const hidden = (name: string | undefined): boolean => {
    const seen = new Set<string>()
    for (let at = name; at !== undefined && !seen.has(at) && seen.size < MAX_DEPTH; ) {
      seen.add(at)
      const style = tableStyles.get(at)
      if (!style) return false
      if (style.hidden !== undefined) return style.hidden
      at = style.parent
    }
    return false
  }

  const tables = kids(sheet).filter((node) => tagOf(node) === 'table')
  if (tables.length > MAX_SHEETS * 4) throw tooLarge()
  const shown: Opened['shown'] = []
  for (const [index, table] of tables.entries()) {
    if (hidden(attrs(table)['@style-name'])) continue
    shown.push({ name: (attrs(table)['@name'] ?? `Sheet ${shown.length + 1}`).slice(0, 64), path: String(index) })
    if (shown.length > MAX_SHEETS) throw tooLarge()
  }
  if (tables.length === 0) throw notOds()
  return { shown, rows: (path) => rowsFrom(gridOf(tables[Number(path)]!), named) }
}

/** How many times a row or cell is repeated: a whole number, or the file is not what it says. */
function times(stated: string | undefined): number {
  if (stated === undefined) return 1
  if (!/^[1-9]\d{0,9}$/.test(stated)) throw notOds()
  return Number(stated)
}

/** A sheet's cells, row by row. Rows and cells that repeat are written out, within the limits; empty ones are not. */
function gridOf(table: Node): Cell[][] {
  const grid: Cell[][] = []
  let cells = 0
  const rows: Node[] = []
  // Rows may be gathered in groups, and a group of rows that heads the sheet.
  const gather = (group: Node, depth: number) => {
    if (depth > MAX_DEPTH) throw notOds()
    for (const part of kids(group)) {
      const tag = tagOf(part)
      if (tag === 'table-row') rows.push(part)
      else if (['table-rows', 'table-header-rows', 'table-row-group'].includes(tag)) gather(part, depth + 1)
    }
  }
  gather(table, 0)
  for (const row of rows) {
    const line: Cell[] = []
    let column = 0
    for (const cell of kids(row)) {
      const tag = tagOf(cell)
      if (tag !== 'table-cell' && tag !== 'covered-table-cell') continue
      const repeat = times(attrs(cell)['@number-columns-repeated'])
      const value = tag === 'table-cell' ? valueOf(cell) : null
      if (value !== null) {
        if (column + repeat > MAX_COLUMNS) throw tooLarge()
        for (let i = 0; i < repeat; i++) line[column + i] = value
      }
      // An empty cell repeated to the edge of the sheet is how a sheet ends, and costs nothing.
      column += repeat
    }
    if (line.length === 0) continue
    const many = times(attrs(row)['@number-rows-repeated'])
    // Counted as the room the cells take, as an XLSX's are.
    if (many > MAX_ROWS || grid.length + many > MAX_ROWS) throw tooLarge()
    cells += line.length * many
    if (cells > MAX_CELLS) throw tooLarge()
    const filled = Array.from(line, (value) => value ?? null)
    for (let i = 0; i < many; i++) grid.push(i === 0 ? filled : [...filled])
  }
  return grid
}

/** What a cell holds: its value where it gives one, or the text it shows. */
function valueOf(cell: Node): Cell {
  const a = attrs(cell)
  const type = a['@value-type']
  // A formula that failed is stored as a number it does not mean; LibreOffice's own mark says so,
  // and the error it shows ("#DIV/0!") is the value, as an XLSX gives it.
  if (a['@foreign:value-type'] === 'error') return textOf(cell) || null
  if (type === 'float' || type === 'percentage' || type === 'currency') {
    const number = Number(a['@value'])
    if (a['@value'] !== undefined && Number.isFinite(number)) return number
  } else if (type === 'string' && a['@string-value'] !== undefined) {
    // A formula's text result is kept here, and is the value, as a number's is.
    return a['@string-value'] === '' ? null : a['@string-value'].slice(0, MAX_TEXT)
  } else if (type === 'boolean') {
    if (a['@boolean-value'] !== undefined) return a['@boolean-value'] === 'true'
  } else if (type === 'date') {
    // "2026-11-23" or "2026-11-23T14:30:00.5": a day, or a moment to the second. Midnight is the day.
    const found = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}:\d{2}))?/.exec(a['@date-value'] ?? '')
    if (found) return found[2] && found[2] !== '00:00:00' ? `${found[1]}T${found[2]}` : found[1]!
  } else if (type === 'time') {
    // "PT14H30M00S": a time of day, written as one.
    const found = /^(-?)PT(\d{1,4})H(\d{1,2})M(\d{1,2})(?:[.,]\d+)?S$/.exec(a['@time-value'] ?? '')
    if (found) return `${found[1]}${found[2]!.padStart(2, '0')}:${found[3]!.padStart(2, '0')}:${found[4]!.padStart(2, '0')}`
  }
  const text = textOf(cell)
  return text === '' ? null : text
}

/**
 * The text a cell shows: its paragraphs, one to a line. Comments on the cell are not its text.
 * Spaces in the file are one space, across the parts of a paragraph as within them, and none at
 * a paragraph's start or end; a space marked as one (`text:s`) is kept as it is.
 */
function textOf(cell: Node): string {
  const lines: string[] = []
  let length = 0
  for (const part of kids(cell)) {
    if (tagOf(part) !== 'p' && tagOf(part) !== 'h') continue
    let out = ''
    // Whether the last thing written was a space that collapses, or nothing yet has been.
    let loose = true
    const add = (more: string) => {
      out += more
      if (out.length > MAX_TEXT) throw tooLarge()
    }
    const words = (nodes: Node[], depth: number): void => {
      if (depth > MAX_DEPTH) throw notOds()
      for (const node of nodes) {
        const tag = tagOf(node)
        if (tag === '#text') {
          for (const letter of String(node['#text']).replace(/[ \t\r\n]+/g, ' ')) {
            if (letter === ' ' && loose) continue
            add(letter)
            loose = letter === ' '
          }
        } else if (tag === 's') {
          add(' '.repeat(Math.min(100, Math.max(1, Number(attrs(node)['@c']) || 1))))
          loose = false
        } else if (tag === 'tab' || tag === 'line-break') {
          add(tag === 'tab' ? '\t' : '\n')
          loose = false
        }
        // A comment, a note and the guide to how a word is said are not the cell's text.
        else if (tag === 'annotation' || tag === 'note' || tag === 'ruby-text' || tag.startsWith('foreign:')) continue
        else if (['none', 'condition'].includes(attrs(node)['@display'] ?? '')) continue
        else words(kids(node), depth + 1)
      }
    }
    words(kids(part), 0)
    if (loose && out.endsWith(' ')) out = out.slice(0, -1)
    length += out.length
    if (length > MAX_TEXT) throw tooLarge()
    lines.push(out)
  }
  return lines.join('\n').trim()
}
