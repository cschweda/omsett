import { readDimensions } from '@omsett/detect'
import { writeZip } from '../archive/zip'
import type { Entry } from '../archive/entries'
import { Refusal } from '../util'
import { text as escapeXml } from '../data/xml'

// HTML → a Word document (DOCX). The page has already been read into a tree and cleaned; this
// writes that tree as Word's own XML. What a reader relies on is written as Word's real
// thing, not as something that only looks like it: a heading is in a heading style, a list is
// a list, the first row of a table is marked as its headers, the document says what language
// it is in, and a picture carries its description.
//
// Nothing is fetched. A picture that is inside the page (a data: address) goes into the
// document; one that lives on a website does not, and its description and address are written
// in its place.

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
  raised?: 'superscript' | 'subscript'
  link?: string
}

const MAX_DEPTH = 64
/** English Metric Units, which is what Word measures pictures in: 9,525 to a pixel. */
const EMU = 9525
/** The widest a picture may be on the page, in pixels: six inches at 96 to the inch. */
const MAX_PICTURE_WIDTH = 576

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const PACKAGE = 'http://schemas.openxmlformats.org/package/2006/relationships'
const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'

const attribute = (value: string) => escapeXml(value).replaceAll('"', '&quot;')
const TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpeg', 'image/gif': 'gif' }

