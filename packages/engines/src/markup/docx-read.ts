import { readZip } from '../archive/zip'
import type { Entry } from '../archive/entries'
import { Refusal } from '../util'

// Word documents (DOCX) → HTML. A document is a ZIP of XML: one part is the text, others say
// what its styles and lists are, where its links go, and hold its pictures. What is read is
// the structure a reader relies on: headings as headings, lists as lists, table headers as
// headers, and each picture with the description its author gave it.
//
// Nothing in a document is run or fetched. Macros and embedded objects are never opened, a
// picture that is only a link to another site is left out, and text that was deleted with
// changes tracked stays deleted.

type Node = Record<string, unknown>

const MAX_PART_BYTES = 64 * 1024 * 1024
/** Pictures are carried inside the page. Past this much, the rest are left out. */
const MAX_PICTURE_BYTES = 24 * 1024 * 1024
const MAX_DEPTH = 64

export const notDocument = () => new Refusal('This file is not a valid DOCX document')

const tagOf = (node: Node) => Object.keys(node).find((key) => key !== ':@') ?? ''
const attrs = (node: Node) => (node[':@'] ?? {}) as Record<string, string>
const kids = (node: Node): Node[] => {
  const inner = node[tagOf(node)]
  return Array.isArray(inner) ? (inner as Node[]) : []
}
const child = (node: Node, tag: string) => kids(node).find((kid) => tagOf(kid) === tag)
const all = (node: Node, tag: string) => kids(node).filter((kid) => tagOf(kid) === tag)
const value = (node: Node | undefined) => (node ? attrs(node)['@val'] : undefined)
/** A setting such as <w:b/> is on unless it says otherwise. */
const on = (node: Node | undefined) => node !== undefined && !['0', 'false', 'off', 'none'].includes(value(node) ?? '')

export const escapeHtml = (text: string) =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')

interface Piece {
  text: string
  /** The tags around it, outermost first: 'strong', 'em', 'a:https://…'. */
  marks: string[]
}

const PICTURES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' }

export interface ReadDocument {
  /** The inside of <body>. Not yet cleaned: the caller passes it through the sanitizer. */
  body: string
  title: string | null
  language: string | null
}

