import { cellOf, MAX_TABLE_CELLS, Refusal, tableTooLarge } from '../util'

// Tables as text: CSV and TSV. Written here, not taken from a library, because the format is
// small and the choices in it (what a number is, what happens to a ragged row) are Omsett's.

/** A cell that is plainly a number, written the one way a number is written. "007" is not. */
const NUMBER = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/

function typed(cell: string): string | number {
  if (!NUMBER.test(cell)) return cell
  const value = Number(cell)
  // Only when nothing is lost by it: "1.50" and digits past what a number holds stay text.
  return String(value) === cell ? value : cell
}

/** Which of comma and semicolon separates the columns: whichever the first line has more of. */
function delimiterOf(text: string): string {
  let commas = 0
  let semicolons = 0
  let quoted = false
  for (const char of text) {
    if (char === '"') quoted = !quoted
    else if (!quoted && char === ',') commas++
    else if (!quoted && char === ';') semicolons++
    else if (!quoted && (char === '\n' || char === '\r')) break
  }
  return semicolons > commas ? ';' : ','
}

/** Text → rows of cells. Quotes may hold the delimiter, line breaks, and doubled quotes. */
function cells(text: string, delimiter: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  let wasQuoted = false
  const endCell = () => {
    row.push(cell)
    cell = ''
    wasQuoted = false
  }
  const endRow = () => {
    endCell()
    // A line with nothing on it is not a row.
    if (row.length > 1 || row[0] !== '') rows.push(row)
    row = []
  }
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!
    if (quoted) {
      if (char !== '"') cell += char
      else if (text[i + 1] === '"') {
        cell += '"'
        i++
      } else quoted = false
    } else if (char === '"' && cell === '' && !wasQuoted) {
      quoted = true
      wasQuoted = true
    } else if (char === delimiter) endCell()
    else if (char === '\n') endRow()
    else if (char === '\r') {
      if (text[i + 1] === '\n') i++
      endRow()
    } else cell += char
  }
  if (quoted) throw new Refusal('A quoted value in this table is never closed')
  if (cell !== '' || row.length > 0) endRow()
  return rows
}

/** A table, first row as column names → a list of records. */
/**
 * @param text  the whole file
 * @param tab   whether tabs separate the columns, as in TSV
 * @param named whether the first row holds the names of the columns. Where it does not, every
 *              row is data and the columns are called column_1, column_2 and so on.
 */
export function readTable(text: string, tab: boolean, named = true): unknown {
  const rows = cells(text, tab ? '\t' : delimiterOf(text))
  const header = named ? rows.shift() : rows[0]?.map(() => '')
  if (!header) throw new Refusal('This table is empty')
  const seen = new Set<string>()
  const names = header.map((raw, index) => {
    let name = raw.trim() || `column_${index + 1}`
    // Two columns with one name would lose one of them. The later one is numbered.
    while (seen.has(name)) name = `${name}_${index + 1}`
    seen.add(name)
    return name
  })
  return rows.map((row) =>
    Object.fromEntries(row.map((cell, index) => [names[index] ?? `column_${index + 1}`, typed(cell)])),
  )
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * The rows in a value. A list is its own rows. So is a list that is the only thing inside one
 * or more wrappers, which is how XML and TOML hold one. Anything else is a single row.
 */
export function rowsOf(value: unknown): unknown[] {
  let inner = value
  while (isRecord(inner)) {
    const keys = Object.keys(inner)
    if (keys.length !== 1) break
    inner = inner[keys[0]!]
  }
  return Array.isArray(inner) ? inner : [value]
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}

/** A value → a table, with a header row naming every column any row has. */
export function writeTable(value: unknown, tab: boolean): string {
  const delimiter = tab ? '\t' : ','
  const rows = rowsOf(value).map((row) => (isRecord(row) ? row : { value: row }))
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
  if (columns.length * rows.length > MAX_TABLE_CELLS) throw tableTooLarge()
  const needsQuotes = new RegExp(`["\\r\\n${tab ? '\\t' : ','}]|^\\s|\\s$`)
  const quote = (text: string) => (needsQuotes.test(text) ? `"${text.replaceAll('"', '""')}"` : text)
  const lines = [columns.map(quote).join(delimiter)]
  for (const row of rows) lines.push(columns.map((column) => quote(cellText(cellOf(row, column)))).join(delimiter))
  return `${lines.join('\r\n')}\r\n`
}

/** The most cells set out as a page. A page is for reading; past this, a table is for a program. */
const MAX_PAGE_CELLS = 250_000

const escaped = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')

/**
 * Tables as a web page: each a real table, its first row marked as the names of its columns,
 * under a heading where there is more than one. Every cell is written as text, escaped; nothing
 * in a file is ever written as markup.
 */
export function writeTablePage(tables: Array<{ name: string | null; value: unknown }>, title: string, language: string): string {
  let cells = 0
  const body: string[] = []
  for (const { name, value } of tables) {
    const rows = rowsOf(value).map((row) => (isRecord(row) ? row : { value: row }))
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
    if (columns.length === 0) continue
    cells += columns.length * (rows.length + 1)
    if (cells > MAX_PAGE_CELLS) throw new Refusal('This table is too large to set out as a page. Choose CSV or XLSX, which hold a table of any size')
    if (name !== null) body.push(`<h2>${escaped(name)}</h2>`)
    body.push(
      '<table>',
      `<thead><tr>${columns.map((column) => `<th scope="col">${escaped(column)}</th>`).join('')}</tr></thead>`,
      '<tbody>',
      ...rows.map((row) => `<tr>${columns.map((column) => `<td>${escaped(cellText(cellOf(row, column)))}</td>`).join('')}</tr>`),
      '</tbody>',
      '</table>',
    )
  }
  if (body.length === 0) throw new Refusal('There is nothing here to put in a table')
  const tongue = /^[a-z]{2,3}(?:-[a-z0-9]{2,8}){0,3}$/i.test(language) ? language : 'en'
  return `<!doctype html>\n<html lang="${escaped(tongue)}">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>${escaped(title)}</title>\n</head>\n<body>\n<h1>${escaped(title)}</h1>\n${body.join('\n')}\n</body>\n</html>\n`
}
