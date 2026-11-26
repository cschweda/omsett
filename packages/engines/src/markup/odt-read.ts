import { Refusal } from '../util'
import { attrs, child, escapeHtml, kids, MAX_PICTURE_BYTES, openOffice, pictureAddress, tagOf, type Node, type ReadDocument } from './docx-read'

// OpenDocument text (ODT) → HTML: the document LibreOffice, OpenOffice and many government
// offices save. Like a DOCX it is a ZIP of XML, read through the same `openOffice`, so the
// archive's limits hold and any part that declares a DOCTYPE is refused. One part is the text;
// its styles say which runs are bold or slanted and which are hidden, and its list styles say
// which lists are numbered. What is read is what a reader of the page relies on: headings as
// headings, lists as lists at their levels, table headers as headers, links, and each picture
// with the description its author gave it.
//
// What the author took out or kept aside is left out: text deleted with changes tracked (kept
// apart from the text, in a list of changes), comments, notes, hidden text, hidden paragraphs
// and hidden sections. Nothing in the file is run: scripts and macros are not opened.

export const notOdt = () => new Refusal('This file is not a valid ODT document')
const MAX_DEPTH = 64
/** The most spaces one mark may stand for. */
const MAX_SPACES = 100
/** The most columns a table is counted to. */
const MAX_COLUMNS = 16384

/** OpenDocument's own vocabularies. A name in any other is foreign, and never taken for one of these. */
export const ODF = new Set(['office', 'style', 'text', 'table', 'drawing', 'xsl-fo-compatible', 'svg-compatible', 'meta', 'datastyle', 'presentation', 'chart', 'dr3d', 'form', 'script', 'smil', 'anim'].map((name) => `urn:oasis:names:tc:opendocument:xmlns:${name}:1.0`))
for (const uri of ['http://www.w3.org/1999/xlink', 'http://purl.org/dc/elements/1.1/', 'urn:oasis:names:tc:opendocument:xmlns:manifest:1.0']) ODF.add(uri)

const TYPES = new Set(['application/vnd.oasis.opendocument.text', 'application/vnd.oasis.opendocument.text-template'])
/** Inside a paragraph: what is never part of the text as it is read. */
const SET_ASIDE = new Set(['note', 'annotation', 'annotation-end', 'hidden-text', 'hidden-paragraph', 'script', 'tracked-changes', 'event-listeners', 'change', 'change-start', 'change-end', 'bookmark', 'bookmark-start', 'bookmark-end', 'reference-mark', 'reference-mark-start', 'reference-mark-end', 'soft-page-break', 'changed-region', 'deletion', 'title', 'desc'])
/** Lists of contents and indexes, whose words are on the page, kept inside a body of their own. */
const INDEXES = new Set(['table-of-content', 'alphabetical-index', 'user-index', 'illustration-index', 'table-index', 'object-index', 'bibliography'])

interface Style {
  family: string
  parent?: string
  bold?: boolean
  italic?: boolean
  hidden?: boolean
  /** The list style a paragraph style gives the lists its paragraphs are in. */
  list?: string
}
interface Piece {
  text: string
  /** The tags around it, outermost first: 'strong', 'em', 'a:https://…'. */
  marks: string[]
}

/** An OpenDocument file opened, and the readers of its text that every kind shares. */
export interface Odf {
  content: Node
  root: (path: string, tag: string) => Node | undefined
  /** Paragraphs, headings, lists, tables and boxes → HTML. `tight`: inside a cell or an item, one paragraph needs no <p>. */
  blocks(nodes: Node[], depth: number, tight?: boolean): string
  /** One paragraph's words, with their emphasis and links. */
  inline(paragraph: Node): string
  /** A picture inside the file, or its description in its place. */
  picture(frame: Node): string
  /** Whether a style of a family hides, or makes bold or slanted, what it is given. */
  said(family: string, name: string | undefined, what: 'bold' | 'italic' | 'hidden'): boolean | undefined
  /** The title and language the file gives itself. */
  meta(): { title: string | null; language: string | null }
}

/**
 * Open an OpenDocument file of one of `types`: its parts, its styles, and the readers of its
 * text. A text document and a presentation's boxes are read by the same code.
 * @param bytes the file
 * @param types the types it may say it is
 * @param invalid the refusal for a file that is not one
 * @param what what to call it in a refusal: "document", "presentation"
 */