export async function readDocx(bytes: Uint8Array): Promise<ReadDocument> {
  let entries: Entry[]
  try {
    entries = await readZip(bytes)
  } catch (error) {
    if (error instanceof Refusal && /more than Omsett will handle/.test(error.message)) {
      throw new Refusal('This document is too large to convert in a browser')
    }
    if (error instanceof Refusal && /password/.test(error.message)) throw error
    throw notDocument()
  }
  const parts = new Map(entries.filter((entry) => !entry.directory).map((entry) => [entry.name.toLowerCase(), entry.data]))
  const { XMLParser } = await import('fast-xml-parser')
  const parser = new XMLParser({
    preserveOrder: true,
    ignoreAttributes: false,
    attributeNamePrefix: '@',
    removeNSPrefix: true,
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: false,
    ignoreDeclaration: true,
    ignorePiTags: true,
  })
  const open = (path: string): Node[] => {
    const data = parts.get(path.toLowerCase())
    if (!data) return []
    if (data.length > MAX_PART_BYTES) throw new Refusal('This document is too large to convert in a browser')
    const source = new TextDecoder('utf-8').decode(data)
    // A document's XML never declares a document type. One that does is defining shorthand of
    // its own, which is how a small file is made to expand into a vast one.
    if (/<!DOCTYPE/i.test(source.slice(0, 4096))) throw notDocument()
    try {
      return parser.parse(source) as Node[]
    } catch {
      // The parser has limits of its own (how deep tags may nest, for one) and says so by throwing.
      throw notDocument()
    }
  }
  const root = (path: string, tag: string) => open(path).find((node) => tagOf(node) === tag)

  const document = root('word/document.xml', 'document')
  const body = document && child(document, 'body')
  if (!body) throw notDocument()

  // Where each link and picture named in the text really is.
  const links = new Map<string, { target: string; external: boolean }>()
  for (const link of all(root('word/_rels/document.xml.rels', 'Relationships') ?? {}, 'Relationship')) {
    const a = attrs(link)
    if (a['@Id']) links.set(a['@Id'], { target: a['@Target'] ?? '', external: a['@TargetMode'] === 'External' })
  }

  // Which styles are headings, and at what level. A style is a heading by its name ("heading
  // 2") or by the outline level it sets, whatever language Word named it in.
  const headings = new Map<string, number>()
  const quotes = new Set<string>()
  const stylesRoot = root('word/styles.xml', 'styles')
  for (const style of all(stylesRoot ?? {}, 'style')) {
    const id = attrs(style)['@styleId']
    if (!id) continue
    const name = (value(child(style, 'name')) ?? '').toLowerCase()
    const outline = value(child(child(style, 'pPr') ?? {}, 'outlineLvl'))
    const named = /^heading ([1-9])$/.exec(name)
    if (named) headings.set(id, Math.min(6, Number(named[1])))
    else if (name === 'title') headings.set(id, 1)
    else if (outline !== undefined && /^[0-8]$/.test(outline)) headings.set(id, Math.min(6, Number(outline) + 1))
    if (name === 'quote' || name === 'intense quote') quotes.add(id)
  }
  // Documents made without a styles part still name their headings the usual way.
  const headingOf = (id: string | undefined) => {
    if (!id) return 0
    return headings.get(id) ?? (/^heading[1-6]$/i.test(id) ? Number(id.at(-1)) : /^title$/i.test(id) ? 1 : 0)
  }

  // Which lists are numbered and which are bulleted, level by level.
  const numbering = root('word/numbering.xml', 'numbering')
  const formats = new Map<string, Map<string, string>>()
  for (const abstract of all(numbering ?? {}, 'abstractNum')) {
    const levels = new Map<string, string>()
    for (const level of all(abstract, 'lvl')) levels.set(attrs(level)['@ilvl'] ?? '0', value(child(level, 'numFmt')) ?? 'decimal')
    formats.set(attrs(abstract)['@abstractNumId'] ?? '', levels)
  }
  const lists = new Map<string, Map<string, string>>()
  for (const num of all(numbering ?? {}, 'num')) {
    const levels = formats.get(value(child(num, 'abstractNumId')) ?? '')
    if (levels) lists.set(attrs(num)['@numId'] ?? '', levels)
  }

  let pictureBytes = 0
  function picture(drawing: Node): string {
    // The description is on the drawing; the picture itself is named some way inside it.
    let alt = ''
    let embed: string | undefined
    const pending: Array<[Node, number]> = [[drawing, 0]]
    while (pending.length > 0) {
      const [node, depth] = pending.pop()!
      if (depth > MAX_DEPTH) break
      const tag = tagOf(node)
      if (tag === 'docPr') alt = attrs(node)['@descr'] ?? attrs(node)['@title'] ?? alt
      if (tag === 'blip') embed = attrs(node)['@embed'] ?? embed
      for (const kid of kids(node)) pending.push([kid, depth + 1])
    }
    const link = embed ? links.get(embed) : undefined
    // A picture kept on another site would have to be fetched. It is not; its description stays.
    const path = link && !link.external && !link.target.includes('..') ? `word/${link.target.replace(/^\/?(?:word\/)?/, '')}` : null
    const data = path ? parts.get(path.toLowerCase()) : undefined
    const type = path ? PICTURES[path.slice(path.lastIndexOf('.') + 1).toLowerCase()] : undefined
    if (!data || !type || pictureBytes + data.length > MAX_PICTURE_BYTES) return alt ? `[Picture: ${escapeHtml(alt)}]` : ''
    pictureBytes += data.length
    let binary = ''
    for (let i = 0; i < data.length; i += 0x8000) binary += String.fromCodePoint(...data.subarray(i, i + 0x8000))
    return `<img src="data:${type};base64,${btoa(binary)}" alt="${escapeHtml(alt)}">`
  }

  /** The text of a paragraph, as pieces that each know what is around them. */
  function pieces(nodes: Node[], marks: string[], depth: number, out: Array<Piece | string>): void {
    if (depth > MAX_DEPTH) throw notDocument()
    for (const node of nodes) {
      const tag = tagOf(node)
      if (tag === 'r') {
        const props = child(node, 'rPr') ?? {}
        // Text marked as hidden is not shown in Word and is not shown here.
        if (on(child(props, 'vanish'))) continue
        const own = [...marks]
        if (on(child(props, 'b'))) own.push('strong')
        if (on(child(props, 'i'))) own.push('em')
        if (on(child(props, 'strike')) || on(child(props, 'dstrike'))) own.push('del')
        const raised = value(child(props, 'vertAlign'))
        if (raised === 'superscript') own.push('sup')
        if (raised === 'subscript') own.push('sub')
        for (const part of kids(node)) {
          const kind = tagOf(part)
          if (kind === 't') out.push({ text: kids(part).map((t) => String(t['#text'] ?? '')).join(''), marks: own })
          else if (kind === 'tab') out.push({ text: '\t', marks: own })
          else if (kind === 'br' || kind === 'cr') out.push('<br>')
          else if (kind === 'noBreakHyphen') out.push({ text: '-', marks: own })
          else if (kind === 'drawing' || kind === 'pict') out.push(picture(part))
          // Deleted text (delText), field instructions (instrText) and references to comments
          // are not part of what the document says.
        }
      } else if (tag === 'hyperlink') {
        const a = attrs(node)
        const target = a['@id'] ? links.get(a['@id']) : undefined
        const href = target?.external ? target.target : a['@anchor'] ? `#${a['@anchor']}` : null
        pieces(kids(node), href ? [...marks, `a:${href}`] : marks, depth + 1, out)
      } else if (tag === 'ins' || tag === 'smartTag' || tag === 'sdt' || tag === 'sdtContent' || tag === 'fldSimple') {
        // Text that was added with changes tracked is part of the document; so is what is
        // inside a content control or a field.
        pieces(kids(node), marks, depth + 1, out)
      }
      // <w:del> and everything else is passed over.
    }
  }

  /** Pieces → HTML, with neighbours that share a mark sharing its tag. */
  function inline(nodes: Node[]): string {
    const found: Array<Piece | string> = []
    pieces(nodes, [], 0, found)
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
    return html
  }

  function table(node: Node, depth: number): string {
    const rows = all(node, 'tr').map((row) => {
      // Word marks a row that repeats at the top of each page: that is a row of headers.
      const header = on(child(child(row, 'trPr') ?? {}, 'tblHeader'))
      const cells = all(row, 'tc').map((cell) => {
        const span = value(child(child(cell, 'tcPr') ?? {}, 'gridSpan'))
        const wide = span && /^[1-9]\d?$/.test(span) && span !== '1' ? ` colspan="${span}"` : ''
        return `<${header ? 'th' : 'td'}${wide}>${blocks(kids(cell), depth + 1, true)}</${header ? 'th' : 'td'}>`
      })
      return { header, html: `<tr>${cells.join('')}</tr>` }
    })
    const head = rows.filter((row) => row.header).map((row) => row.html)
    const rest = rows.filter((row) => !row.header).map((row) => row.html)
    return `<table>${head.length ? `<thead>${head.join('')}</thead>` : ''}<tbody>${rest.join('')}</tbody></table>`
  }

  /** Paragraphs and tables → HTML. `tight`: inside a table cell, one paragraph needs no <p>. */
  function blocks(nodes: Node[], depth: number, tight = false): string {
    if (depth > MAX_DEPTH) throw notDocument()
    let html = ''
    // The lists that are open, innermost last, each with the kind it is.
    const open: string[] = []
    const closeTo = (level: number) => {
      while (open.length > level) html += `</li></${open.pop()}>`
    }
    const paragraphs = nodes.filter((node) => ['p', 'tbl', 'sdt'].includes(tagOf(node)))
    for (const node of paragraphs) {
      const tag = tagOf(node)
      if (tag === 'sdt') {
        closeTo(0)
        html += blocks(kids(child(node, 'sdtContent') ?? {}), depth + 1, tight)
        continue
      }
      if (tag === 'tbl') {
        closeTo(0)
        html += table(node, depth)
        continue
      }
      const props = child(node, 'pPr') ?? {}
      const style = value(child(props, 'pStyle'))
      const numbered = child(props, 'numPr')
      const content = inline(kids(node))
      const listId = numbered ? value(child(numbered, 'numId')) : undefined
      if (listId && listId !== '0' && !headingOf(style)) {
        const level = Math.min(8, Number(value(child(numbered!, 'ilvl')) ?? 0) || 0)
        const kind = (lists.get(listId)?.get(String(level)) ?? 'bullet') === 'bullet' ? 'ul' : 'ol'
        if (open.length > level + 1) closeTo(level + 1)
        if (open.length === level + 1 && open[level] !== kind) closeTo(level)
        if (open.length === level + 1) html += '</li>'
        while (open.length < level + 1) {
          html += `<${kind}>`
          open.push(kind)
          if (open.length < level + 1) html += '<li>'
        }
        html += `<li>${content}`
        continue
      }
      closeTo(0)
      // An empty paragraph is spacing, not content.
      if (content.trim() === '') continue
      const heading = headingOf(style)
      if (heading) html += `<h${heading}>${content}</h${heading}>`
      else if (style && quotes.has(style)) html += `<blockquote><p>${content}</p></blockquote>`
      else html += tight && paragraphs.length === 1 ? content : `<p>${content}</p>`
    }
    closeTo(0)
    return html
  }

  const written = blocks(kids(body), 0)
  if (written.replace(/<[^>]*>/g, '').trim() === '' && !written.includes('<img')) {
    throw new Refusal('This document has no text in it to convert')
  }

  // What the document calls itself, and the language it says it is written in.
  const core = root('docprops/core.xml', 'coreProperties')
  const title = core ? kids(child(core, 'title') ?? {}).map((t) => String(t['#text'] ?? '')).join('').trim() : ''
  const defaults = child(child(child(stylesRoot ?? {}, 'docDefaults') ?? {}, 'rPrDefault') ?? {}, 'rPr')
  const language = value(child(defaults ?? {}, 'lang'))
  return {
    body: written,
    title: title || null,
    language: language && /^[a-z]{2,3}(?:-[a-z0-9]{2,8}){0,3}$/i.test(language) ? language : null,
  }
}
