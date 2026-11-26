import { readDimensions } from '@omsett/detect'
import { writeZip } from '../archive/zip'
import type { Entry } from '../archive/entries'
import { Refusal } from '../util'
import { text as escapeXml } from '../data/xml'

// HTML → an OpenDocument text (ODT). The page has already been read into a tree and cleaned;
// this writes that tree as OpenDocument's own XML, as the DOCX writer writes Word's. What a reader
// relies on is written as the real thing: a heading is a heading at its level, a list is a list,
// the first row of a table is marked as its headers, the document says what language it is in,
// and a picture carries its description.
//
// Nothing is fetched. A picture inside the page (a data: address) goes into the document; one
// that lives on a website does not, and its description and address are written in its place.

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
/** The widest a picture may be on the page, in centimetres. */
const MAX_PICTURE_CM = 16
/** Pixels to a centimetre, at 96 to the inch. */
const PIXELS_PER_CM = 96 / 2.54
const HEAD = '<?xml version="1.0" encoding="UTF-8"?>\n'
const TEXT = 'application/vnd.oasis.opendocument.text'
const NS =
  'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" ' +
  'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" ' +
  'xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" ' +
  'xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0" ' +
  'xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" office:version="1.3"'

const attribute = (value: string) => escapeXml(value).replaceAll('"', '&quot;')
const TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpeg', 'image/gif': 'gif' }

