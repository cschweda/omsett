import { readCfb, type Cfb } from '@omsett/detect'
import { writtenBy } from '../details/ole'
import { Refusal } from '../util'
import { LANGUAGES } from './doc-read'
import { escapeHtml, MAX_PICTURE_BYTES, pictureAddress, type ReadDocument } from './docx-read'

// PowerPoint presentations from before 2007 (PPT) → HTML, the same page a PPTX becomes: a
// section to each slide, its title the heading, bullets as lists at their levels, tables as
// tables, and each picture with the description its author gave it.
//
// The file is the container old Office files share (cfb.ts in packages/detect). One stream in
// it is a row of records, each a type and a length, some holding others. Which record is which
// slide is not where it sits but what a directory says, and a file saved many times over keeps
// every directory it ever had, newest first, each pointing to the one before. Every one of
// those numbers is checked against the stream before it is followed.
//
// Speaker notes, hidden slides and hidden shapes are not read, as from a PPTX: they are what
// the presenter kept from the audience. Nothing in the file is run; macros are not opened.

export const notOldPresentation = () => new Refusal('This file is not a valid PPT presentation')
const tooLarge = () => new Refusal('This presentation is too large to convert in a browser')

const MAX_SLIDES = 2000
/** The most records looked at, all told. A presentation of a thousand slides has some hundreds of thousands. */
const MAX_RECORDS = 2_000_000
/** How deep records may hold records, and groups of shapes hold groups. */
const MAX_DEPTH = 32
/** The most times a presentation may have been saved over itself, each save a directory. */
const MAX_EDITS = 4096
const MAX_PERSIST = 1_000_000
/** The most places read from directories, all told: saves may share one, and each would read it again. */
const MAX_LISTED = 4_000_000
/** The most HTML a presentation may become, pictures included. */
const MAX_WRITTEN = 64 * 1024 * 1024
/** The longest address made a link. */
const MAX_ADDRESS = 2048

// The records that matter, by the number the format gives each.
const DOCUMENT = 0x03E8
const SLIDE = 0x03EE
const SLIDE_PERSIST = 0x03F3
const SLIDE_SHOW_INFO = 0x03F9
const ENVIRONMENT = 0x03F2
const EX_OBJECTS = 0x0409
const DRAWING_GROUP = 0x040B
const DRAWING = 0x040C
const PLACEHOLDER = 0x0BC3
const OUTLINE_TEXT_REF = 0x0F9E
const TEXT_HEADER = 0x0F9F
const TEXT_CHARS = 0x0FA0
const STYLE_TEXT = 0x0FA1
const TEXT_BYTES = 0x0FA8
const SPECIAL_DEFAULT = 0x0FA9
const SPECIAL_INFO = 0x0FAA
const C_STRING = 0x0FBA
const EX_HYPERLINK_ATOM = 0x0FD3
const EX_HYPERLINK = 0x0FD7
const TEXT_INTERACTIVE = 0x0FDF
const SLIDE_LIST = 0x0FF0
const INTERACTIVE = 0x0FF2
const INTERACTIVE_ATOM = 0x0FF3
const USER_EDIT = 0x0FF5
const CURRENT_USER = 0x0FF6
const PERSIST_DIRECTORY = 0x1772
// The drawing inside each slide, in the format Office draws shapes with everywhere.
const DGG = 0xF000
const BSTORE = 0xF001
const DG = 0xF002
const SPGR = 0xF003
const SP = 0xF004
const BSE = 0xF007
const FSP = 0xF00A
const OPT = 0xF00B
const CLIENT_TEXTBOX = 0xF00D
const CHILD_ANCHOR = 0xF00F
const CLIENT_DATA = 0xF011
const TERTIARY_OPT = 0xF122

/** A record: what it is, where its contents start in the stream, and how long they are. */
interface Rec {
  type: number
  instance: number
  container: boolean
  at: number
  length: number
}

/** A run of the text, from one place to the next, and what is true of it. */
interface Span<T> {
  end: number
  value: T
}
interface Paragraph {
  indent: number
  /** Whether it says it has a bullet, or that it has none. Unsaid, its box decides. */
  bullet?: boolean
}
interface Letters {
  bold: boolean
  italic: boolean
}

