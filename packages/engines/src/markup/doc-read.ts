import { readCfb, type Cfb } from '@omsett/detect'
import { writtenBy } from '../details/ole'
import { Refusal } from '../util'
import { escapeHtml, type ReadDocument } from './docx-read'

// Word documents from before 2007 (DOC) → HTML. The file is a small filing system (cfb.ts in
// packages/detect). One stream in it holds the text, and a second holds tables that say what
// the text is: which stretches of the file make up the document and in what order, where each
// paragraph ends and what kind it is, and how each run of letters is set.
//
// What is read is what a reader of the page needs: headings as headings, lists as lists,
// tables as tables, bold and italic, links. What the author deleted or hid is left out, as it
// is from a DOCX: text struck out under tracked changes, hidden text, comments. Nothing in the
// file is run; macros are not opened.

export const notOldDocument = () => new Refusal('This file is not a valid DOC document')
/** The most characters read from one document: several thousand pages. */
const MAX_CHARACTERS = 20_000_000
/** The most 512-byte pages of formatting followed. */
const MAX_PAGES = 200_000
const MAX_WRITTEN = 64 * 1024 * 1024

/** Languages by the number Windows gives them, for the few most documents are written in. */
export const LANGUAGES: Record<number, string> = {
  0x0409: 'en-US', 0x0809: 'en-GB', 0x0C09: 'en-AU', 0x1009: 'en-CA', 0x040C: 'fr', 0x0C0C: 'fr-CA', 0x0407: 'de', 0x040A: 'es', 0x0C0A: 'es', 0x080A: 'es-MX',
  0x0410: 'it', 0x0413: 'nl', 0x0414: 'nb', 0x0814: 'nn', 0x041D: 'sv', 0x0406: 'da', 0x040B: 'fi', 0x0416: 'pt-BR', 0x0816: 'pt', 0x0415: 'pl',
  0x0419: 'ru', 0x0422: 'uk', 0x0405: 'cs', 0x040E: 'hu', 0x0408: 'el', 0x041F: 'tr', 0x040D: 'he', 0x0401: 'ar', 0x0411: 'ja', 0x0412: 'ko', 0x0804: 'zh-CN', 0x0404: 'zh-TW',
}

interface Range<T> {
  from: number
  to: number
  value: T
}
interface Letters {
  bold?: boolean
  italic?: boolean
  /** Hidden text, or text struck out under tracked changes: not carried across. */
  gone?: boolean
}
interface Paragraph {
  /** The style, by its place in the document's list of styles. Places 1 to 9 are the nine headings. */
  style: number
  /** Which list the paragraph is in, counted from 1, and how deep. */
  list?: number
  depth?: number
  /** A level in the outline, where the author gave one to a style of their own. */
  outline?: number
  /** Inside a table; the mark that ends a row of one; and whether that row is a heading for the rows below. */
  inTable?: boolean
  rowEnd?: boolean
  header?: boolean
}

/** Go through a list of settings: each a number saying what it sets, and a value whose size the number gives. */
function settings(bytes: Uint8Array, from: number, to: number, each: (which: number, at: number) => void): void {
  for (let at = from; at + 2 <= to; ) {
    const which = bytes[at]! | (bytes[at + 1]! << 8)
    let size = [1, 1, 2, 4, 2, 2, -1, 3][which >> 13]!
    if (size < 0) {
      if (at + 3 > to) return
      // Two settings give their length in a way of their own.
      if (which === 0xD608 || which === 0xD606) size = (bytes[at + 2]! | (bytes[at + 3]! << 8)) + 1
      else if (which === 0xC615 && bytes[at + 2] === 255) return
      else size = bytes[at + 2]! + 1
    }
    if (at + 2 + size > to) return
    each(which, at + 2)
    at += 2 + size
  }
}

/** Where a value starts in a sorted list of ranges, or -1. */
function find<T>(ranges: Array<Range<T>>, at: number): T | undefined {
  let [low, high] = [0, ranges.length - 1]
  while (low <= high) {
    const middle = (low + high) >> 1
    const range = ranges[middle]!
    if (at < range.from) high = middle - 1
    else if (at >= range.to) low = middle + 1
    else return range.value
  }
  return undefined
}

