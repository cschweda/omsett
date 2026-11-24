import { readCfb, type Cfb } from '@omsett/detect'
import { Refusal } from '../util'
import { BUILT_IN_DATES, dateOf, isDateFormat, MAX_CELLS, MAX_SHEETS, rowsFrom, tooLarge, type Cell, type Opened } from './sheet'

// Excel workbooks from before 2007 (XLS). The file is a small filing system (see cfb.ts in
// packages/detect), and the workbook is one stream in it: a long row of records, each a number
// saying what it is, a length, and that many bytes. A few dozen kinds of record hold everything
// read here: the names of the sheets, the text cells share, which cells are dates, and the cells.
//
// As with the newer format, nothing is run. A formula is not worked out: the value it last
// showed is stored with it, and that is what is read. Macros are never opened.

const invalid = () => new Refusal('This file is not a valid XLS workbook')
/** The limits of a sheet in this format, which were Excel's own until 2007. */
const MAX_ROWS = 65_536
const MAX_COLUMNS = 256
/** The most pieces of shared text read, and the most characters in all of them together. */
const MAX_TEXTS = 2_000_000
const MAX_TEXT_CHARACTERS = 64 * 1024 * 1024

const BOF = 0x0809
const EOF = 0x000A
const CONTINUE = 0x003C
/** What Excel shows for a sum that went wrong, by the number it stores. */
const ERRORS: Record<number, string> = { 0x00: '#NULL!', 0x07: '#DIV/0!', 0x0F: '#VALUE!', 0x17: '#REF!', 0x1D: '#NAME?', 0x24: '#NUM!', 0x2A: '#N/A' }

interface Record_ {
  id: number
  at: number
  size: number
}

/** The records of a stream from `from` on, each checked to lie inside the stream. */
function* records(stream: Uint8Array, from: number): Generator<Record_> {
  const view = new DataView(stream.buffer, stream.byteOffset, stream.byteLength)
  for (let at = from; at + 4 <= stream.length; ) {
    const id = view.getUint16(at, true)
    const size = view.getUint16(at + 2, true)
    if (at + 4 + size > stream.length) throw invalid()
    yield { id, at: at + 4, size }
    at += 4 + size
  }
}

/** Text as these files write it: a count of characters, a byte saying how wide each is, the characters. */
function text(stream: Uint8Array, at: number, end: number, short = false): string {
  if (at + (short ? 2 : 3) > end) throw invalid()
  const count = short ? stream[at]! : stream[at]! | (stream[at + 1]! << 8)
  const flags = stream[at + (short ? 1 : 2)]!
  let from = at + (short ? 2 : 3)
  // Before the characters there may be counts of what follows them: changes of style, and a guide to pronunciation.
  if (flags & 0x08) from += 2
  if (flags & 0x04) from += 4
  const wide = (flags & 0x01) === 1
  if (from + count * (wide ? 2 : 1) > end) throw invalid()
  return decode(stream, from, count, wide)
}

function decode(bytes: Uint8Array, at: number, count: number, wide: boolean): string {
  const piece = bytes.subarray(at, at + count * (wide ? 2 : 1))
  return new TextDecoder(wide ? 'utf-16le' : 'latin1').decode(piece)
}

/**
 * The text that cells share. It is one long list, and where it is longer than a record may be
 * it carries on in records that follow, the break falling anywhere, even inside a piece of
 * text. After a break inside text, one byte says afresh how wide the characters are.
 */