/** One stretch of text, as kept with a shape or in the slide's list. */
interface Text {
  /** What the text is, as the text says: 0 a title, 1 a body, 2 notes, 4 other, 5 a subtitle, 6 a centred title, 7 and 8 bodies. */
  kind: number
  chars: string
  paragraphs: Array<Span<Paragraph>>
  letters: Array<Span<Letters>>
  /** For each letter, the link it is part of, as its number in the presentation's list; 0 for none. */
  linked: Uint32Array
  language?: number
}

/** A picture's file, by its place among the presentation's pictures. */
type Blip = { data: Uint8Array; kind: 'png' | 'jpg' } | null

export function readPpt(bytes: Uint8Array): ReadDocument {
  let file: Cfb
  let stream: Uint8Array | null
  let current: Uint8Array | null
  let pictures: Uint8Array | null
  try {
    file = readCfb(bytes)
    stream = file.stream('PowerPoint Document')
    current = file.stream('Current User')
    pictures = file.stream('Pictures')
  } catch {
    throw notOldPresentation()
  }
  if (!stream || !current || current.length < 26) throw notOldPresentation()
  const doc = stream
  const view = new DataView(doc.buffer, doc.byteOffset, doc.byteLength)
  let looked = 0

  /** The record whose header starts at a place, checked to lie inside the stream (or inside `end`). */
  const recordAt = (at: number, end = doc.length): Rec => {
    if (++looked > MAX_RECORDS) throw tooLarge()
    if (!Number.isInteger(at) || at < 0 || at + 8 > end) throw notOldPresentation()
    const head = view.getUint16(at, true)
    const length = view.getUint32(at + 4, true)
    if (at + 8 + length > end) throw notOldPresentation()
    return { type: view.getUint16(at + 2, true), instance: head >> 4, container: (head & 0xF) === 0xF, at: at + 8, length }
  }
  /**
   * The records a container holds, in order. One that runs past its container makes the file
   * invalid, except where `lenient` says to keep what came before it and read no further.
   */
  const children = (parent: Rec, lenient = false): Rec[] => {
    const found: Rec[] = []
    for (let at = parent.at; at < parent.at + parent.length; ) {
      let record: Rec
      try {
        record = recordAt(at, parent.at + parent.length)
      } catch (error) {
        if (lenient && error instanceof Refusal && error.message === notOldPresentation().message) break
        throw error
      }
      found.push(record)
      at = record.at + record.length
    }
    return found
  }
  const childOf = (parent: Rec | undefined, type: number, instance?: number): Rec | undefined =>
    parent?.container ? children(parent).find((record) => record.type === type && (instance === undefined || record.instance === instance)) : undefined
  const u32 = (record: Rec, offset: number): number => {
    if (offset + 4 > record.length) throw notOldPresentation()
    return view.getUint32(record.at + offset, true)
  }

  // --- Which edition of the file is the current one ----------------------------------------------
  const user = new DataView(current.buffer, current.byteOffset, current.byteLength)
  if (user.getUint16(2, true) !== CURRENT_USER) throw notOldPresentation()
  // A file saved with a password says so here, by a different number in place of the usual one.
  const token = user.getUint32(12, true)
  if (token === 0xF3D1C4DF) throw new Refusal('This presentation is locked with a password, and cannot be read without it')
  if (token !== 0xE391C05F) throw notOldPresentation()
  if (user.getUint16(22, true) !== 0x03F4) throw new Refusal('This presentation was saved by PowerPoint 95 or earlier, in a form Omsett cannot read yet. Opening it in a presentation program and saving it again will bring it up to date')

  // Each save adds a record that says where its directory is and where the save before it is.
  // They are followed newest first, then their directories laid down oldest first, so that
  // what a later save says of an object is what stands.
  const edits: Rec[] = []
  const seen = new Set<number>()
  for (let at = user.getUint32(16, true); ; ) {
    if (seen.has(at) || edits.length >= MAX_EDITS) throw notOldPresentation()
    seen.add(at)
    const edit = recordAt(at)
    if (edit.type !== USER_EDIT || edit.length < 28) throw notOldPresentation()
    // A save that was locked names the record that holds its key.
    if (edit.length >= 32 && u32(edit, 28) !== 0) throw new Refusal('This presentation is locked with a password, and cannot be read without it')
    edits.push(edit)
    at = u32(edit, 8)
    if (at === 0) break
  }
  const persist = new Map<number, number>()
  let listed = 0
  for (const edit of [...edits].reverse()) {
    const directory = recordAt(u32(edit, 12))
    if (directory.type !== PERSIST_DIRECTORY) throw notOldPresentation()
    for (let at = 0; at < directory.length; ) {
      const entry = u32(directory, at)
      const first = entry & 0xFFFFF
      const count = entry >>> 20
      at += 4
      if (at + count * 4 > directory.length) throw notOldPresentation()
      listed += count
      if (listed > MAX_LISTED) throw tooLarge()
      for (let i = 0; i < count; i++, at += 4) persist.set(first + i, u32(directory, at))
      if (persist.size > MAX_PERSIST) throw tooLarge()
    }
  }
  const object = (id: number, type: number): Rec => {
    const at = persist.get(id)
    if (at === undefined) throw notOldPresentation()
    const record = recordAt(at)
    if (record.type !== type || !record.container) throw notOldPresentation()
    return record
  }
  const document = object(u32(edits[0]!, 16), DOCUMENT)
  const parts = children(document)

  // --- What the whole presentation shares: links, the language, the pictures ------------------
  const hyperlinks = new Map<number, string>()
  for (const objects of parts.filter((record) => record.type === EX_OBJECTS && record.container)) {
    for (const link of children(objects).filter((record) => record.type === EX_HYPERLINK && record.container)) {
      const inside = children(link)
      const atom = inside.find((record) => record.type === EX_HYPERLINK_ATOM)
      const target = inside.find((record) => record.type === C_STRING && record.instance === 1)
      if (atom && target) hyperlinks.set(u32(atom, 0), utf16(doc, target.at, target.length))
    }
  }
  const special = childOf(parts.find((record) => record.type === ENVIRONMENT), SPECIAL_DEFAULT)
  let language: number | undefined = special ? languageOf(view, special) : undefined

  const blips: Rec[] = []
  const store = childOf(childOf(parts.find((record) => record.type === DRAWING_GROUP), DGG), BSTORE)
  if (store) blips.push(...children(store).filter((record) => record.type === BSE))
  const picture = (index: number): Blip => {
    const entry = blips[index - 1]
    if (!entry || entry.length < 36) return null
    // The picture is either inside the entry, after its name, or in a stream of its own.
    const named = doc[entry.at + 33]!
    if (entry.length > 36 + named) return blipOf(doc, entry.at + 36 + named, entry.at + entry.length)
    const at = u32(entry, 28)
    return pictures ? blipOf(pictures, at, pictures.length) : null
  }

  // --- The slides, in the order they are shown ------------------------------------------------
  const list = parts.find((record) => record.type === SLIDE_LIST && record.instance === 0 && record.container)
  if (!list) throw notOldPresentation()
  // After each slide's record come the texts of its placeholders, which its shapes refer to by number.
  const slides: Array<{ id: number; texts: Rec[][] }> = []
  for (const record of children(list)) {
    if (record.type === SLIDE_PERSIST) {
      slides.push({ id: u32(record, 0), texts: [] })
      if (slides.length > MAX_SLIDES) throw tooLarge()
    } else if (record.type === TEXT_HEADER) slides.at(-1)?.texts.push([record])
    else slides.at(-1)?.texts.at(-1)?.push(record)
  }
  // A slide is shown once. A list that names one slide twice is asking for it to be read twice.
  if (new Set(slides.map((slide) => slide.id)).size !== slides.length) throw notOldPresentation()

  /** A stretch of text, from the records that make it up: what kind, the letters, and how they are set. */
  const readText = (records: Rec[]): Text | null => {
    const header = records.find((record) => record.type === TEXT_HEADER)
    const letters = records.find((record) => record.type === TEXT_CHARS || record.type === TEXT_BYTES)
    if (!header || !letters) return null
    const chars = letters.type === TEXT_CHARS ? utf16(doc, letters.at, letters.length) : latin(doc, letters.at, letters.length)
    const style = records.find((record) => record.type === STYLE_TEXT)
    const { paragraphs, runs } = style ? styleOf(view, style, chars.length) : { paragraphs: [], runs: [] }
    const links: Array<{ from: number; to: number; target: number }> = []
    for (let i = 0; i < records.length - 1; i++) {
      const info = records[i]!
      const range = records[i + 1]!
      // A link is a "when clicked" followed by the stretch of text it applies to.
      if (info.type !== INTERACTIVE || info.instance !== 0 || !info.container || range.type !== TEXT_INTERACTIVE || range.length < 8) continue
      const atom = childOf(info, INTERACTIVE_ATOM)
      // Action 4 is "go to a link". A jump to another slide, or a program to run, is its words.
      if (!atom || atom.length < 9 || doc[atom.at + 8] !== 4) continue
      links.push({ from: u32(range, 0), to: u32(range, 4), target: u32(atom, 4) })
    }
    // Each letter is given its link once, from the earliest that covers it, so that no letter is
    // looked for in every link: a text with many links over it is read in one pass.
    const linked = new Uint32Array(chars.length)
    let filled = 0
    for (const link of links.sort((a, b) => a.from - b.from)) {
      for (let at = Math.max(link.from, filled); at < Math.min(link.to, chars.length); at++) linked[at] = link.target
      filled = Math.max(filled, Math.min(link.to, chars.length))
    }
    const info = records.find((record) => record.type === SPECIAL_INFO)
    return { kind: u32(header, 0), chars, paragraphs, letters: runs, linked, language: info ? languageOf(view, info) : undefined }
  }

  /** Paragraphs of text as HTML: a list at its levels, or plain paragraphs. */
  const paragraphsOf = (text: Text, bulleted: boolean): string => {
    let html = ''
    let open = 0
    const closeTo = (level: number) => {
      while (open > level) {
        html += '</li></ul>'
        open--
      }
    }
    let start = 0
    for (const line of text.chars.split('\r')) {
      const inner = inline(text, start, start + line.length)
      const paragraph = find(text.paragraphs, start)
      start += line.length + 1
      if (inner.trim() === '') continue
      if (!(paragraph?.bullet ?? bulleted)) {
        closeTo(0)
        html += `<p>${inner}</p>`
        continue
      }
      const level = Math.min(8, paragraph?.indent ?? 0) + 1
      if (open > level) closeTo(level)
      if (open === level) html += '</li>'
      while (open < level) {
        html += '<ul>'
        open++
        if (open < level) html += '<li>'
      }
      html += `<li>${inner}`
    }
    closeTo(0)
    return html
  }

  /**
   * The letters from one place to another, with their emphasis and links. A link is opened once
   * for all the letters under it, however their emphasis changes; and everything written is
   * counted as it is written, so that letters set each their own way cannot make a page larger
   * than any is allowed to be before the count is looked at.
   */
  let spent = 0
  const spend = (html: string) => {
    spent += html.length
    if (spent > MAX_WRITTEN) throw tooLarge()
    return html
  }
  const inline = (text: Text, from: number, to: number): string => {
    let html = ''
    let piece = ''
    let style = ''
    let link = ''
    const flush = () => {
      if (piece === '') return
      let out = escapeHtml(piece)
      if (style.includes('i')) out = `<em>${out}</em>`
      if (style.includes('b')) out = `<strong>${out}</strong>`
      html += spend(out)
      piece = ''
    }
    for (let i = from; i < to; i++) {
      const code = text.chars.charCodeAt(i)
      let out: string
      if (code === 0x0B) out = '\n'
      else if (code === 0x09) out = ' '
      // Everything else below a space is a mark for something that is not a letter: a field, a
      // picture. So are the codes from 0x7F to 0x9F, which a one-byte text can hold and no letter is.
      else if (code < 0x20 || (code >= 0x7F && code < 0xA0)) continue
      else out = text.chars[i]!
      const set = find(text.letters, i)
      const address = text.linked[i] ? hyperlinks.get(text.linked[i]!)?.trim() : undefined
      // Only an address a browser would open or write to is made a link; any other is its words.
      // So is an address longer than any page's.
      const href = address !== undefined && address.length <= MAX_ADDRESS && /^(?:https?:|mailto:)/i.test(address) ? address : ''
      const wanted = `${set?.bold ? 'b' : ''}${set?.italic ? 'i' : ''}`
      if (href !== link) {
        flush()
        if (link) html += '</a>'
        if (href) html += spend(`<a href="${escapeHtml(href)}">`)
        link = href
      }
      if (wanted !== style) {
        flush()
        style = wanted
      }
      piece += out
    }
    flush()
    if (link) html += '</a>'
    return html.replace(/\n/g, '<br>')
  }

  /** Each paragraph of a stretch of text as a line of HTML. */
  const linesOf = (text: Text): string[] => {
    let start = 0
    return text.chars.split('\r').map((line) => {
      const html = inline(text, start, start + line.length)
      start += line.length + 1
      return html
    })
  }

  // --- Each slide -------------------------------------------------------------------------------
  const budget = { left: MAX_PICTURE_BYTES }
  let written = ''
  let first: string | null = null
  let shown = 0
  // Two numbers in a directory may name one place. A slide is read once, whatever it is called.
  const read = new Set<number>()
  for (const entry of slides) {
    if (read.has(persist.get(entry.id) ?? -1)) throw notOldPresentation()
    read.add(persist.get(entry.id) ?? -1)
    const slide = object(entry.id, SLIDE)
    const inside = children(slide)
    // A slide marked not to be shown is not part of the presentation as given.
    const show = inside.find((record) => record.type === SLIDE_SHOW_INFO)
    if (show && show.length >= 12 && view.getUint16(show.at + 10, true) & 0x0004) continue
    shown++
    const texts = entry.texts.map(readText)
    const used = new Set<number>()
    // Which of the list's texts a shape on the slide refers to, shown or hidden. A text a hidden
    // shape refers to is hidden with it, and is not read as a text that no shape showed.
    const claimed = new Set<number>()
    let title = ''
    let plain = ''
    let content = ''

    /** A stretch of text, put where its kind says: the title, a list, or paragraphs. */
    const place = (text: Text | null, placeholder: number | undefined) => {
      if (!text) return
      language ??= text.language
      // The slide's number, date, footer and header are furniture, the same on every slide.
      // Nor is anything of the notes page: its picture of the slide, and the notes.
      if (placeholder !== undefined && placeholder >= 0x05 && placeholder <= 0x0C) return
      if (text.kind === 2) return
      const isTitle = placeholder !== undefined && placeholder !== 0 ? [0x0D, 0x0F, 0x11].includes(placeholder) : text.kind === 0 || text.kind === 6
      if (isTitle) {
        if (title) return
        title = linesOf(text)
          .filter((line) => line.trim() !== '')
          .join(' ')
        // eslint-disable-next-line no-control-regex -- control characters are exactly what this removes
        plain = text.chars.replace(/[\u0000-\u001F\u007F-\u009F]+/g, ' ').replace(/\s+/g, ' ').trim()
        return
      }
      // The body of a slide makes bullets; a subtitle or a box drawn by hand does not.
      const bulleted = placeholder !== undefined && placeholder !== 0 ? [0x0E, 0x12, 0x13].includes(placeholder) : [1, 7, 8].includes(text.kind)
      content += paragraphsOf(text, bulleted)
    }

    /** The text a shape carries: its own, or the slide's list's, by number. */
    const shapeText = (box: Rec): Text | null => {
      const records = children(box)
      const ref = records.find((record) => record.type === OUTLINE_TEXT_REF)
      if (ref) {
        const index = u32(ref, 0)
        if (index >= texts.length || used.has(index)) return null
        used.add(index)
        return texts[index]!
      }
      return readText(records)
    }

    const claim = (group: Rec, depth: number): void => {
      if (depth > MAX_DEPTH) throw notOldPresentation()
      for (const shape of children(group)) {
        if (shape.type === SPGR && shape.container) claim(shape, depth + 1)
        else if (shape.type === SP && shape.container) {
          const ref = childOf(children(shape).find((record) => record.type === CLIENT_TEXTBOX), OUTLINE_TEXT_REF)
          if (ref) claimed.add(u32(ref, 0))
        }
      }
    }

    // Shapes are read in the order they are stored, which is the order a screen reader takes them.
    const walk = (group: Rec, depth: number): void => {
      if (depth > MAX_DEPTH) throw notOldPresentation()
      const shapes = children(group)
      for (const [n, shape] of shapes.entries()) {
        if (shape.type === SPGR && shape.container) {
          const own = children(shape)[0]
          // A group hidden in the editor hides all it holds.
          if (own?.type === SP && own.container && isHidden(own)) continue
          if (own && isTable(own)) content += table(shape)
          else walk(shape, depth + 1)
          continue
        }
        // The first shape of a group stands for the group itself.
        if (shape.type !== SP || !shape.container || n === 0) continue
        if (isHidden(shape)) continue
        const properties = propertiesOf(shape)
        const records = children(shape)
        // Apache POI writes the atom after a placeholder's as eight bytes long when it is one, and
        // files it made are common. Only the placeholder is wanted from here, and it comes first.
        const data = records.find((record) => record.type === CLIENT_DATA && record.container)
        const placeholder = data ? children(data, true).find((record) => record.type === PLACEHOLDER) : undefined
        const box = records.find((record) => record.type === CLIENT_TEXTBOX && record.container)
        const kind = records.find((record) => record.type === FSP)?.instance
        const pib = properties.simple.get(0x0104)
        if (kind === 75 || pib !== undefined) {
          const alt = properties.complex.get(0x0381) ?? ''
          const found = pib ? picture(pib) : null
          const address = found ? pictureAddress(new Map([[`p.${found.kind}`, found.data]]), `p.${found.kind}`, budget) : null
          if (address) content += `<p><img src="${address}" alt="${escapeHtml(alt)}"></p>`
          else if (alt) content += `<p>[Picture: ${escapeHtml(alt)}]</p>`
        }
        if (box) place(shapeText(box), placeholder && placeholder.length >= 6 ? doc[placeholder.at + 4] : undefined)
      }
    }

    /** A group of shapes that PowerPoint drew as a table: cells laid out by where each sits. */
    const isTable = (own: Rec): boolean => {
      if (own.type !== SP || !own.container) return false
      const tertiary = children(own).find((record) => record.type === TERTIARY_OPT)
      return tertiary !== undefined && propertiesOf(own, TERTIARY_OPT).simple.has(0x039F)
    }
    const table = (group: Rec): string => {
      const cells: Array<{ top: number; left: number; html: string }> = []
      for (const [n, shape] of children(group).entries()) {
        if (n === 0 || shape.type !== SP || !shape.container || isHidden(shape)) continue
        const records = children(shape)
        // Lines are the table's rules; only the cells have a place of their own and text.
        if (records.find((record) => record.type === FSP)?.instance === 20) continue
        const anchor = records.find((record) => record.type === CHILD_ANCHOR)
        if (!anchor || anchor.length < 16) continue
        const box = records.find((record) => record.type === CLIENT_TEXTBOX && record.container)
        const text = box ? shapeText(box) : null
        if (text) language ??= text.language
        const lines = text ? linesOf(text) : []
        cells.push({ top: view.getInt32(anchor.at + 4, true), left: view.getInt32(anchor.at, true), html: lines.filter((line) => line.trim() !== '').join('<br>') })
      }
      if (cells.length === 0) return ''
      const tops = [...new Set(cells.map((cell) => cell.top))].sort((a, b) => a - b)
      const lefts = [...new Set(cells.map((cell) => cell.left))].sort((a, b) => a - b)
      if (tops.length * lefts.length > 100_000) throw tooLarge()
      const row = new Map(tops.map((top, n) => [top, n]))
      const column = new Map(lefts.map((left, n) => [left, n]))
      const grid = tops.map(() => lefts.map(() => ''))
      for (const cell of cells) grid[row.get(cell.top)!]![column.get(cell.left)!] = cell.html
      // A table in a PPT does not say which of its rows are headings, and none is guessed.
      return `<table><tbody>${grid.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table>`
    }

    const drawing = childOf(childOf(inside.find((record) => record.type === DRAWING), DG), SPGR)
    if (drawing) {
      claim(drawing, 0)
      walk(drawing, 0)
    }
    // Text of the slide's list that no shape refers to, as older files keep it, is read after.
    for (const [index, text] of texts.entries()) if (!claimed.has(index)) place(text, undefined)

    if (title === '' && content === '') continue
    // Every slide is a section with a heading, so the page can be moved through slide by slide.
    const heading = title || `Slide ${shown}`
    first ??= plain || null
    written += `<section><h2>${heading}</h2>${content}</section>`
    if (written.length > MAX_WRITTEN) throw tooLarge()
  }
  if (written === '') throw new Refusal('This presentation has no text in it to convert')

  const stated = writtenBy(file).find((found) => found.label === 'Title')?.value ?? ''
  // "PowerPoint Presentation" is what PowerPoint calls a file nobody named.
  const title = stated && !/^powerpoint presentation$/i.test(stated) ? stated : first
  return {
    body: title ? `<h1>${escapeHtml(title)}</h1>${written}` : written,
    title: title ?? null,
    language: (language !== undefined && LANGUAGES[language]) || null,
  }

  /**
   * Hidden in the editor. The flag may be in either of a shape's two tables of properties, and
   * counts whether or not the bit that says it is in use is set: a shape is shown only when
   * nothing says it is hidden.
   */
  function isHidden(shape: Rec): boolean {
    return [OPT, TERTIARY_OPT].some((type) => ((propertiesOf(shape, type).simple.get(0x03BF) ?? 0) & 0x0002) !== 0)
  }

  /** A shape's properties: numbers by what they set, and the longer ones (text) by the same. */
  function propertiesOf(shape: Rec, type = OPT): { simple: Map<number, number>; complex: Map<number, string> } {
    const simple = new Map<number, number>()
    const complex = new Map<number, string>()
    const table = children(shape).find((record) => record.type === type)
    if (!table) return { simple, complex }
    const count = table.instance
    if (count * 6 > table.length) throw notOldPresentation()
    let extra = table.at + count * 6
    for (let i = 0; i < count; i++) {
      const id = view.getUint16(table.at + i * 6, true)
      const value = view.getUint32(table.at + i * 6 + 2, true)
      if (id & 0x8000) {
        // A long value's contents follow the table, in the order the values are listed.
        if (extra + value > table.at + table.length) throw notOldPresentation()
        const words = utf16(doc, extra, value)
        // A value of text ends at its first nothing, if it has one.
        complex.set(id & 0x3FFF, words.includes('\0') ? words.slice(0, words.indexOf('\0')) : words)
        extra += value
      } else simple.set(id & 0x3FFF, value)
    }
    return { simple, complex }
  }
}