export async function writeOdt(tree: Hast, title: string, language: string): Promise<Uint8Array> {
  const media: Entry[] = []
  // A style for each way a run of letters is set, made as it is first needed.
  const runStyles = new Map<string, string>()
  const styleOf = (run: Run): string | null => {
    const key = [run.bold && 'bold', run.italic && 'italic', run.strike && 'strike', run.code && 'code', run.raised].filter(Boolean).join(' ')
    if (key === '') return null
    let name = runStyles.get(key)
    if (!name) {
      name = `T${runStyles.size + 1}`
      runStyles.set(key, name)
    }
    return name
  }

  /** Letters as a run, with the marks that keep spaces, tabs and line breaks. */
  const text = (value: string, run: Run, keepSpace = false) => {
    if (value === '') return ''
    let body = ''
    for (const [n, line] of value.split('\n').entries()) {
      if (n > 0) body += '<text:line-break/>'
      body += line
        .split('\t')
        .map((part) => (keepSpace ? escapeXml(part).replace(/ {2,}/g, (spaces) => ` <text:s text:c="${spaces.length - 1}"/>`) : escapeXml(part)))
        .join('<text:tab/>')
    }
    const style = styleOf(run)
    return style ? `<text:span text:style-name="${style}">${body}</text:span>` : body
  }

  function picture(node: Hast, run: Run): string {
    const src = String(node.properties?.src ?? '')
    const alt = String(node.properties?.alt ?? '')
    const inside = /^data:(image\/(?:png|jpeg|gif));base64,([a-z0-9+/=\s]+)$/i.exec(src)
    const words = `[Picture${alt ? `: ${alt}` : ''}]`
    if (!inside) {
      // Not in the page, so not fetched. What it shows, and where it is, are written instead.
      return /^https?:\/\//i.test(src) ? link(text(words, run), src) : text(words, run)
    }
    let data: Uint8Array
    try {
      data = Uint8Array.from(atob(inside[2]!.replace(/\s+/g, '')), (char) => char.codePointAt(0)!)
    } catch {
      return text(words, run)
    }
    const kind = TYPES[inside[1]!.toLowerCase()]!
    const size = readDimensions(kind === 'jpeg' ? 'jpg' : kind, data.subarray(0, 512 * 1024))
    if (!size || size.width < 1 || size.height < 1) return text(words, run)
    const scale = Math.min(1, MAX_PICTURE_CM / (size.width / PIXELS_PER_CM))
    const [width, height] = [(size.width / PIXELS_PER_CM) * scale, (size.height / PIXELS_PER_CM) * scale]
    const name = `Pictures/image${media.length + 1}.${kind}`
    media.push({ name, data, directory: false, modified: null, executable: false })
    // The title is the text alternative a screen reader speaks, and the description says it again.
    // A picture with none is left without, which is how a picture is marked as decoration.
    return (
      `<draw:frame draw:name="Picture ${media.length}" text:anchor-type="as-char" svg:width="${width.toFixed(3)}cm" svg:height="${height.toFixed(3)}cm">` +
      `<draw:image xlink:href="${name}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/>` +
      (alt ? `<svg:title>${escapeXml(alt)}</svg:title><svg:desc>${escapeXml(alt)}</svg:desc>` : '') +
      `</draw:frame>`
    )
  }

  const link = (inner: string, href: string) => `<text:a xlink:type="simple" xlink:href="${attribute(href)}">${inner}</text:a>`

  /** What sits inside a paragraph: text, emphasis, links, pictures. */
  function inline(nodes: Hast[], run: Run, depth: number, keepSpace = false): string {
    if (depth > MAX_DEPTH) throw new Refusal('This file is nested too deeply to convert')
    let out = ''
    for (const node of nodes) {
      if (node.type === 'text') {
        // Line breaks and runs of spaces in a page are one space, except in a block of code.
        out += text(keepSpace ? (node.value ?? '') : (node.value ?? '').replace(/\s+/g, ' '), run, keepSpace)
        continue
      }
      if (node.type !== 'element') continue
      const kids = node.children ?? []
      switch (node.tagName) {
        case 'strong':
        case 'b':
          out += inline(kids, { ...run, bold: true }, depth + 1, keepSpace)
          break
        case 'em':
        case 'i':
          out += inline(kids, { ...run, italic: true }, depth + 1, keepSpace)
          break
        case 'del':
        case 's':
          out += inline(kids, { ...run, strike: true }, depth + 1, keepSpace)
          break
        case 'code':
        case 'kbd':
        case 'samp':
          out += inline(kids, { ...run, code: true }, depth + 1, keepSpace)
          break
        case 'sup':
          out += inline(kids, { ...run, raised: 'super' }, depth + 1, keepSpace)
          break
        case 'sub':
          out += inline(kids, { ...run, raised: 'sub' }, depth + 1, keepSpace)
          break
        case 'br':
          out += '<text:line-break/>'
          break
        case 'img':
          out += picture(node, run)
          break
        case 'a': {
          const href = String(node.properties?.href ?? '')
          const inner = inline(kids, run, depth + 1, keepSpace)
          // Only an address on the web or for mail becomes a link. Anything else is its words.
          out += /^(?:https?:\/\/|mailto:)/i.test(href) ? link(inner, href) : inner
          break
        }
        case 'input':
          // A box in a list of things to do.
          out += text(node.properties?.checked ? '☑ ' : '☐ ', run)
          break
        default:
          out += inline(kids, run, depth + 1, keepSpace)
      }
    }
    return out
  }

  const paragraph = (inner: string, style = 'Standard') => `<text:p text:style-name="${style}">${inner}</text:p>`
  const INLINE = new Set(['a', 'b', 'strong', 'i', 'em', 'del', 's', 'code', 'kbd', 'samp', 'sup', 'sub', 'br', 'img', 'span', 'input', 'u', 'small', 'mark', 'abbr', 'cite', 'q', 'time', 'var'])
  const isInline = (node: Hast) => node.type === 'text' || (node.type === 'element' && INLINE.has(node.tagName ?? ''))

  /** Headings, paragraphs, lists and tables. `style` is given to every plain paragraph inside. */
  function blocks(nodes: Hast[], depth: number, style = 'Standard'): string {
    if (depth > MAX_DEPTH) throw new Refusal('This file is nested too deeply to convert')
    let out = ''
    // Text that sits loose among blocks is a paragraph of its own.
    let loose: Hast[] = []
    const flush = () => {
      if (loose.some((node) => node.type !== 'text' || (node.value ?? '').trim() !== '')) out += paragraph(inline(loose, {}, depth), style)
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
      if (heading) out += `<text:h text:style-name="Heading_20_${heading[1]}" text:outline-level="${heading[1]}">${inline(kids, {}, depth + 1)}</text:h>`
      else if (tag === 'p') out += paragraph(inline(kids, {}, depth + 1), style)
      else if (tag === 'blockquote') out += blocks(kids, depth + 1, 'Quotations')
      else if (tag === 'pre') out += paragraph(inline(kids, { code: true }, depth + 1, true), 'Preformatted_20_Text')
      else if (tag === 'hr') out += paragraph('', 'Horizontal_20_Line')
      else if (tag === 'ul' || tag === 'ol') out += list(node, depth + 1)
      else if (tag === 'table') out += table(node, depth + 1)
      else out += blocks(kids, depth + 1, style)
    }
    flush()
    return out
  }

  function list(node: Hast, depth: number): string {
    if (depth > MAX_DEPTH) throw new Refusal('This file is nested too deeply to convert')
    const items = (node.children ?? []).filter((kid) => kid.type === 'element' && kid.tagName === 'li')
    const written = items.map((item) => {
      const parts = item.children ?? []
      // An item's words are a paragraph, and the lists inside it lists of their own.
      let inner = ''
      let run: Hast[] = []
      const flush = () => {
        if (run.length === 0) return
        inner += run.every(isInline) ? paragraph(inline(run, {}, depth + 1)) : blocks(run, depth + 1)
        run = []
      }
      for (const part of parts) {
        if (part.type === 'element' && (part.tagName === 'ul' || part.tagName === 'ol')) {
          flush()
          inner += list(part, depth + 1)
        } else run.push(part)
      }
      flush()
      return `<text:list-item>${inner || paragraph('')}</text:list-item>`
    })
    return `<text:list text:style-name="${node.tagName === 'ol' ? 'Numbers' : 'Bullets'}">${written.join('')}</text:list>`
  }

  function table(node: Hast, depth: number): string {
    const rows: Array<{ header: boolean; cells: Hast[] }> = []
    const collect = (nodes: Hast[], header: boolean, level: number) => {
      if (level > MAX_DEPTH) return
      for (const kid of nodes) {
        if (kid.type !== 'element') continue
        if (kid.tagName === 'tr') {
          const cells = (kid.children ?? []).filter((cell) => cell.type === 'element' && ['td', 'th'].includes(cell.tagName ?? ''))
          // A row is a row of headers if it is in the table's head, or if every cell in it is one.
          if (cells.length > 0) rows.push({ header: header || cells.every((cell) => cell.tagName === 'th'), cells })
        } else if (['thead', 'tbody', 'tfoot'].includes(kid.tagName ?? '')) collect(kid.children ?? [], kid.tagName === 'thead', level + 1)
      }
    }
    collect(node.children ?? [], false, 0)
    if (rows.length === 0) return ''
    const width = Math.max(...rows.map((row) => row.cells.length))
    const row = (cells: Hast[]) =>
      `<table:table-row>${cells
        .map((cell) => {
          // Every cell holds at least one paragraph.
          const inner = blocks(cell.children ?? [], depth + 1)
          return `<table:table-cell table:style-name="Cell" office:value-type="string">${inner || paragraph('')}</table:table-cell>`
        })
        .join('')}${'<table:table-cell table:style-name="Cell"><text:p/></table:table-cell>'.repeat(width - cells.length)}</table:table-row>`
    // The rows that head the table are kept apart, which is what says they are its headers.
    const lead = rows.findIndex((found) => !found.header)
    const head = lead < 0 ? rows : rows.slice(0, lead)
    const rest = lead < 0 ? [] : rows.slice(lead)
    tables++
    return (
      `<table:table table:name="Table${tables}" table:style-name="Table"><table:table-column table:number-columns-repeated="${width}"/>` +
      (head.length ? `<table:table-header-rows>${head.map((found) => row(found.cells)).join('')}</table:table-header-rows>` : '') +
      rest.map((found) => row(found.cells)).join('') +
      `</table:table>`
    )
  }
  let tables = 0

  // The page's body, wherever in the tree it is.
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
  if (body.replace(/<[^>]*>/g, '').trim() === '' && !body.includes('<draw:frame')) throw new Refusal('This file has no text in it to convert')

  const runs = [...runStyles.entries()]
    .map(([key, name]) => {
      const has = new Set(key.split(' '))
      const props = [
        has.has('bold') ? 'fo:font-weight="bold" style:font-weight-asian="bold" style:font-weight-complex="bold"' : '',
        has.has('italic') ? 'fo:font-style="italic" style:font-style-asian="italic" style:font-style-complex="italic"' : '',
        has.has('strike') ? 'style:text-line-through-style="solid"' : '',
        has.has('code') ? 'style:font-name="Monospace" fo:font-family="monospace"' : '',
        has.has('super') ? 'style:text-position="super 58%"' : has.has('sub') ? 'style:text-position="sub 58%"' : '',
      ].filter(Boolean)
      return `<style:style style:name="${name}" style:family="text"><style:text-properties ${props.join(' ')}/></style:style>`
    })
    .join('')
  const content =
    `<office:document-content ${NS}><office:automatic-styles>${runs}` +
    `<style:style style:name="Table" style:family="table"><style:table-properties table:align="margins"/></style:style>` +
    `<style:style style:name="Cell" style:family="table-cell"><style:table-cell-properties fo:padding="0.1cm" fo:border="0.5pt solid #000000"/></style:style>` +
    `</office:automatic-styles><office:body><office:text>${body}</office:text></office:body></office:document-content>`

  // The language the document is written in, which is how it is read aloud in the right voice.
  const [tongue, region] = language.split('-')
  const speaks = `fo:language="${attribute(tongue ?? 'en')}"${region ? ` fo:country="${attribute(region.toUpperCase())}"` : ''}`
  const heading = (level: number, size: number) =>
    `<style:style style:name="Heading_20_${level}" style:display-name="Heading ${level}" style:family="paragraph" style:parent-style-name="Heading" style:next-style-name="Standard" style:default-outline-level="${level}">` +
    `<style:text-properties fo:font-size="${size}pt" fo:font-weight="bold"/></style:style>`
  const levels = (ordered: boolean) =>
    Array.from({ length: 9 }, (_, i) =>
      ordered
        ? `<text:list-level-style-number text:level="${i + 1}" style:num-suffix="." style:num-format="${['1', 'a', 'i'][i % 3]}"><style:list-level-properties text:space-before="${(0.6 * i).toFixed(1)}cm" text:min-label-width="0.6cm"/></text:list-level-style-number>`
        : `<text:list-level-style-bullet text:level="${i + 1}" text:bullet-char="${['•', '◦', '▪'][i % 3]}"><style:list-level-properties text:space-before="${(0.6 * i).toFixed(1)}cm" text:min-label-width="0.6cm"/></text:list-level-style-bullet>`,
    ).join('')
  const styles =
    `<office:document-styles ${NS}><office:styles>` +
    `<style:default-style style:family="paragraph"><style:text-properties ${speaks} fo:font-size="11pt"/></style:default-style>` +
    `<style:style style:name="Standard" style:family="paragraph"><style:paragraph-properties fo:margin-bottom="0.25cm"/></style:style>` +
    `<style:style style:name="Heading" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:margin-top="0.4cm" fo:keep-with-next="always"/></style:style>` +
    [16, 14, 13, 12, 11, 11].map((size, i) => heading(i + 1, size)).join('') +
    `<style:style style:name="Quotations" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:margin-left="1cm" fo:margin-right="1cm"/><style:text-properties fo:font-style="italic"/></style:style>` +
    `<style:style style:name="Preformatted_20_Text" style:display-name="Preformatted Text" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:background-color="#f2f2f2"/><style:text-properties style:font-name="Monospace" fo:font-family="monospace" fo:font-size="10pt"/></style:style>` +
    `<style:style style:name="Horizontal_20_Line" style:display-name="Horizontal Line" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:border-bottom="0.5pt solid #000000"/></style:style>` +
    `<text:list-style style:name="Bullets">${levels(false)}</text:list-style><text:list-style style:name="Numbers">${levels(true)}</text:list-style>` +
    `</office:styles></office:document-styles>`
  // A document with a title is announced by it; one without is announced by its file name.
  const meta =
    `<office:document-meta ${NS}><office:meta><dc:title>${escapeXml(title)}</dc:title><dc:language>${escapeXml(language)}</dc:language>` +
    `<meta:generator>Omsett</meta:generator></office:meta></office:document-meta>`
  const manifest =
    `<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3">` +
    `<manifest:file-entry manifest:full-path="/" manifest:version="1.3" manifest:media-type="${TEXT}"/>` +
    ['content.xml', 'styles.xml', 'meta.xml'].map((name) => `<manifest:file-entry manifest:full-path="${name}" manifest:media-type="text/xml"/>`).join('') +
    media.map((file) => `<manifest:file-entry manifest:full-path="${file.name}" manifest:media-type="image/${file.name.slice(file.name.lastIndexOf('.') + 1)}"/>`).join('') +
    `</manifest:manifest>`

  const part = (name: string, xml: string): Entry => ({ name, data: new TextEncoder().encode(HEAD + xml), directory: false, modified: null, executable: false })
  // The type comes first, stored as it is, so that it can be read without unpacking anything.
  return writeZip(
    [
      { name: 'mimetype', data: new TextEncoder().encode(TEXT), directory: false, modified: null, executable: false },
      part('content.xml', content),
      part('styles.xml', styles),
      part('meta.xml', meta),
      part('META-INF/manifest.xml', manifest),
      ...media,
    ],
    { stored: ['mimetype'] },
  )
}