export async function writeDocx(tree: Hast, title: string, language: string): Promise<Uint8Array> {
  const media: Entry[] = []
  /** Links and pictures, each named by an id that the text refers to. */
  const relations: string[] = []
  const relate = (type: string, target: string, external: boolean) => {
    relations.push(
      `<Relationship Id="rId${relations.length + 10}" Type="${R}/${type}" Target="${attribute(target)}"${external ? ' TargetMode="External"' : ''}/>`,
    )
    return `rId${relations.length + 9}`
  }

  const text = (value: string, run: Run) => {
    if (value === '') return ''
    const props =
      (run.code ? '<w:rStyle w:val="Code"/>' : run.link ? '<w:rStyle w:val="Hyperlink"/>' : '') +
      (run.bold ? '<w:b/>' : '') +
      (run.italic ? '<w:i/>' : '') +
      (run.strike ? '<w:strike/>' : '') +
      (run.raised ? `<w:vertAlign w:val="${run.raised}"/>` : '')
    // A line break inside text (in a block of code) is a break; a tab is a tab.
    const body = value
      .split('\n')
      .map((line) => line.split('\t').map((part) => `<w:t xml:space="preserve">${escapeXml(part)}</w:t>`).join('<w:tab/>'))
      .join('<w:br/>')
    return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}${body}</w:r>`
  }

  function picture(node: Hast, run: Run): string {
    const src = String(node.properties?.src ?? '')
    const alt = String(node.properties?.alt ?? '')
    const inside = /^data:(image\/(?:png|jpeg|gif));base64,([a-z0-9+/=\s]+)$/i.exec(src)
    if (!inside) {
      // Not in the page, so not fetched. What it shows, and where it is, are written instead.
      const words = `[Picture${alt ? `: ${alt}` : ''}]`
      return /^https?:\/\//i.test(src) ? link(words, src, run) : text(words, run)
    }
    let data: Uint8Array
    try {
      data = Uint8Array.from(atob(inside[2]!.replace(/\s+/g, '')), (char) => char.codePointAt(0)!)
    } catch {
      return text(`[Picture${alt ? `: ${alt}` : ''}]`, run)
    }
    const kind = TYPES[inside[1]!.toLowerCase()]!
    const size = readDimensions(kind === 'jpeg' ? 'jpg' : kind, data.subarray(0, 512 * 1024))
    if (!size || size.width < 1 || size.height < 1) return text(`[Picture${alt ? `: ${alt}` : ''}]`, run)
    const scale = Math.min(1, MAX_PICTURE_WIDTH / size.width)
    const [cx, cy] = [Math.round(size.width * scale * EMU), Math.round(size.height * scale * EMU)]
    const name = `image${media.length + 1}.${kind}`
    media.push({ name: `word/media/${name}`, data, directory: false, modified: null, executable: false })
    const id = relate('image', `media/${name}`, false)
    const number = media.length
    // `descr` is the description a screen reader speaks. A picture with none is marked as such
    // by leaving it empty, which is how Word marks a picture as decoration.
    return (
      `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/>` +
      `<wp:docPr id="${number}" name="Picture ${number}" descr="${attribute(alt)}"/>` +
      `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
      `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${number}" name="${name}" descr="${attribute(alt)}"/><pic:cNvPicPr/></pic:nvPicPr>` +
      `<pic:blipFill><a:blip r:embed="${id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
      `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
      `</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`
    )
  }

  const link = (words: string, href: string, run: Run) =>
    `<w:hyperlink r:id="${relate('hyperlink', href, true)}" w:history="1">${text(words, { ...run, link: href })}</w:hyperlink>`

  /** What sits inside a paragraph: text, emphasis, links, pictures. */
  function inline(nodes: Hast[], run: Run, depth: number, keepSpace = false): string {
    if (depth > MAX_DEPTH) throw new Refusal('This file is nested too deeply to convert')
    let out = ''
    for (const node of nodes) {
      if (node.type === 'text') {
        // Line breaks and runs of spaces in a page are one space, except in a block of code.
        out += text(keepSpace ? (node.value ?? '') : (node.value ?? '').replace(/\s+/g, ' '), run)
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
          out += inline(kids, { ...run, raised: 'superscript' }, depth + 1, keepSpace)
          break
        case 'sub':
          out += inline(kids, { ...run, raised: 'subscript' }, depth + 1, keepSpace)
          break
        case 'br':
          out += '<w:r><w:br/></w:r>'
          break
        case 'img':
          out += picture(node, run)
          break
        case 'a': {
          const href = String(node.properties?.href ?? '')
          const inner = inline(kids, { ...run, link: href }, depth + 1, keepSpace)
          // Only an address on the web or for mail becomes a link. Anything else is its words.
          out += /^(?:https?:\/\/|mailto:)/i.test(href) ? `<w:hyperlink r:id="${relate('hyperlink', href, true)}" w:history="1">${inner}</w:hyperlink>` : inner
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

  const paragraph = (inner: string, props = '') => (inner === '' && props === '' ? '' : `<w:p>${props ? `<w:pPr>${props}</w:pPr>` : ''}${inner}</w:p>`)
  const INLINE = new Set(['a', 'b', 'strong', 'i', 'em', 'del', 's', 'code', 'kbd', 'samp', 'sup', 'sub', 'br', 'img', 'span', 'input', 'u', 'small', 'mark', 'abbr', 'cite', 'q', 'time', 'var'])
  const isInline = (node: Hast) => node.type === 'text' || (node.type === 'element' && INLINE.has(node.tagName ?? ''))

  /** Headings, paragraphs, lists and tables. `props` is carried into every paragraph inside. */
  function blocks(nodes: Hast[], depth: number, props = '', list: { ordered: boolean; level: number } | null = null): string {
    if (depth > MAX_DEPTH) throw new Refusal('This file is nested too deeply to convert')
    let out = ''
    // Text that sits loose among blocks is a paragraph of its own.
    let loose: Hast[] = []
    const flush = () => {
      const inner = inline(loose, {}, depth)
      if (loose.some((node) => node.type !== 'text' || (node.value ?? '').trim() !== '')) out += paragraph(inner, props)
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
      if (heading) out += paragraph(inline(kids, {}, depth + 1), `<w:pStyle w:val="Heading${heading[1]}"/>`)
      else if (tag === 'p') out += paragraph(inline(kids, {}, depth + 1), props)
      else if (tag === 'blockquote') out += blocks(kids, depth + 1, '<w:pStyle w:val="Quote"/>')
      else if (tag === 'pre') out += paragraph(inline(kids, { code: true }, depth + 1, true), '<w:pStyle w:val="CodeBlock"/>')
      else if (tag === 'hr') out += paragraph('', '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="auto"/></w:pBdr>')
      else if (tag === 'ul' || tag === 'ol') {
        const level = Math.min(8, list ? list.level + 1 : 0)
        for (const item of kids.filter((kid) => kid.type === 'element' && kid.tagName === 'li')) {
          // The first thing in an item carries its bullet or number; the rest sit under it.
          const marker = `<w:numPr><w:ilvl w:val="${level}"/><w:numId w:val="${tag === 'ol' ? 2 : 1}"/></w:numPr>`
          const parts = item.children ?? []
          const nested = parts.findIndex((part) => part.type === 'element' && ['ul', 'ol'].includes(part.tagName ?? ''))
          const first = nested < 0 ? parts : parts.slice(0, nested)
          const lead = first.every(isInline) ? paragraph(inline(first, {}, depth + 1), marker) : blocks(first, depth + 1, marker)
          out += lead || paragraph('<w:r><w:t/></w:r>', marker)
          if (nested >= 0) out += blocks(parts.slice(nested), depth + 1, '', { ordered: tag === 'ol', level })
        }
      } else if (tag === 'table') out += table(node, depth + 1)
      else out += blocks(kids, depth + 1, props, list)
    }
    flush()
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
          // A row is a row of headers if it is in the table's head, or if every cell in it is one.
          if (cells.length > 0) rows.push({ header: header || cells.every((cell) => cell.tagName === 'th'), cells })
        } else if (['thead', 'tbody', 'tfoot'].includes(kid.tagName ?? '')) collect(kid.children ?? [], kid.tagName === 'thead', level + 1)
      }
    }
    collect(node.children ?? [], false, 0)
    if (rows.length === 0) return ''
    const border = (side: string) => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="auto"/>`
    const written = rows.map((row) => {
      const cells = row.cells.map((cell) => {
        const inner = blocks(cell.children ?? [], depth + 1)
        // Every cell holds at least one paragraph, or Word will not open the document.
        return `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/></w:tcPr>${inner || '<w:p/>'}</w:tc>`
      })
      // Marking the row as one that repeats is what tells Word, and a screen reader, that these are headers.
      return `<w:tr>${row.header ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}${cells.join('')}</w:tr>`
    })
    return (
      `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(border).join('')}</w:tblBorders>` +
      `<w:tblLook w:val="04A0" w:firstRow="${rows[0]!.header ? 1 : 0}" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr>` +
      `${written.join('')}</w:tbl><w:p/>`
    )
  }

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
  if (body === '') throw new Refusal('This file has no text in it to convert')

  const document =
    `<w:document xmlns:w="${W}" xmlns:r="${R}" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">` +
    `<w:body>${body}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`

  const heading = (level: number, size: number) =>
    `<w:style w:type="paragraph" w:styleId="Heading${level}"><w:name w:val="heading ${level}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>` +
    `<w:pPr><w:keepNext/><w:spacing w:before="${level < 3 ? 320 : 240}" w:after="120"/><w:outlineLvl w:val="${level - 1}"/></w:pPr><w:rPr><w:b/><w:sz w:val="${size}"/></w:rPr></w:style>`
  const styles =
    `<w:styles xmlns:w="${W}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/>` +
    // The language the document is written in, which is how it is read aloud in the right voice.
    `<w:lang w:val="${attribute(language)}"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="259" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>` +
    `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>` +
    [32, 28, 26, 24, 22, 22].map((size, i) => heading(i + 1, size)).join('') +
    `<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:ind w:left="720" w:right="720"/></w:pPr><w:rPr><w:i/></w:rPr></w:style>` +
    `<w:style w:type="paragraph" w:styleId="CodeBlock"><w:name w:val="Code Block"/><w:basedOn w:val="Normal"/><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/></w:pPr></w:style>` +
    `<w:style w:type="character" w:styleId="Code"><w:name w:val="Code"/><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/><w:sz w:val="20"/></w:rPr></w:style>` +
    `<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr></w:style></w:styles>`

  // Two lists, one of bullets and one of numbers, each nine levels deep.
  const levels = (ordered: boolean) =>
    Array.from({ length: 9 }, (_, i) => {
      const format = ordered ? ['decimal', 'lowerLetter', 'lowerRoman'][i % 3]! : 'bullet'
      const mark = ordered ? `%${i + 1}.` : ['•', '◦', '▪'][i % 3]!
      return `<w:lvl w:ilvl="${i}"><w:start w:val="1"/><w:numFmt w:val="${format}"/><w:lvlText w:val="${mark}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${720 * (i + 1)}" w:hanging="360"/></w:pPr></w:lvl>`
    }).join('')
  const numbering =
    `<w:numbering xmlns:w="${W}"><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>${levels(false)}</w:abstractNum>` +
    `<w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>${levels(true)}</w:abstractNum>` +
    `<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num></w:numbering>`

  const part = (name: string, xml: string): Entry => ({ name, data: new TextEncoder().encode(HEAD + xml), directory: false, modified: null, executable: false })
  const kinds = [...new Set(media.map((file) => file.name.slice(file.name.lastIndexOf('.') + 1)))]
  return writeZip([
    part(
      '[Content_Types].xml',
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>${kinds.map((kind) => `<Default Extension="${kind}" ContentType="image/${kind}"/>`).join('')}` +
        `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
        `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>` +
        `<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>` +
        `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`,
    ),
    part(
      '_rels/.rels',
      `<Relationships xmlns="${PACKAGE}"><Relationship Id="rId1" Type="${R}/officeDocument" Target="word/document.xml"/>` +
        `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`,
    ),
    part('word/document.xml', document),
    part(
      'word/_rels/document.xml.rels',
      `<Relationships xmlns="${PACKAGE}"><Relationship Id="rId1" Type="${R}/styles" Target="styles.xml"/><Relationship Id="rId2" Type="${R}/numbering" Target="numbering.xml"/>${relations.join('')}</Relationships>`,
    ),
    part('word/styles.xml', styles),
    part('word/numbering.xml', numbering),
    // A document with a title is announced by it; one without is announced by its file name.
    part(
      'docProps/core.xml',
      `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">` +
        `<dc:title>${escapeXml(title)}</dc:title><dc:language>${escapeXml(language)}</dc:language></cp:coreProperties>`,
    ),
    ...media,
  ])
}