function utf16(bytes: Uint8Array, at: number, length: number): string {
  let out = ''
  for (let i = 0; i + 1 < length; i += 2) out += String.fromCharCode(bytes[at + i]! | (bytes[at + i + 1]! << 8))
  return out
}
/** One letter to a byte, each byte the letter of that number. Not Windows-1252, which is what TextDecoder calls latin1. */
function latin(bytes: Uint8Array, at: number, length: number): string {
  let out = ''
  for (let i = 0; i < length; i++) out += String.fromCharCode(bytes[at + i]!)
  return out
}

/** What is true at a place in the text: the first span that ends after it. Spans are in order. */
function find<T>(spans: Array<Span<T>>, at: number): T | undefined {
  let [low, high] = [0, spans.length]
  while (low < high) {
    const middle = (low + high) >> 1
    if (spans[middle]!.end > at) high = middle
    else low = middle + 1
  }
  return spans[low]?.value
}

/** The language a stretch of text, or the whole presentation, says it is in. */
function languageOf(view: DataView, record: Rec): number | undefined {
  // For a stretch, a count of letters comes first; the default has none.
  const at = record.at + (record.type === SPECIAL_INFO ? 4 : 0)
  if (at + 4 > record.at + record.length) return undefined
  const masks = view.getUint32(at, true)
  if (!(masks & 0x2)) return undefined
  const offset = at + 4 + (masks & 0x1 ? 2 : 0)
  if (offset + 2 > record.at + record.length) return undefined
  return view.getUint16(offset, true)
}