export async function openOdf(bytes: Uint8Array, types: ReadonlySet<string>, invalid: () => Refusal, what: string): Promise<Odf> {
  const { parts, root } = await openOffice(bytes, invalid, what, ODF)
  const type = new TextDecoder().decode(parts.get('mimetype') ?? new Uint8Array()).trim()
  if (!types.has(type)) throw invalid()
  // A file saved with a password keeps its parts scrambled, and says so in its list of parts.
  const manifest = new TextDecoder().decode(parts.get('meta-inf/manifest.xml') ?? new Uint8Array())
  if (/encryption-data/.test(manifest)) throw new Refusal(`This ${what} is locked with a password, and cannot be read without it`)
  const content = root('content.xml', 'document-content')
  if (!content) throw invalid()
  const styled = root('styles.xml', 'document-styles')

  // --- Styles: what each says of its text, and which it takes the rest from -----------------
  const styles = new Map<string, Style>()
  const listStyles = new Map<string, Node>()
  const learn = (from: Node | undefined) => {
    for (const node of kids(from ?? {})) {
      const a = attrs(node)
      if (tagOf(node) === 'list-style' && a['@name']) listStyles.set(a['@name'], node)
      if (tagOf(node) !== 'style' || !a['@name']) continue
      const props = attrs(child(node, 'text-properties') ?? {})
      styles.set(`${a['@family']}:${a['@name']}`, {
        family: a['@family'] ?? '',
        parent: a['@parent-style-name'],
        bold: props['@font-weight'] === undefined ? undefined : /^(?:bold|[6-9]00)$/.test(props['@font-weight']),
        italic: props['@font-style'] === undefined ? undefined : /^(?:italic|oblique)$/.test(props['@font-style']),
        // Shown only on a condition the document sets is hidden here, as a section on a condition is.
        hidden: props['@display'] === undefined ? undefined : ['none', 'condition'].includes(props['@display']),
        list: a['@list-style-name'],
      })
    }
  }
  // Named styles first, then the document's own, which may share a name and take its place.
  learn(child(styled ?? {}, 'styles'))
  learn(child(styled ?? {}, 'automatic-styles'))
  learn(child(content, 'automatic-styles'))
  /** What a style says, or the style it is based on, of one thing. A circle of styles says nothing. */
  const said = (family: string, name: string | undefined, what: 'bold' | 'italic' | 'hidden'): boolean | undefined => {
    const seen = new Set<string>()
    for (let at = name; at !== undefined && !seen.has(at) && seen.size < MAX_DEPTH; ) {
      seen.add(at)
      const style = styles.get(`${family}:${at}`)
      if (!style) return undefined
      if (style[what] !== undefined) return style[what]
      at = style.parent
    }
    return undefined
  }

  const budget = { left: MAX_PICTURE_BYTES }
  /** A picture inside the document, or its description in its place. Nothing is fetched. */
  function picture(frame: Node): string {
    const words = (tag: string) =>
      kids(child(frame, tag) ?? {})
        .map((piece) => String(piece['#text'] ?? ''))
        .join('')
        .trim()
    const alt = words('desc') || words('title')
    const href = attrs(child(frame, 'image') ?? {})['@href'] ?? ''
    // A picture is a part of the document, named from its top. One that names another site or
    // leaves the document is described and not carried.
    const path = href.replace(/^\.\//, '')
    const inside = path !== '' && !/^[a-z][a-z0-9+.-]*:|^\/|(?:^|\/)\.\.(?:\/|$)/i.test(path)
    const address = inside ? pictureAddress(parts, path, budget) : null
    if (address) return `<img src="${address}" alt="${escapeHtml(alt)}">`
    return alt ? `[Picture: ${escapeHtml(alt)}]` : ''
  }

  /** The runs of a paragraph, with their emphasis and links. `hidden`: the paragraph's style hides its text where a run does not say. */
  function pieces(nodes: Node[], marks: string[], depth: number, out: Array<Piece | string>, bold: boolean, italic: boolean, hidden: boolean): void {
    if (depth > MAX_DEPTH) throw invalid()
    for (const node of nodes) {
      const tag = tagOf(node)
      if (tag === '#text') {
        if (hidden) continue
        // Spaces, tabs and line ends in the file are one space; a space that counts is a mark of its own.
        const words = String(node['#text']).replace(/[ \t\r\n]+/g, ' ')
        const set = [...(bold ? ['strong'] : []), ...(italic ? ['em'] : [])]
        out.push({ text: words, marks: [...marks.filter((mark) => mark.startsWith('a:')), ...set] })
        continue
      }
      if (SET_ASIDE.has(tag) || tag.startsWith('foreign:')) continue
      const a = attrs(node)
      // A field may be hidden on the spot, or on a condition the document sets.
      if (['none', 'condition'].includes(a['@display'] ?? '')) continue
      if (tag === 's') {
        // Spaces that count are written so that a page keeps them: one ordinary, the rest fixed.
        if (!hidden) out.push({ text: ` ${'\u00A0'.repeat(Math.min(MAX_SPACES, Math.max(1, Number(a['@c']) || 1)) - 1)}`, marks })
      } else if (tag === 'tab') {
        if (!hidden) out.push({ text: ' ', marks })
      } else if (tag === 'line-break') {
        if (!hidden) out.push('<br>')
      } else if (tag === 'span') {
        const name = a['@style-name']
        pieces(kids(node), marks, depth + 1, out, said('text', name, 'bold') ?? bold, said('text', name, 'italic') ?? italic, said('text', name, 'hidden') ?? hidden)
      } else if (tag === 'a') {
        const href = (a['@href'] ?? '').trim()
        // Only an address a browser would open or write to is made a link; any other is its words.
        const link = /^(?:https?:|mailto:)/i.test(href) ? [`a:${href}`] : []
        pieces(kids(node), [...marks.filter((mark) => !mark.startsWith('a:')), ...link], depth + 1, out, bold, italic, hidden)
      } else if (tag === 'frame') {
        if (hidden) continue
        const box = child(node, 'text-box')
        if (box) {
          for (const paragraph of kids(box).filter((kid) => ['p', 'h'].includes(tagOf(kid)))) {
            // Each paragraph in a box is hidden as any other is: by its style, or by a hidden-paragraph mark.
            const name = attrs(paragraph)['@style-name']
            if (hiddenParagraph(paragraph) || said('paragraph', name, 'hidden')) continue
            out.push('<br>')
            pieces(kids(paragraph), marks, depth + 1, out, said('paragraph', name, 'bold') ?? bold, said('paragraph', name, 'italic') ?? italic, hidden)
          }
        } else {
          const html = picture(node)
          if (html) out.push(html)
        }
      } else {
        // A field (a page number, a date, a cross-reference) shows its words. Anything else
        // that holds words is read for them.
        pieces(kids(node), marks, depth + 1, out, bold, italic, hidden)
      }
    }
  }

  function inline(paragraph: Node): string {
    const name = attrs(paragraph)['@style-name']
    // A heading's style makes it bold, and that is how a heading looks, not a word stressed. A
    // heading's words are bold or slanted only where its own runs say so.
    const look = tagOf(paragraph) !== 'h'
    const found: Array<Piece | string> = []
    pieces(kids(paragraph), [], 0, found, look && (said('paragraph', name, 'bold') ?? false), look && (said('paragraph', name, 'italic') ?? false), said('paragraph', name, 'hidden') ?? false)
    let html = ''
    let open: string[] = []
    const close = (keep: number) => {
      while (open.length > keep) html += `</${open.pop()!.split(':')[0]}>`
    }
    for (const piece of found) {
      const marks = typeof piece === 'string' ? [] : piece.marks
      let same = 0
      while (same < open.length && same < marks.length && open[same] === marks[same]) same++
      close(same)
      for (const mark of marks.slice(same)) {
        html += mark.startsWith('a:') ? `<a href="${escapeHtml(mark.slice(2))}">` : `<${mark}>`
        open = [...open, mark]
      }
      html += typeof piece === 'string' ? piece : escapeHtml(piece.text)
    }
    close(0)
    return html.trim()
  }

  /** The list style a paragraph style gives, or that of the style it is based on. */
  const listOfStyle = (name: string | undefined): string | undefined => {
    const seen = new Set<string>()
    for (let at = name; at !== undefined && !seen.has(at) && seen.size < MAX_DEPTH; ) {
      seen.add(at)
      const style = styles.get(`paragraph:${at}`)
      if (!style) return undefined
      if (style.list) return style.list
      at = style.parent
    }
    return undefined
  }

  const hiddenParagraph = (paragraph: Node) => kids(paragraph).some((kid) => tagOf(kid) === 'hidden-paragraph' && attrs(kid)['@is-hidden'] !== 'false')

  /** Whether a level of a list is numbered, by its list style. */
  const numbered = (style: string | undefined, level: number): boolean => {
    const found = style ? listStyles.get(style) : undefined
    const at = kids(found ?? {}).find((kid) => Number(attrs(kid)['@level']) === level)
    return at !== undefined && tagOf(at) === 'list-level-style-number'
  }

  function list(node: Node, depth: number, level: number, inherited: string | undefined): string {
    if (depth > MAX_DEPTH) throw invalid()
    // A list without a style of its own takes its outer list's, or the one its first paragraph's style gives.
    const firstParagraph = kids(kids(node).find((item) => tagOf(item) === 'list-item') ?? {}).find((part) => ['p', 'h'].includes(tagOf(part)))
    const style = attrs(node)['@style-name'] ?? inherited ?? listOfStyle(attrs(firstParagraph ?? {})['@style-name'])
    const tag = numbered(style, level) ? 'ol' : 'ul'
    const items = kids(node)
      .filter((item) => ['list-item', 'list-header'].includes(tagOf(item)))
      .map((item) => {
        // The paragraphs of an item are read together, so that two stay two; a list inside it is its own.
        let html = ''
        let run: Node[] = []
        const flush = () => {
          if (run.length) html += blocks(run, depth + 1, true)
          run = []
        }
        for (const part of kids(item)) {
          if (tagOf(part) === 'list') {
            flush()
            html += list(part, depth + 1, level + 1, style)
          } else run.push(part)
        }
        flush()
        return html
      })
      .filter((html) => html.trim() !== '')
    return items.length ? `<${tag}>${items.map((html) => `<li>${html}</li>`).join('')}</${tag}>` : ''
  }

  function table(node: Node, depth: number): string {
    if (depth > MAX_DEPTH) throw invalid()
    // Which columns are folded away or filtered out. A cell is placed by counting the cells
    // before it, each as wide as it spans and as many as it repeats.
    const hiddenColumns: boolean[] = []
    const columns = (group: Node, level: number) => {
      if (level > MAX_DEPTH) throw invalid()
      for (const part of kids(group)) {
        const tag = tagOf(part)
        if (['table-columns', 'table-header-columns', 'table-column-group'].includes(tag)) columns(part, level + 1)
        else if (tag === 'table-column') {
          const gone = ['collapse', 'filter'].includes(attrs(part)['@visibility'] ?? '')
          const many = Math.min(MAX_COLUMNS - hiddenColumns.length, Math.max(1, Number(attrs(part)['@number-columns-repeated']) || 1))
          for (let i = 0; i < many; i++) hiddenColumns.push(gone)
        }
      }
    }
    columns(node, 0)
    const rows: Array<{ header: boolean; html: string }> = []
    const gather = (group: Node, header: boolean, level: number) => {
      if (level > MAX_DEPTH) throw invalid()
      for (const part of kids(group)) {
        const tag = tagOf(part)
        if (tag === 'table-header-rows') gather(part, true, level + 1)
        else if (tag === 'table-rows' || tag === 'table-row-group') gather(part, header, level + 1)
        else if (tag === 'table-row') {
          // A row folded away or filtered out is not in the table as it is read.
          if (['collapse', 'filter'].includes(attrs(part)['@visibility'] ?? '')) continue
          const cell = header ? 'th' : 'td'
          const cells: string[] = []
          let column = 0
          for (const found of kids(part)) {
            const tag = tagOf(found)
            if (tag !== 'table-cell' && tag !== 'covered-table-cell') continue
            const at = column
            column += Math.min(MAX_COLUMNS, Math.max(1, Number(attrs(found)['@number-columns-repeated']) || 1))
            if (tag !== 'table-cell' || hiddenColumns[at]) continue
            const span = attrs(found)['@number-columns-spanned']
            const wide = span && /^[2-9]$|^[1-9]\d$/.test(span) ? ` colspan="${span}"` : ''
            cells.push(`<${cell}${wide}>${blocks(kids(found), depth + 1, true)}</${cell}>`)
          }
          rows.push({ header, html: `<tr>${cells.join('')}</tr>` })
        }
      }
    }
    gather(node, false, 0)
    const head = rows.filter((row) => row.header).map((row) => row.html)
    const rest = rows.filter((row) => !row.header).map((row) => row.html)
    return `<table>${head.length ? `<thead>${head.join('')}</thead>` : ''}<tbody>${rest.join('')}</tbody></table>`
  }

  /** Paragraphs, headings, lists and tables → HTML. `tight`: inside a cell or an item, one paragraph needs no <p>. */
  function blocks(nodes: Node[], depth: number, tight = false): string {
    if (depth > MAX_DEPTH) throw invalid()
    let html = ''
    const paragraphs = nodes.filter((node) => ['p', 'h'].includes(tagOf(node))).length
    for (const node of nodes) {
      const tag = tagOf(node)
      const a = attrs(node)
      if (tag === 'p' || tag === 'h') {
        if (hiddenParagraph(node)) continue
        const words = inline(node)
        // An empty paragraph is spacing, not content.
        if (words.replace(/<br>/g, '').trim() === '') continue
        if (tag === 'h') {
          const level = Math.min(6, Math.max(1, Number(a['@outline-level']) || 1))
          html += `<h${level}>${words}</h${level}>`
        } else html += tight && paragraphs === 1 ? words : `<p>${words}</p>`
      } else if (tag === 'list') html += list(node, depth + 1, 1, undefined)
      else if (tag === 'table') html += table(node, depth + 1)
      // A section can be hidden, or shown only on a condition the document sets: either way it is not read.
      else if (tag === 'section') {
        if (!['none', 'condition'].includes(a['@display'] ?? '')) html += blocks(kids(node), depth + 1)
      } else if (INDEXES.has(tag)) html += blocks(kids(child(node, 'index-body') ?? {}), depth + 1)
      else if (tag === 'index-title') html += blocks(kids(node), depth + 1)
      else if (tag === 'frame') {
        // A box of text anchored to the page holds paragraphs of its own; anything else is a picture.
        const box = child(node, 'text-box')
        if (box) html += blocks(kids(box), depth + 1)
        else {
          const found = picture(node)
          if (found) html += `<p>${found}</p>`
        }
      }
    }
    return html
  }

  // What the file calls itself, and the language it says it is written in.
  function meta(): { title: string | null; language: string | null } {
    const found = child(root('meta.xml', 'document-meta') ?? {}, 'meta')
    const metaText = (tag: string) =>
      kids(child(found ?? {}, tag) ?? {})
        .map((piece) => String(piece['#text'] ?? ''))
        .join('')
        .trim()
    const defaults = kids(child(styled ?? {}, 'styles') ?? {}).find((node) => tagOf(node) === 'default-style' && ['paragraph', 'graphic'].includes(attrs(node)['@family'] ?? ''))
    const props = attrs(child(defaults ?? {}, 'text-properties') ?? {})
    const fromStyles = props['@language'] && props['@language'] !== 'none' ? `${props['@language']}${props['@country'] && props['@country'] !== 'none' ? `-${props['@country']}` : ''}` : ''
    const language = metaText('language') || fromStyles
    return { title: metaText('title') || null, language: /^[a-z]{2,3}(?:-[a-z0-9]{2,8}){0,3}$/i.test(language) ? language : null }
  }

  return { content, root, blocks, inline, picture, said, meta }
}

export async function readOdt(bytes: Uint8Array): Promise<ReadDocument> {
  const odf = await openOdf(bytes, TYPES, notOdt, 'document')
  const text = child(child(odf.content, 'body') ?? {}, 'text')
  if (!text) throw notOdt()
  const written = odf.blocks(kids(text), 0)
  if (written.replace(/<[^>]*>/g, '').trim() === '' && !written.includes('<img')) {
    throw new Refusal('This document has no text in it to convert')
  }
  return { body: written, ...odf.meta() }
}
