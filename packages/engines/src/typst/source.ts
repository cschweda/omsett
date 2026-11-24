import { readDimensions } from '@omsett/detect'

// A page, already read into a tree and cleaned, written as a program for Typst, which lays it
// out as a PDF. What a reader relies on is given to Typst as the real thing, so that it is
// tagged as that in the PDF: a heading is a heading at its level, a list is a list, the head
// of a table is marked as its head, a picture carries its description, and the document says
// its title and its language.
//
// Typst's language can run code, and a document is a stranger's words. So no word from the
// page is ever written as Typst markup. Every one is written as a quoted string, an argument
// to a function this file chose; inside the quotes only two characters mean anything, and
// both are escaped. Nothing in a document can be read as an instruction.

export interface Hast {
  type: string
  tagName?: string
  value?: string
  properties?: Record<string, unknown>
  children?: Hast[]
}

export interface Written {
  /** The program. */
  source: string
  /** Pictures the program names, by the name it gives them. */
  files: Map<string, Uint8Array>
  /** Letters the typeface has no drawing for, in the order met: a few, to name in the result. */
  missing: string[]
  /** How many letters the page has, and how many of them the typeface cannot draw. */
  letters: number
  undrawn: number
  /** Pictures that live on a website, and so are not in the PDF. */
  elsewhere: number
}

const MAX_DEPTH = 64
/** The most pictures laid out, and the most bytes of them together. */
const MAX_PICTURES = 500
const MAX_PICTURE_BYTES = 48 * 1024 * 1024
/** The widest a picture is set, in points: the width of the text on the narrower of the two papers. */
const MAX_PICTURE_WIDTH = 450
const TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' }
const BLOCKS = new Set(['p', 'div', 'section', 'article', 'main', 'header', 'footer', 'aside', 'nav', 'figure', 'figcaption', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'table', 'blockquote', 'pre', 'hr', 'dl', 'dt', 'dd', 'details', 'summary', 'address', 'body', 'html'])

/** Text as a Typst string: quoted, with the two characters that mean something inside quotes escaped. */
export function quoted(text: string): string {
  let out = '"'
  for (const letter of text) {
    const code = letter.codePointAt(0)!
    if (letter === '\\') out += '\\\\'
    else if (letter === '"') out += '\\"'
    // Anything that is not a letter to print is written by its number.
    else if (code < 0x20 || code === 0x7F || (code >= 0x2028 && code <= 0x202F) || (code >= 0x2066 && code <= 0x2069)) out += `\\u{${code.toString(16)}}`
    else out += letter
  }
  return `${out}"`
}

/** The scripts the typeface draws: Latin, Greek, Cyrillic, and the marks and symbols used with them. */
const DRAWN = /[\u0020-\u052F\u1E00-\u1FFF\u2000-\u206F\u20A0-\u20BF\u2100-\u2122\u2190-\u2193\u2212\u2260-\u2265\uFB00-\uFB04\uFEFF]/u