const PAST_THE_RECORD = 'the settings run past the end of their record'

/**
 * How the text is set: for each run of paragraphs, its level and whether it has a bullet; for
 * each run of letters, whether bold or slanted. Every run says which settings follow it, and
 * each setting has a size the format fixes, so the rest are stepped over. A run that cannot be
 * stepped over ends the reading, and what follows it is set plainly.
 */
function styleOf(view: DataView, record: Rec, length: number): { paragraphs: Array<Span<Paragraph>>; runs: Array<Span<Letters>> } {
  const end = record.at + record.length
  const paragraphs: Array<Span<Paragraph>> = []
  const runs: Array<Span<Letters>> = []
  let at = record.at
  const read16 = () => {
    if (at + 2 > end) throw new RangeError(PAST_THE_RECORD)
    const value = view.getUint16(at, true)
    at += 2
    return value
  }
  const read32 = () => {
    if (at + 4 > end) throw new RangeError(PAST_THE_RECORD)
    const value = view.getUint32(at, true)
    at += 4
    return value
  }
  try {
    for (let done = 0; done < length + 1; ) {
      const count = read32()
      const indent = read16()
      const masks = read32()
      if (count === 0) break
      let bullet: boolean | undefined
      if (masks & 0x0F) {
        const flags = read16()
        if (masks & 0x01) bullet = (flags & 0x01) !== 0
      }
      if (masks & 0x0080) at += 2 // the bullet's letter
      if (masks & 0x0010) at += 2 // its font
      if (masks & 0x0040) at += 2 // its size
      if (masks & 0x0020) at += 4 // its colour
      if (masks & 0x0800) at += 2 // alignment
      if (masks & 0x1000) at += 2 // line spacing
      if (masks & 0x2000) at += 2 // space before
      if (masks & 0x4000) at += 2 // space after
      if (masks & 0x0100) at += 2 // left margin
      if (masks & 0x0400) at += 2 // indent
      if (masks & 0x8000) at += 2 // tab size
      if (masks & 0x100000) at += 4 * read16() // tab stops
      if (masks & 0x10000) at += 2 // font alignment
      if (masks & 0xE0000) at += 2 // wrapping
      if (masks & 0x200000) at += 2 // direction
      if (at > end) throw new RangeError(PAST_THE_RECORD)
      done += count
      paragraphs.push({ end: done, value: { indent: Math.min(indent, 8), bullet } })
    }
    for (let done = 0; done < length + 1; ) {
      const count = read32()
      const masks = read32()
      if (count === 0) break
      let style = 0
      if (masks & 0x3EB7) style = read16()
      if (masks & 0x10000) at += 2 // font
      if (masks & 0x200000) at += 2 // East Asian font
      if (masks & 0x400000) at += 2 // the plain font
      if (masks & 0x800000) at += 2 // symbol font
      if (masks & 0x20000) at += 2 // size
      if (masks & 0x40000) at += 4 // colour
      if (masks & 0x80000) at += 2 // raised or lowered
      if (at > end) throw new RangeError(PAST_THE_RECORD)
      done += count
      runs.push({ end: done, value: { bold: (masks & 0x1) !== 0 && (style & 0x1) !== 0, italic: (masks & 0x2) !== 0 && (style & 0x2) !== 0 } })
    }
  } catch (error) {
    if (!(error instanceof RangeError)) throw error
  }
  return { paragraphs, runs }
}

