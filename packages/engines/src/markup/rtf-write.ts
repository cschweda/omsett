import { readDimensions } from '@omsett/detect'
import { Refusal } from '../util'

// HTML → RTF. The page has already been read into a tree and cleaned; this writes that tree as
// RTF, as the DOCX and ODT writers write theirs. What a reader relies on is written as the real
// thing: a heading is a paragraph at its level in the outline, a list is a list (Word's list
// tables, not lines that begin with a bullet), a table's first row is marked as its headings,
// the document says its title and language, and a picture inside the page goes into it.
//
// Every letter past those of plain English is written by its number, so the file is plain
// ASCII whatever the page is in. Nothing is fetched: a picture kept on a website is written as
// its description and address.

interface Hast {
  type: string
  tagName?: string
  value?: string
  properties?: Record<string, unknown>
  children?: Hast[]
}

interface Run {
  bold?: boolean
  italic?: boolean
  strike?: boolean
  code?: boolean
  raised?: 'super' | 'sub'
}

const MAX_DEPTH = 64
/** Twentieths of a point to a pixel, at 96 to the inch: what RTF measures pictures in. */
const TWIPS = 15
/** The widest a picture may be on the page, in pixels: six inches. */
const MAX_PICTURE_WIDTH = 576

/** Windows's number for a language, for the few most documents are written in. */
const LANGUAGE_IDS: Record<string, number> = {
  'en-us': 0x0409, 'en-gb': 0x0809, 'en-au': 0x0C09, 'en-ca': 0x1009, en: 0x0409, fr: 0x040C, 'fr-ca': 0x0C0C, de: 0x0407, es: 0x040A, 'es-mx': 0x080A,
  it: 0x0410, nl: 0x0413, nb: 0x0414, nn: 0x0814, sv: 0x041D, da: 0x0406, fi: 0x040B, 'pt-br': 0x0416, pt: 0x0816, pl: 0x0415,
  ru: 0x0419, uk: 0x0422, cs: 0x0405, hu: 0x040E, el: 0x0408, tr: 0x041F, he: 0x040D, ar: 0x0401, ja: 0x0411, ko: 0x0412, 'zh-cn': 0x0804, 'zh-tw': 0x0404, zh: 0x0804,
}

/** Letters as RTF writes them: its own marks escaped, and every letter past ASCII by its number, with no stand-in. */
function letters(text: string): string {
  let out = ''
  for (const char of text) {
    const code = char.codePointAt(0)!
    if (char === '\\' || char === '{' || char === '}') out += `\\${char}`
    else if (code === 0x09) out += '\\tab '
    else if (code < 0x20 || code === 0x7F) continue
    else if (code < 0x80) out += char
    else if (code < 0x10000) out += `\\u${code < 32768 ? code : code - 65536} `
    else {
      // Past the first plane a letter is two halves, as UTF-16 writes it.
      const rest = code - 0x10000
      for (const half of [0xD800 + (rest >> 10), 0xDC00 + (rest & 0x3FF)]) out += `\\u${half - 65536} `
    }
  }
  return out
}