export function writeTypst(tree: Hast, title: string, language: string): Written {
  const files = new Map<string, Uint8Array>()
  const missing: string[] = []
  let elsewhere = 0
  let pictureBytes = 0

  let letters = 0
  let undrawn = 0
  const text = (value: string) => {
    for (const letter of value) {
      if (letter.trim() === '') continue
      letters++
      if (DRAWN.test(letter)) continue
      undrawn++
      if (missing.length < 12 && !missing.includes(letter)) missing.push(letter)
    }
    return quoted(value)
  }
  const join = (parts: string[]) => (parts.length === 0 ? '""' : parts.length === 1 ? parts[0]! : `(${parts.join(' + ')})`)
  const words = (node: Hast): string => (node.type === 'text' ? node.value ?? '' : (node.children ?? []).map(words).join(''))
  const address = (value: unknown) => (typeof value === 'string' && /^(?:https?:|mailto:)/i.test(value.trim()) ? value.trim() : null)

  function picture(node: Hast): string | null {
    const source = typeof node.properties?.src === 'string' ? node.properties.src : ''
    const alt = typeof node.properties?.alt === 'string' ? node.properties.alt.trim() : ''
    const found = /^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i.exec(source)
    const ending = found ? TYPES[found[1]!.toLowerCase()] : undefined
    if (!found || !ending || files.size >= MAX_PICTURES) {
      // A picture that is somewhere else is not fetched. Its description stands in for it.
      if (source) elsewhere++
      return alt ? `emph(${text(`Picture: ${alt}`)})` : null
    }
    let bytes: Uint8Array
    try {
      bytes = Uint8Array.from(atob(found[2]!.replace(/\s+/g, '')), (letter) => letter.charCodeAt(0))
    } catch {
      return alt ? `emph(${text(`Picture: ${alt}`)})` : null
    }
    pictureBytes += bytes.length
    if (pictureBytes > MAX_PICTURE_BYTES) return alt ? `emph(${text(`Picture: ${alt}`)})` : null
    const name = `/picture-${files.size + 1}.${ending}`
    files.set(name, bytes)
    // As wide as it is, at 96 pixels to the inch, and never wider than the text on the page. It
    // is set in a box, which is how Typst takes a picture in the middle of a line; put any
    // other way inside a paragraph, it is silently left out.
    const size = readDimensions(ending === 'jpg' ? 'jpg' : ending, bytes.subarray(0, 65536))
    const wide = size && size.width > 0 ? `${Math.min(MAX_PICTURE_WIDTH, Math.round(size.width * 0.75))}pt` : '60%'
    return `box(image(${quoted(name)}, ${alt ? `alt: ${text(alt)}, ` : ''}width: ${wide}))`
  }

  /** What sits inside a line: letters and what is done to them. */
  function inline(nodes: Hast[], depth: number): string[] {
    if (depth > MAX_DEPTH) return []
    const out: string[] = []
    for (const node of nodes) {
      if (node.type === 'text') {
        const value = (node.value ?? '').replace(/\s+/g, ' ')
        if (value !== '') out.push(text(value))
        continue
      }
      if (node.type !== 'element') continue
      const kids = () => join(inline(node.children ?? [], depth + 1))
      const tag = node.tagName ?? ''
      if (tag === 'br') out.push('linebreak()')
      else if (tag === 'img') {
        const made = picture(node)
        if (made) out.push(made)
      } else if (tag === 'strong' || tag === 'b') out.push(`strong(${kids()})`)
      else if (tag === 'em' || tag === 'i' || tag === 'cite' || tag === 'dfn' || tag === 'var') out.push(`emph(${kids()})`)
      else if (tag === 'del' || tag === 's' || tag === 'strike') out.push(`strike(${kids()})`)
      else if (tag === 'sup') out.push(`super(${kids()})`)
      else if (tag === 'sub') out.push(`sub(${kids()})`)
      else if (tag === 'code' || tag === 'kbd' || tag === 'samp' || tag === 'tt') out.push(`raw(${text(words(node))})`)
      else if (tag === 'a') {
        const to = address(node.properties?.href)
        out.push(to ? `link(${quoted(to)}, ${kids()})` : kids())
      } else out.push(...inline(node.children ?? [], depth + 1))
    }
    return out
  }

  /** A list, with the lists inside its items. */
  function list(node: Hast, depth: number): string {
    const items = (node.children ?? []).filter((kid) => kid.type === 'element' && kid.tagName === 'li')
    const made = items.map((item) => {
      const parts: string[] = []
      const line: Hast[] = []
      const flush = () => {
        const content = inline(line.splice(0), depth + 1)
        if (content.length) parts.push(join(content))
      }
      for (const kid of item.children ?? []) {
        if (kid.type === 'element' && (kid.tagName === 'ul' || kid.tagName === 'ol')) {
          flush()
          if (depth < MAX_DEPTH) parts.push(list(kid, depth + 1))
        } else if (kid.type === 'element' && BLOCKS.has(kid.tagName ?? '') && kid.tagName !== 'p') {
          flush()
          parts.push(...blocks([kid], depth + 1))
        } else if (kid.type === 'element' && kid.tagName === 'p') {
          flush()
          const content = inline(kid.children ?? [], depth + 1)
          if (content.length) parts.push(parts.length ? `parbreak() + ${join(content)}` : join(content))
        } else line.push(kid)
      }
      flush()
      return join(parts)
    })
    if (made.length === 0) return '""'
    return `${node.tagName === 'ol' ? 'enum' : 'list'}(${made.join(', ')})`
  }

  function table(node: Hast, depth: number): string {
    const rows: Array<{ head: boolean; cells: string[] }> = []
    const visit = (parent: Hast, inHead: boolean) => {
      for (const kid of parent.children ?? []) {
        if (kid.type !== 'element') continue
        if (kid.tagName === 'thead') visit(kid, true)
        else if (kid.tagName === 'tbody' || kid.tagName === 'tfoot') visit(kid, false)
        else if (kid.tagName === 'tr') {
          const cells = (kid.children ?? []).filter((cell) => cell.type === 'element' && (cell.tagName === 'td' || cell.tagName === 'th'))
          if (cells.length === 0) continue
          // A row is a heading for the rows below if the page says so, or if every cell in the first row is a heading cell.
          const head = inHead || (rows.length === 0 && cells.every((cell) => cell.tagName === 'th'))
          rows.push({ head, cells: cells.map((cell) => join(cell.children?.some((part) => part.type === 'element' && BLOCKS.has(part.tagName ?? '')) ? blocks(cell.children ?? [], depth + 1) : inline(cell.children ?? [], depth + 1))) })
        }
      }
    }
    visit(node, false)
    const width = Math.min(rows.reduce((most, row) => Math.max(most, row.cells.length), 0), 64)
    if (width === 0) return '""'
    const filled = (row: { cells: string[] }) => Array.from({ length: width }, (_, i) => `[#${row.cells[i] ?? '""'}]`).join(', ')
    const head = rows.filter((row, i) => row.head && rows.slice(0, i).every((before) => before.head))
    const rest = rows.slice(head.length)
    return `table(columns: ${width}, ${head.length ? `table.header(${head.map(filled).join(', ')}), ` : ''}${rest.map(filled).join(', ')})`
  }

  /** What stands by itself on the page: headings, paragraphs, lists, tables. */
  function blocks(nodes: Hast[], depth: number): string[] {
    if (depth > MAX_DEPTH) return []
    const out: string[] = []
    const line: Hast[] = []
    const flush = () => {
      const content = inline(line.splice(0), depth + 1)
      if (content.length && content.join('') !== '" "') out.push(`par(${join(content)})`)
    }
    for (const node of nodes) {
      const tag = node.type === 'element' ? node.tagName ?? '' : ''
      if (!BLOCKS.has(tag)) {
        line.push(node)
        continue
      }
      flush()
      const level = /^h([1-6])$/.exec(tag)
      if (level) {
        const content = inline(node.children ?? [], depth + 1)
        if (content.length) out.push(`heading(level: ${level[1]}, ${join(content)})`)
      } else if (tag === 'p' || tag === 'dt' || tag === 'summary' || tag === 'figcaption' || tag === 'address') {
        const content = inline(node.children ?? [], depth + 1)
        if (content.length) out.push(tag === 'dt' ? `par(strong(${join(content)}))` : `par(${join(content)})`)
      } else if (tag === 'ul' || tag === 'ol') out.push(list(node, depth + 1))
      else if (tag === 'table') out.push(table(node, depth + 1))
      else if (tag === 'blockquote') out.push(`quote(block: true, ${join(blocks(node.children ?? [], depth + 1))})`)
      else if (tag === 'pre') out.push(`raw(${text(words(node))}, block: true)`)
      else if (tag === 'hr') out.push('line(length: 100%, stroke: 0.5pt)')
      else out.push(...blocks(node.children ?? [], depth + 1))
    }
    flush()
    return out
  }

  const body = blocks(tree.children ?? [], 0)
  // "en-US" is a language and a region; Typst takes them apart.
  const [tongue, region] = language.toLowerCase().split('-')
  const letter = /^(?:us|ca|mx|ph|co|cl|ve|gt|cr|pa|do)$/.test(region ?? '')
  const source = [
    `#set document(title: ${quoted(title)}, author: (), date: none)`,
    `#set text(lang: ${quoted(/^[a-z]{2,3}$/.test(tongue ?? '') ? tongue! : 'en')}${/^[a-z]{2}$/.test(region ?? '') ? `, region: ${quoted(region!.toUpperCase())}` : ''}, font: "Inter", size: 11pt)`,
    `#set page(paper: ${letter ? '"us-letter"' : '"a4"'}, margin: 2.5cm, numbering: "1")`,
    '#set par(leading: 0.7em, spacing: 1.1em)',
    '#set heading(numbering: none)',
    '#show heading: set block(above: 1.4em, below: 0.7em)',
    '#show link: underline',
    '#show raw: set text(font: "Inter", size: 10pt)',
    '#set table(stroke: 0.5pt + luma(140), inset: 6pt)',
    '#show table.header: set text(weight: "bold")',
    // Marks the typeface has drawings for, at every depth of a list.
    '#set list(marker: ([\u{2022}], [\u{2013}]), indent: 0.6em)',
    '#set enum(indent: 0.6em)',
    '#set quote(block: true)',
    ...body.map((block) => `#${block}`),
  ].join('\n')
  return { source, files, missing, elsewhere, letters, undrawn }
}