/** A picture's file, from the record that holds it: PNG and JPEG are kept, and only when they are what they say. */
function blipOf(bytes: Uint8Array, at: number, end: number): Blip {
  if (at + 8 > end || at < 0) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const instance = view.getUint16(at, true) >> 4
  const type = view.getUint16(at + 2, true)
  const length = view.getUint32(at + 4, true)
  if (at + 8 + length > end) return null
  // Each kind of picture has one or two numbers for itself; the second means a second 16-byte id.
  const kinds: Record<number, { kind: 'png' | 'jpg'; one: number; two: number[] }> = {
    0xF01E: { kind: 'png', one: 0x6E0, two: [0x6E1] },
    0xF01D: { kind: 'jpg', one: 0x46A, two: [0x46B, 0x6E3] },
  }
  const known = kinds[type]
  if (!known) return null
  const skip = 16 + (known.two.includes(instance) ? 16 : 0) + 1
  if (length < skip) return null
  const data = bytes.subarray(at + 8 + skip, at + 8 + length)
  const png = data.length > 8 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4E && data[3] === 0x47
  const jpg = data.length > 3 && data[0] === 0xFF && data[1] === 0xD8 && data[2] === 0xFF
  if ((known.kind === 'png' && !png) || (known.kind === 'jpg' && !jpg)) return null
  return { data, kind: known.kind }
}