function sharedText(stream: Uint8Array, parts: Record_[]): string[] {
  const view = new DataView(stream.buffer, stream.byteOffset, stream.byteLength)
  let part = 0
  let at = parts[0]!.at + 8
  let end = parts[0]!.at + parts[0]!.size
  const next = () => {
    if (++part >= parts.length) throw invalid()
    at = parts[part]!.at
    end = at + parts[part]!.size
  }
  /** A number of `size` bytes, which is never split across a break. */
  const number = (size: 1 | 2 | 4): number => {
    if (at >= end) next()
    if (at + size > end) throw invalid()
    const value = size === 1 ? stream[at]! : size === 2 ? view.getUint16(at, true) : view.getUint32(at, true)
    at += size
    return value
  }
  const skip = (bytes: number) => {
    while (bytes > 0) {
      if (at >= end) next()
      const take = Math.min(bytes, end - at)
      at += take
      bytes -= take
    }
  }
  if (parts[0]!.size < 8) throw invalid()
  const stated = view.getUint32(parts[0]!.at + 4, true)
  const texts: string[] = []
  let characters = 0
  // The count is the file's, and is believed only as far as there are bytes to bear it out.
  while (texts.length < stated && (at < end || part + 1 < parts.length)) {
    if (texts.length >= MAX_TEXTS) throw tooLarge()
    let count = number(2)
    const flags = number(1)
    const runs = flags & 0x08 ? number(2) : 0
    const extra = flags & 0x04 ? number(4) : 0
    let wide = (flags & 0x01) === 1
    characters += count
    if (characters > MAX_TEXT_CHARACTERS) throw tooLarge()
    let value = ''
    while (count > 0) {
      if (at >= end) {
        next()
        wide = (number(1) & 0x01) === 1
      }
      const take = Math.min(count, Math.floor((end - at) / (wide ? 2 : 1)))
      if (take === 0) throw invalid()
      value += decode(stream, at, take, wide)
      at += take * (wide ? 2 : 1)
      count -= take
    }
    skip(runs * 4 + extra)
    texts.push(value)
  }
  return texts
}

/** A number packed into four bytes: a whole number or the top of a fraction, perhaps to be divided by a hundred. */
function packed(value: number): number {
  const hundredth = (value & 1) === 1
  let number: number
  if (value & 2) number = value >> 2
  else {
    const eight = new DataView(new ArrayBuffer(8))
    eight.setUint32(4, value & 0xFFFFFFFC, true)
    number = eight.getFloat64(0, true)
  }
  return hundredth ? number / 100 : number
}