export function writeRtf(tree: Hast, title: string, language: string): Uint8Array {
  const run = (value: string, look: Run) => {
    if (value === '') return ''
    const marks = `${look.bold ? '\\b' : ''}${look.italic ? '\\i' : ''}${look.strike ? '\\strike' : ''}${look.code ? '\\f1' : ''}${look.raised === 'super' ? '\\super' : look.raised === 'sub' ? '\\sub' : ''}`
    const body = value
      .split('\n')
      .map((line) => letters(line))
      .join('\\line ')
    return marks ? `{${marks} ${body}}` : body
  }

  function picture(node: Hast, look: Run): string {
    const src = String(node.properties?.src ?? '')
    const alt = String(node.properties?.alt ?? '')
    const words = `[Picture${alt ? `: ${alt}` : ''}]`
    const inside = /^data:image\/(png|jpeg);base64,([a-z0-9+/=\s]+)$/i.exec(src)
    if (!inside) return /^https?:\/\//i.test(src) ? link(run(words, look), src) : run(words, look)
    let data: Uint8Array
    try {
      data = Uint8Array.from(atob(inside[2]!.replace(/\s+/g, '')), (char) => char.codePointAt(0)!)
    } catch {
      return run(words, look)
    }
    const kind = inside[1]!.toLowerCase()
    const size = readDimensions(kind === 'jpeg' ? 'jpg' : 'png', data.subarray(0, 512 * 1024))
    if (!size || size.width < 1 || size.height < 1) return run(words, look)
    const scale = Math.min(1, MAX_PICTURE_WIDTH / size.width)
    let hex = ''
    for (const byte of data) hex += byte.toString(16).padStart(2, '0')
    // RTF has nowhere to keep a picture's description, so it is written after it, as its words.
    return (
      `{\\pict\\${kind === 'png' ? 'pngblip' : 'jpegblip'}\\picw${size.width}\\pich${size.height}\\picwgoal${Math.round(size.width * scale * TWIPS)}\\pichgoal${Math.round(size.height * scale * TWIPS)} ${hex}}` +
      (alt ? run(` [${alt}]`, look) : '')
    )
  }

  const link = (inner: string, href: string) => `{\\field{\\*\\fldinst{HYPERLINK "${href.replace(/[\\"{}]/g, (char) => `\\${char}`)}"}}{\\fldrslt{\\ul ${inner}}}}`

  function inline(nodes: Hast[], look: Run, depth: number, keepSpace = false): string {
    if (depth > MAX_DEPTH) throw new Refusal('This file is nested too deeply to convert')
    let out = ''
    for (const node of nodes) {
      if (node.type === 'text') {
        out += run(keepSpace ? (node.value ?? '') : (node.value ?? '').replace(/\s+/g, ' '), look)
        continue
      }
      if (node.type !== 'element') continue
      const kids = node.children ?? []
      switch (node.tagName) {
        case 'strong':
        case 'b':
          out += inline(kids, { ...look, bold: true }, depth + 1, keepSpace)
          break
        case 'em':
        case 'i':
          out += inline(kids, { ...look, italic: true }, depth + 1, keepSpace)
          break
        case 'del':
        case 's':
          out += inline(kids, { ...look, strike: true }, depth + 1, keepSpace)
          break
        case 'code':
        case 'kbd':
        case 'samp':
          out += inline(kids, { ...look, code: true }, depth + 1, keepSpace)
          break
        case 'sup':
          out += inline(kids, { ...look, raised: 'super' }, depth + 1, keepSpace)
          break
        case 'sub':
          out += inline(kids, { ...look, raised: 'sub' }, depth + 1, keepSpace)
          break
        case 'br':
          out += '\\line '
          break
        case 'img':
          out += picture(node, look)
          break
        case 'a': {
          const href = String(node.properties?.href ?? '')
          const inner = inline(kids, look, depth + 1, keepSpace)
          // Only an address on the web or for mail becomes a link. Anything else is its words.
          out += /^(?:https?:\/\/|mailto:)/i.test(href) ? link(inner, href) : inner
          break
        }
        case 'input':
          out += run(node.properties?.checked ? '☑ ' : '☐ ', look)
          break
        default:
          out += inline(kids, look, depth + 1, keepSpace)
      }
    }
    return out
  }

  const INLINE = new Set(['a', 'b', 'strong', 'i', 'em', 'del', 's', 'code', 'kbd', 'samp', 'sup', 'sub', 'br', 'img', 'span', 'input', 'u', 'small', 'mark', 'abbr', 'cite', 'q', 'time', 'var'])
  const isInline = (node: Hast) => node.type === 'text' || (node.type === 'element' && INLINE.has(node.tagName ?? ''))
  const paragraph = (inner: string, settings = '') => `{\\pard\\plain\\sa160 ${settings}${inner}\\par}\n`

  // Each list is a list of Word's, with its own number, so that each numbered list counts from 1.
  const lists: Array<{ ordered: boolean }> = []

  function blocks(nodes: Hast[], depth: number, settings = ''): string {
    if (depth > MAX_DEPTH) throw new Refusal('This file is nested too deeply to convert')
    let out = ''
    let loose: Hast[] = []
    const flush = () => {
      if (loose.some((node) => node.type !== 'text' || (node.value ?? '').trim() !== '')) out += paragraph(inline(loose, {}, depth), settings)
      loose = []
    }
    for (const node of nodes) {
      if (isInline(node)) {
        loose.push(node)
        continue
      }
      if (node.type !== 'element') continue
      flush()
      const kids = node.children ?? []
      const tag = node.tagName ?? ''
      const heading = /^h([1-6])$/.exec(tag)
      if (heading) {
        const level = Number(heading[1])
        // A heading is a paragraph at its level in the outline, which is what makes it a heading.
        out += paragraph(`{\\b\\fs${[0, 36, 32, 28, 26, 24, 24][level]} ${inline(kids, {}, depth + 1)}}`, `\\s${level}\\outlinelevel${level - 1}\\keepn `)
      } else if (tag === 'p') out += paragraph(inline(kids, {}, depth + 1), settings)
      else if (tag === 'blockquote') out += blocks(kids, depth + 1, '\\s20\\li720\\ri720 ')
      else if (tag === 'pre') out += paragraph(inline(kids, { code: true }, depth + 1, true), settings)
      else if (tag === 'hr') out += paragraph('', '\\brdrb\\brdrs\\brdrw10\\brsp20 ')
      else if (tag === 'ul' || tag === 'ol') out += list(node, depth + 1, 0, null)
      else if (tag === 'table') out += table(node, depth + 1)
      else out += blocks(kids, depth + 1, settings)
    }
    flush()
    return out
  }

  function list(node: Hast, depth: number, level: number, inherited: number | null): string {
    if (depth > MAX_DEPTH) throw new Refusal('This file is nested too deeply to convert')
    const ordered = node.tagName === 'ol'
    // A list inside a list belongs to it, at the next level, as Word keeps one; a list of the other kind is a list of its own.
    let id = inherited
    if (id === null || lists[id - 1]!.ordered !== ordered) {
      lists.push({ ordered })
      id = lists.length
    }
    let out = ''
    let number = 0
    for (const item of (node.children ?? []).filter((kid) => kid.type === 'element' && kid.tagName === 'li')) {
      number++
      const parts = item.children ?? []
      const nested = parts.filter((part) => part.type === 'element' && (part.tagName === 'ul' || part.tagName === 'ol'))
      const own = parts.filter((part) => !nested.includes(part))
      // What Word shows as the item's number or bullet, and what a reader that knows nothing of lists shows.
      const mark = ordered ? `${number}.` : ['\\u8226 ', '\\u9702 ', '\\u9642 '][level % 3]!
      const listed = `\\ls${id}\\ilvl${Math.min(8, level)}\\fi-360\\li${720 * (level + 1)} {\\listtext ${mark}\\tab}`
      out += paragraph(own.every(isInline) ? inline(own, {}, depth + 1) : blocks(own, depth + 1).replace(/\{\\pard\\plain\\sa160 |\\par\}\n/g, ''), listed)
      for (const inner of nested) out += list(inner, depth + 1, Math.min(8, level + 1), id)
    }
    return out
  }

  function table(node: Hast, depth: number): string {
    const rows: Array<{ header: boolean; cells: Hast[] }> = []
    const collect = (nodes: Hast[], header: boolean, level: number) => {
      if (level > MAX_DEPTH) return
      for (const kid of nodes) {
        if (kid.type !== 'element') continue
        if (kid.tagName === 'tr') {
          const cells = (kid.children ?? []).filter((cell) => cell.type === 'element' && ['td', 'th'].includes(cell.tagName ?? ''))
          if (cells.length > 0) rows.push({ header: header || cells.every((cell) => cell.tagName === 'th'), cells })
        } else if (['thead', 'tbody', 'tfoot'].includes(kid.tagName ?? '')) collect(kid.children ?? [], kid.tagName === 'thead', level + 1)
      }
    }
    collect(node.children ?? [], false, 0)
    if (rows.length === 0) return ''
    const width = Math.max(...rows.map((row) => row.cells.length))
    const column = Math.floor(9360 / width)
    let out = ''
    for (const [n, row] of rows.entries()) {
      // A row marked to repeat at the top of each page is what says these are the table's headings.
      const head = row.header && rows.slice(0, n).every((before) => before.header)
      out += `\\trowd\\trgaph108${head ? '\\trhdr' : ''}${Array.from({ length: width }, (_, i) => `\\clbrdrt\\brdrs\\clbrdrl\\brdrs\\clbrdrb\\brdrs\\clbrdrr\\brdrs\\cellx${column * (i + 1)}`).join('')}\n`
      for (let i = 0; i < width; i++) {
        const cell = row.cells[i]
        const inner = cell ? inline(cell.children ?? [], head ? { bold: true } : {}, depth + 1) : ''
        out += `\\pard\\intbl ${inner}\\cell\n`
      }
      out += '\\row\n'
    }
    return `${out}\\pard\n`
  }

  const find = (node: Hast, tag: string, depth = 0): Hast | null => {
    if (node.type === 'element' && node.tagName === tag) return node
    if (depth > 8) return null
    for (const kid of node.children ?? []) {
      const found = find(kid, tag, depth + 1)
      if (found) return found
    }
    return null
  }
  const body = blocks((find(tree, 'body') ?? tree).children ?? [], 0)
  if (body.replace(/\{\\pard\\plain\\sa160 |\\par\}|[\s{}]|\\[a-z]+-?\d* ?/g, '') === '' && !body.includes('\\pict')) throw new Refusal('This file has no text in it to convert')

  const tag = language.toLowerCase()
  const lid = LANGUAGE_IDS[tag] ?? LANGUAGE_IDS[tag.split('-')[0]!] ?? 0x0409
  const levels = (ordered: boolean) =>
    Array.from({ length: 9 }, (_, i) =>
      ordered
        ? `{\\listlevel\\levelnfc${[0, 4, 2][i % 3]}\\leveljc0\\levelfollow0\\levelstartat1{\\leveltext\\'02\\'0${i}.;}{\\levelnumbers\\'01;}\\fi-360\\li${720 * (i + 1)}}`
        : `{\\listlevel\\levelnfc23\\leveljc0\\levelfollow0\\levelstartat1{\\leveltext\\'01${['\\u8226 ?', '\\u9702 ?', '\\u9642 ?'][i % 3]};}{\\levelnumbers;}\\fi-360\\li${720 * (i + 1)}}`,
    ).join('')
  const listTable =
    `{\\*\\listtable${lists.map((found, n) => `{\\list\\listtemplateid${n + 1}${levels(found.ordered)}\\listid${n + 1}}`).join('')}}\n` +
    `{\\*\\listoverridetable${lists.map((_, n) => `{\\listoverride\\listid${n + 1}\\listoverridecount0\\ls${n + 1}}`).join('')}}\n`
  const styles =
    `{\\stylesheet{\\s0 Normal;}` +
    [1, 2, 3, 4, 5, 6].map((level) => `{\\s${level}\\outlinelevel${level - 1}\\b\\keepn\\sbasedon0\\snext0 heading ${level};}`).join('') +
    `{\\s20\\li720\\ri720\\i\\sbasedon0\\snext0 Quote;}}\n`
  const text =
    `{\\rtf1\\ansi\\ansicpg1252\\uc0\\deff0\\deflang${lid}{\\fonttbl{\\f0\\fswiss Helvetica;}{\\f1\\fmodern Courier New;}}\n` +
    styles +
    (lists.length ? listTable : '') +
    // A document with a title is announced by it, in the language it is written in.
    `{\\info{\\title ${letters(title)}}}\n\\lang${lid}\n` +
    body +
    '}\n'
  return new TextEncoder().encode(text)
}
