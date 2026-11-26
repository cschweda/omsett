import { Refusal } from '../util'

// RTF, before Pandoc reads it. RTF is text: groups in braces, control words that begin with a
// backslash, and the words of the document between them. Pandoc's reader leaves out hidden
// text, comments, field instructions and embedded objects, and it keeps words deleted with
// changes tracked, as struck-out words. A document's author deleted those, and Omsett never
// carries them across: they are taken out here, before Pandoc sees the file.
//
// Two of Pandoc's slips are mended on the way, without changing what the document says: a
// letter given by its number loses the character after its stand-in, so each is written as
// one with no stand-in (\uc0); and a list just before a table is moved to the top of the page,
// so a paragraph holding only a zero-width space is put between them (`TABLE_MARK`), and taken
// out of the page again afterwards.
//
// The walk is one pass over the text and checks what it relies on: how deep groups nest
// (refused past a depth no document has, not left to run out of stack), and that a stretch of
// raw bytes (\bin) is no longer than the file. Everything else passes through as it was.

export const notRtf = () => new Refusal('This file is not a valid RTF document')
/** Deeper than any document nests its groups. */
const MAX_DEPTH = 200

/** The paragraph put before a table, and what it becomes on the page, taken out again there. */
export const TABLE_MARK = '{\\pard \\uc0\\u8203 \\par}'
export const TABLE_MARK_ON_PAGE = /<p>\u200B<\/p>\n?/g

/** Character settings that switch on deleted text, and the value that switches each off. */
const DELETED = 'deleted'

export interface PreparedRtf {
  /** The RTF, with deleted words taken out. */
  rtf: string
  /** The document's language, as Windows numbers it (\deflang, \lang), where it says. */
  language: number | null
  /** For each table, in order, whether its first row is marked as the row of headings (\trhdr). Pandoc does not say. */
  headed: boolean[]
}

export function prepareRtf(text: string): PreparedRtf {
  if (!/^\s*\{\\rtf/.test(text)) throw notRtf()
  let out = ''
  // Whether deleted text is on, for each group open, innermost last.
  const deleted: boolean[] = [false]
  let language: number | null = null
  let at = 0
  let closed = false
  // How many characters stand in for a \u letter, and how many are still to be skipped.
  const skips: number[] = [1]
  let skipping = 0
  // Whether the rows of a table are being read, and whether a paragraph is inside one.
  let inRows = false
  let intable = false
  const headed: boolean[] = []
  let rowsSeen = 0
  const gone = () => deleted.at(-1) === true
  while (at < text.length) {
    const char = text[at]!
    if (char === '{') {
      if (deleted.length > MAX_DEPTH) throw notRtf()
      deleted.push(gone())
      skips.push(skips.at(-1)!)
      out += char
      at++
      skipping = 0
      continue
    }
    if (char === '}') {
      // A brace that closes nothing.
      if (deleted.length === 1) throw notRtf()
      deleted.pop()
      skips.pop()
      out += char
      at++
      skipping = 0
      if (deleted.length === 1) {
        // The document's own group has closed. Anything after it is not part of the document.
        closed = true
        break
      }
      continue
    }
    if (char === '\\') {
      const next = text[at + 1]
      if (next === undefined) throw notRtf()
      if (/[a-z]/i.test(next)) {
        // A control word: letters, a number that may be negative, and one space that ends it.
        const found = /^\\([a-z]{1,32})(-?\d{1,10})? ?/i.exec(text.slice(at, at + 48))
        if (!found) throw notRtf()
        const whole = found[0]
        const word = found[1]!
        const number = found[2]
        at += whole.length
        if (word === 'bin') {
          // Raw bytes, as many as the number says. They are passed over whole, never read as RTF.
          const length = Number(number ?? 0)
          if (length < 0 || at + length > text.length) throw notRtf()
          if (!gone()) out += whole + text.slice(at, at + length)
          at += length
          continue
        }
        if (word === DELETED) deleted[deleted.length - 1] = number !== '0'
        else if ((word === 'deflang' || (word === 'lang' && language === null)) && number !== undefined && !gone()) language = Number(number)
        else if (word === 'uc' && number !== undefined) skips[skips.length - 1] = Math.max(0, Math.min(8, Number(number)))
        if (word === 'trowd' && !inRows) {
          // The first row of a table: the mark that keeps a list before it in its place.
          out += TABLE_MARK
          inRows = true
          headed.push(false)
          rowsSeen = 0
        }
        // A row that repeats at the top of each page is a row of headings; only the first row counts.
        if (word === 'trhdr' && rowsSeen === 0 && headed.length > 0) headed[headed.length - 1] = true
        if (word === 'row') {
          inRows = true
          rowsSeen++
        }
        if (word === 'par' && !intable) inRows = false
        if (word === 'intbl') intable = true
        if (word === 'pard') intable = false
        if (word === 'u') {
          // A letter by its number, and after it the letters that stand in for it, which are passed over.
          skipping = skips.at(-1)!
          if (!gone()) out += `{\\uc0\\u${number ?? '0'} }`
          continue
        }
        if (gone()) {
          // The ends of paragraphs, cells and rows are kept, so that the layout around the deletion holds.
          if (['par', 'cell', 'row', 'line', 'sect', 'page', 'tab'].includes(word)) out += whole
          continue
        }
        out += whole
        continue
      }
      // A control symbol: one character after the backslash. \'hh is a letter by its number.
      if (next === "'") {
        const hex = text.slice(at, at + 4)
        if (!/^\\'[0-9a-f]{2}$/i.test(hex)) throw notRtf()
        at += 4
        if (skipping > 0) {
          skipping--
          continue
        }
        if (!gone()) out += hex
        continue
      }
      at += 2
      // A brace or backslash written as a letter, a hard space, a hyphen: letters, kept unless deleted.
      if (!gone() || next === '\n' || next === '\r') out += `\\${next}`
      continue
    }
    // Plain letters. A letter that stands in for the \u letter before it is passed over with it.
    if (skipping > 0 && char !== '\r' && char !== '\n') {
      skipping--
      at++
      continue
    }
    if (!gone() || char === '\r' || char === '\n') out += char
    at++
  }
  // A document that stops before its last brace was cut short, and is refused as damaged. One
  // that goes on after it holds words some programs read and others do not: refused too.
  if (!closed || text.slice(at).replace(/[\s\0]+/g, '') !== '') throw notRtf()
  return { rtf: out, language, headed }
}