/** Open an old workbook: its sheets by name, each read when it is asked for. */
export function openOldWorkbook(bytes: Uint8Array, named: boolean): Opened {
  let file: Cfb
  let stream: Uint8Array | null
  try {
    file = readCfb(bytes)
    stream = file.stream('Workbook') ?? file.stream('Book')
  } catch {
    throw invalid()
  }
  if (!stream || stream.length < 8) throw invalid()
  const book = stream
  const view = new DataView(book.buffer, book.byteOffset, book.byteLength)

  let from1904 = false
  const custom = new Map<number, string>()
  const styles: number[] = []
  const sheets: Array<{ name: string; at: number; hidden: boolean; kind: number }> = []
  let shared: string[] = []
  let first = true
  let ended = false
  const all = records(book, 0)
  for (let step = all.next(); !step.done; step = all.next()) {
    const { id, at, size } = step.value
    if (first) {
      // A workbook opens by saying which edition of the format it is in. Only the last, from
      // Excel 97 on, writes text in a way every language fits.
      if (id !== BOF || size < 4) throw invalid()
      if (view.getUint16(at, true) !== 0x0600) throw new Refusal('This workbook was saved by Excel 95 or earlier, in a form Omsett cannot read yet. Opening it in a spreadsheet program and saving it again will bring it up to date')
      first = false
    } else if (id === 0x002F) {
      throw new Refusal('This workbook is locked with a password, and cannot be read without it')
    } else if (id === 0x0022 && size >= 2) {
      from1904 = view.getUint16(at, true) === 1
    } else if (id === 0x041E && size >= 5) {
      custom.set(view.getUint16(at, true), text(book, at + 2, at + size))
    } else if (id === 0x00E0 && size >= 4) {
      styles.push(view.getUint16(at + 2, true))
    } else if (id === 0x0085 && size >= 8) {
      sheets.push({ at: view.getUint32(at, true), hidden: (book[at + 4]! & 3) !== 0, kind: book[at + 5]!, name: text(book, at + 6, at + size, true) })
      if (sheets.length > MAX_SHEETS * 4) throw tooLarge()
    } else if (id === 0x00FC) {
      // The list, and every record that carries it on.
      const parts = [step.value]
      let after = all.next()
      while (!after.done && after.value.id === CONTINUE) {
        parts.push(after.value)
        after = all.next()
      }
      shared = sharedText(book, parts)
      if (after.done) break
      if (after.value.id === EOF) {
        ended = true
        break
      }
    } else if (id === EOF) {
      ended = true
      break
    }
  }
  if (first || !ended) throw invalid()
  /** Whether cells of each style show their number as a date. */
  const dated = styles.map((format) => (custom.has(format) ? isDateFormat(custom.get(format)!) : BUILT_IN_DATES.has(format)))

  // The sheets a person would see: worksheets that are not hidden. A sheet is listed once.
  const shown: Opened['shown'] = []
  const looked = new Set<number>()
  for (const sheet of sheets) {
    if (sheet.hidden || sheet.kind !== 0 || looked.has(sheet.at)) continue
    if (sheet.at + 4 > book.length) throw invalid()
    looked.add(sheet.at)
    shown.push({ name: sheet.name.slice(0, 64) || `Sheet ${shown.length + 1}`, path: String(sheet.at) })
    if (shown.length > MAX_SHEETS) throw tooLarge()
  }
  if (sheets.length === 0) throw invalid()

  function rows(path: string) {
    const lines = new Map<number, Cell[]>()
    let cells = 0
    const put = (row: number, column: number, value: Cell) => {
      if (column >= MAX_COLUMNS || row >= MAX_ROWS) throw invalid()
      if (value === null) return
      let line = lines.get(row)
      if (!line) lines.set(row, (line = []))
      // Counted as the room the cells take: one cell in the last column makes its row 256 wide.
      if (column >= line.length) {
        cells += column + 1 - line.length
        if (cells > MAX_CELLS) throw tooLarge()
      }
      line[column] = value
    }
    const shownAs = (style: number, value: number): Cell => (dated[style] ? dateOf(value, from1904) ?? value : value)

    let depth = 0
    let opened = false
    // A formula whose answer is text keeps the text in the record after it.
    let waiting: [number, number] | null = null
    for (const { id, at, size } of records(book, Number(path))) {
      if (!opened) {
        if (id !== BOF) throw invalid()
        opened = true
        depth = 1
        continue
      }
      // A chart drawn on a sheet is a list of its own inside this one, and is passed over.
      if (id === BOF) depth++
      else if (id === EOF) {
        if (--depth === 0) break
      } else if (depth === 1 && size >= 6) {
        const row = view.getUint16(at, true)
        const column = view.getUint16(at + 2, true)
        const style = view.getUint16(at + 4, true)
        if (id === 0x00FD && size >= 10) put(row, column, shared[view.getUint32(at + 6, true)] ?? '')
        else if (id === 0x0203 && size >= 14) put(row, column, shownAs(style, view.getFloat64(at + 6, true)))
        else if (id === 0x027E && size >= 10) put(row, column, shownAs(style, packed(view.getUint32(at + 6, true))))
        else if (id === 0x00BD) {
          // Several packed numbers in a row: a style and a number for each, and the last column at the end.
          for (let entry = at + 4, c = column; entry + 6 <= at + size - 2; entry += 6, c++) put(row, c, shownAs(view.getUint16(entry, true), packed(view.getUint32(entry + 2, true))))
        } else if (id === 0x0204 && size >= 9) put(row, column, text(book, at + 6, at + size))
        else if (id === 0x0205 && size >= 8) put(row, column, book[at + 7] ? ERRORS[book[at + 6]!] ?? '#ERROR!' : book[at + 6] === 1)
        else if (id === 0x0006 && size >= 14) {
          // The value the formula last showed. Where the last two of its eight bytes are all
          // ones, it is not a number, and the first byte says what it is instead.
          if (view.getUint16(at + 12, true) !== 0xFFFF) put(row, column, shownAs(style, view.getFloat64(at + 6, true)))
          else if (book[at + 6] === 0) waiting = [row, column]
          else if (book[at + 6] === 1) put(row, column, book[at + 8] === 1)
          else if (book[at + 6] === 2) put(row, column, ERRORS[book[at + 8]!] ?? '#ERROR!')
        }
      }
      if (depth === 1 && id === 0x0207 && waiting) {
        put(waiting[0], waiting[1], text(book, at, at + size))
        waiting = null
      }
    }
    if (!opened || depth !== 0) throw invalid()
    const order = [...lines.keys()].sort((a, b) => a - b)
    return rowsFrom(order.map((row) => Array.from(lines.get(row)!, (value) => value ?? null)), named)
  }

  return { shown, rows }
}