export function readDoc(bytes: Uint8Array): ReadDocument {
  let file: Cfb
  let word: Uint8Array | null
  try {
    file = readCfb(bytes)
    word = file.stream('WordDocument')
  } catch {
    throw notOldDocument()
  }
  if (!word || word.length < 0x9A + 8) throw notOldDocument()
  const main = word
  const view = new DataView(main.buffer, main.byteOffset, main.byteLength)
  if (view.getUint16(0, true) !== 0xA5EC) throw notOldDocument()
  if (view.getUint16(2, true) < 0x00C1) throw new Refusal('This document was saved by Word 95 or earlier, in a form Omsett cannot read yet. Opening it in a word processor and saving it again will bring it up to date')
  const flags = view.getUint16(0x0A, true)
  if (flags & 0x0100) throw new Refusal('This document is locked with a password, and cannot be read without it')
  let tables: Uint8Array | null
  try {
    tables = file.stream(flags & 0x0200 ? '1Table' : '0Table')
  } catch {
    throw notOldDocument()
  }
  if (!tables) throw notOldDocument()
  const table = tables
  const tview = new DataView(table.buffer, table.byteOffset, table.byteLength)
  const length = view.getUint32(0x4C, true)
  if (length > MAX_CHARACTERS) throw new Refusal('This document is too long to convert in a browser')

  /** One of the document's numbered places in the table stream: where it is and how long. Checked to lie inside. */
  const pairs = view.getUint16(0x98, true)
  const place = (index: number): { at: number; size: number } | null => {
    if (index >= pairs || 0x9A + index * 8 + 8 > main.length) return null
    const at = view.getUint32(0x9A + index * 8, true)
    const size = view.getUint32(0x9E + index * 8, true)
    if (size === 0) return null
    if (at + size > table.length) throw notOldDocument()
    return { at, size }
  }

  // --- The text: stretches of the file, in the order the document has them -------------------
  const clx = place(33)
  if (!clx) throw notOldDocument()
  let at = clx.at
  const end = clx.at + clx.size
  while (at < end && table[at] === 1) at += 3 + tview.getUint16(at + 1, true)
  if (at + 5 > end || table[at] !== 2) throw notOldDocument()
  const listed = tview.getUint32(at + 1, true)
  at += 5
  if (at + listed > end || listed < 16) throw notOldDocument()
  const count = Math.floor((listed - 4) / 12)
  const codes = new Uint16Array(length)
  const places = new Float64Array(length)
  let read = 0
  for (let piece = 0; piece < count && read < length; piece++) {
    const from = tview.getUint32(at + piece * 4, true)
    const to = Math.min(tview.getUint32(at + piece * 4 + 4, true), length)
    if (from !== read || to < from) throw notOldDocument()
    const where = tview.getUint32(at + (count + 1) * 4 + piece * 8 + 2, true)
    // One bit says the stretch is written a byte to a letter, at half the place given.
    const narrow = (where & 0x40000000) !== 0
    const start = narrow ? (where & 0x3FFFFFFF) >>> 1 : where
    const wide = narrow ? 1 : 2
    if (start + (to - from) * wide > main.length) throw notOldDocument()
    if (narrow) {
      const text = new TextDecoder('windows-1252').decode(main.subarray(start, start + (to - from)))
      for (let i = 0; i < to - from; i++) codes[from + i] = text.charCodeAt(i)
    } else {
      for (let i = 0; i < to - from; i++) codes[from + i] = view.getUint16(start + i * 2, true)
    }
    for (let i = 0; i < to - from; i++) places[from + i] = start + i * wide
    read = to
  }
  if (read < length) throw notOldDocument()

  // --- What the text is: pages of 512 bytes, each saying how a run of the file is set ----------
  function pages<T>(index: number, one: (page: number, slot: number, runs: number) => T | undefined): Array<Range<T>> {
    const list = place(index)
    const found: Array<Range<T>> = []
    if (!list) return found
    const many = Math.floor((list.size - 4) / 8)
    if (many > MAX_PAGES) throw new Refusal('This document is too long to convert in a browser')
    for (let i = 0; i < many; i++) {
      const page = tview.getUint32(list.at + (many + 1) * 4 + i * 4, true) * 512
      if (page + 512 > main.length) throw notOldDocument()
      const runs = main[page + 511]!
      if (4 * (runs + 1) + runs > 511) throw notOldDocument()
      for (let slot = 0; slot < runs; slot++) {
        const value = one(page, slot, runs)
        if (value !== undefined) found.push({ from: view.getUint32(page + slot * 4, true), to: view.getUint32(page + slot * 4 + 4, true), value })
      }
    }
    return found.sort((a, b) => a.from - b.from)
  }
  const letters = pages<Letters>(12, (page, slot, runs) => {
    const offset = main[page + 4 * (runs + 1) + slot]! * 2
    if (offset === 0) return undefined
    const size = main[page + offset]!
    if (offset + 1 + size > 511) return undefined
    const set: Letters = {}
    settings(main, page + offset + 1, page + offset + 1 + size, (which, value) => {
      // One means on and nothing means off. The other values mean "as the style has it", which is not read.
      const yes = main[value] === 1 || main[value] === 129
      if (which === 0x0800 || which === 0x083C) set.gone = set.gone || yes
      else if (which === 0x0835) set.bold = yes
      else if (which === 0x0836) set.italic = yes
    })
    return set.bold || set.italic || set.gone ? set : undefined
  })
  const paragraphs = pages<Paragraph>(13, (page, slot, runs) => {
    const offset = main[page + 4 * (runs + 1) + slot * 13]! * 2
    if (offset === 0 || offset + 2 > 511) return undefined
    let start = page + offset + 1
    let size = main[page + offset]! * 2 - 1
    if (main[page + offset] === 0) {
      size = main[page + offset + 1]! * 2
      start = page + offset + 2
    }
    if (size < 2 || start + size > page + 511) return undefined
    const set: Paragraph = { style: view.getUint16(start, true) }
    settings(main, start + 2, start + size, (which, value) => {
      if (which === 0x460B) set.list = view.getUint16(value, true)
      else if (which === 0x260A) set.depth = main[value]!
      else if (which === 0x2640) set.outline = main[value]!
      else if (which === 0x2416) set.inTable = main[value] === 1
      else if (which === 0x2417) set.rowEnd = main[value] === 1
      else if (which === 0x3404) set.header = main[value] === 1
    })
    return set
  })

  // --- Lists: whether each is numbered or has bullets ------------------------------------------
  /** For each list a paragraph may name, whether its levels are numbered. */
  const numbered: boolean[][] = []
  try {
    const lists = place(73)
    const uses = place(74)
    if (lists && uses) {
      const many = Math.min(tview.getUint16(lists.at, true), 2000)
      const kinds = new Map<number, boolean[]>()
      let level = lists.at + 2 + many * 28
      for (let i = 0; i < many; i++) {
        const entry = lists.at + 2 + i * 28
        const levels = table[entry + 26]! & 1 ? 1 : 9
        const found: boolean[] = []
        for (let l = 0; l < levels && level + 28 <= table.length; l++) {
          // Format 23 is a bullet, and 255 is nothing at all. Every other is a way of counting.
          found.push(table[level + 4] !== 23 && table[level + 4] !== 255)
          level += 28 + table[level + 24]! + table[level + 25]!
          if (level + 2 > table.length) break
          level += 2 + tview.getUint16(level, true) * 2
        }
        kinds.set(tview.getInt32(entry, true), found)
      }
      const used = Math.min(tview.getUint32(uses.at, true), 4000)
      for (let i = 0; i < used && uses.at + 4 + i * 16 + 16 <= uses.at + uses.size; i++) numbered.push(kinds.get(tview.getInt32(uses.at + 4 + i * 16, true)) ?? [])
    }
  } catch {
    // Lists whose kind cannot be read are written with bullets.
  }

  // --- The page ---------------------------------------------------------------------------------
  type Block =
    | { kind: 'text'; html: string; level: number; list: number; depth: number; ordered: boolean }
    | { kind: 'table'; rows: Array<{ cells: string[]; header: boolean }> }
  const blocks: Block[] = []
  let written = 0
  let line = ''
  /** What is open around the letters being written: bold, italic, and a link. Only these three tags are ever written. */
  let marks = ''
  let linked: string | undefined
  /** Cells of the row being read, and the paragraphs of the cell being read. */
  let cells: string[] = []
  let cell: string[] = []
  let rows: Array<{ cells: string[]; header: boolean }> = []
  /** Fields: an instruction to Word, and after it what the instruction last gave. Only that is text. */
  const fields: Array<{ code: string; result: boolean; link?: string }> = []
  const close = () => {
    if (marks.includes('em')) line += '</em>'
    if (marks.includes('strong')) line += '</strong>'
    if (linked !== undefined) line += '</a>'
    marks = ''
    linked = undefined
  }
  const flushTable = () => {
    if (rows.length) blocks.push({ kind: 'table', rows })
    rows = []
  }
  for (let cp = 0; cp < length; cp++) {
    const code = codes[cp]!
    const field = fields.at(-1)
    if (code === 0x13) {
      fields.push({ code: '', result: false })
      if (fields.length > 64) throw notOldDocument()
      continue
    }
    if (code === 0x14 && field) {
      field.result = true
      const link = /^\s*HYPERLINK\s+"([^"]{1,2000})"/i.exec(field.code)
      if (link) field.link = link[1]
      continue
    }
    if (code === 0x15 && field) {
      fields.pop()
      continue
    }
    // Inside an instruction, nothing is text. A paragraph still ends where it ends.
    const hidden = fields.some((open) => !open.result)
    if (hidden && code !== 0x0D && code !== 0x07) {
      if (field && !field.result && field.code.length < 4000) field.code += String.fromCharCode(code)
      continue
    }
    if (code === 0x0D || code === 0x07 || code === 0x0C) {
      close()
      const set: Paragraph = find(paragraphs, places[cp]!) ?? { style: 0 }
      const text = line.trim()
      line = ''
      if (code === 0x07) {
        // In a table, this mark ends a cell; the one that ends a row follows the last cell's.
        if (set.rowEnd || (cp > 0 && codes[cp - 1] === 0x07 && cells.length > 0 && text === '' && cell.length === 0)) {
          rows.push({ cells, header: set.header === true })
          cells = []
        } else {
          if (text) cell.push(text)
          cells.push(cell.length > 1 ? cell.map((part) => `<p>${part}</p>`).join('') : cell[0] ?? '')
          cell = []
        }
        continue
      }
      // A paragraph inside a cell is part of the cell.
      if (set.inTable) {
        if (text) cell.push(text)
        continue
      }
      flushTable()
      if (!text) continue
      const heading = set.style >= 1 && set.style <= 9 ? set.style : set.outline !== undefined && set.outline < 9 ? set.outline + 1 : 0
      const list = heading ? 0 : set.list ?? 0
      const depth = Math.min(set.depth ?? 0, 8)
      blocks.push({ kind: 'text', html: text, level: Math.min(heading, 6), list, depth, ordered: list > 0 && (numbered[list - 1]?.[depth] ?? numbered[list - 1]?.[0] ?? false) })
      continue
    }
    const set = find(letters, places[cp]!)
    if (set?.gone) continue
    const wanted = `${set?.bold ? 'strong' : ''}${set?.italic ? ' em' : ''}`
    // An address is the file's own words, and is kept apart from the names of tags. Only an
    // address a browser would fetch or write to is made a link; any other is left as its words.
    const address = fields.findLast((open) => open.link)?.link?.trim()
    const link = address !== undefined && /^(?:https?:|mailto:)/i.test(address) ? address : undefined
    let out: string
    if (code === 0x0B) out = '<br>'
    else if (code === 0x09) out = ' '
    else if (code === 0x1E) out = '-'
    else if (code === 0xA0) out = ' '
    // A picture, a drawing, the number of a note, a hyphen to use only at a line's end: none is a letter.
    else if (code < 0x20 || code === 0x1F) continue
    else out = escapeHtml(String.fromCharCode(code))
    if (wanted !== marks || link !== linked) {
      close()
      if (link !== undefined) line += `<a href="${escapeHtml(link)}">`
      if (wanted.includes('strong')) line += '<strong>'
      if (wanted.includes('em')) line += '<em>'
      marks = wanted
      linked = link
    }
    line += out
    written += out.length
    if (written > MAX_WRITTEN) throw new Refusal('This document is too long to convert in a browser')
  }
  close()
  if (line.trim()) blocks.push({ kind: 'text', html: line.trim(), level: 0, list: 0, depth: 0, ordered: false })
  flushTable()

  // --- Written out -------------------------------------------------------------------------------
  let body = ''
  /** Lists open at each depth, innermost last. */
  const open: string[] = []
  const shut = (to: number) => {
    while (open.length > to) body += `</li></${open.pop()}>`
  }
  for (const block of blocks) {
    if (block.kind === 'table') {
      shut(0)
      const head = block.rows.filter((row) => row.header)
      const rest = block.rows.filter((row) => !row.header)
      body += '<table>'
      if (head.length) body += `<thead>${head.map((row) => `<tr>${row.cells.map((text) => `<th scope="col">${text}</th>`).join('')}</tr>`).join('')}</thead>`
      body += `<tbody>${rest.map((row) => `<tr>${row.cells.map((text) => `<td>${text}</td>`).join('')}</tr>`).join('')}</tbody></table>`
    } else if (block.list > 0) {
      const tag = block.ordered ? 'ol' : 'ul'
      if (open.length > block.depth + 1) shut(block.depth + 1)
      if (open.length === block.depth + 1 && open.at(-1) === tag) body += `</li><li>${block.html}`
      else {
        if (open.length === block.depth + 1) shut(block.depth)
        while (open.length < block.depth + 1) {
          const inner = open.length === block.depth ? tag : 'ul'
          body += `<${inner}><li>`
          open.push(inner)
        }
        body += block.html
      }
    } else {
      shut(0)
      body += block.level ? `<h${block.level}>${block.html}</h${block.level}>` : `<p>${block.html}</p>`
    }
  }
  shut(0)
  if (body === '') throw new Refusal('This document has no text in it')
  const title = writtenBy(file).find((found) => found.label === 'Title')?.value ?? null
  return { body, title, language: LANGUAGES[view.getUint16(6, true)] ?? null }
}
