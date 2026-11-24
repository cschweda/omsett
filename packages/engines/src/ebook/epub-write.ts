import { writeZip } from '../archive/zip'
import type { Entry } from '../archive/entries'
import { Refusal } from '../util'
import type { Parts } from './kindle'

// An e-book's parts written as an EPUB: a ZIP holding a page for each chapter, the stylesheets
// and pictures they use, a list of contents, and a list of everything in the book and the
// order it is read in.
//
// Every page is cleaned on the way, as any page Omsett writes is: read into a tree, with
// anything that could run or fetch taken out, and written again by this file's own writer, so
// that what comes out is well-formed whatever went in. An e-book reader is a browser, and a
// book is a stranger's pages.

interface Hast {
  type: string
  tagName?: string
  value?: string
  properties?: Record<string, unknown>
  children?: Hast[]
}

const MAX_DEPTH = 256
const XHTML = 'http://www.w3.org/1999/xhtml'
/** Tags that hold nothing and are written closed. */
const VOID = new Set(['br', 'hr', 'img', 'col', 'wbr'])
/** Tags a book's pages may use beyond those any cleaned page may. */
const BOOKISH = ['article', 'aside', 'nav', 'header', 'footer', 'figure', 'figcaption', 'small', 'center', 'u', 'big', 'abbr', 'cite', 'mark', 'address', 'caption', 'colgroup', 'col', 'wbr', 'main']

/** Characters XML has no place for: control codes, and halves of a character that lost the other half. */
// eslint-disable-next-line no-control-regex -- control characters are exactly what this removes
const NOT_XML = /[\0-\u0008\v\f\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g
const text = (value: string) => value.replace(NOT_XML, '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
const attribute = (value: string) => text(value).replaceAll('"', '&quot;')

/** The name an attribute is written under, from the name the tree keeps it by. Null for one that is not written. */
function attributeName(property: string): string | null {
  if (property === 'className') return 'class'
  if (property === 'htmlFor') return 'for'
  const name = property.startsWith('aria') || property.startsWith('data') ? property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`) : property.toLowerCase()
  return /^[a-z][a-z0-9-]{0,40}$/.test(name) ? name : null
}

/** A cleaned tree as XHTML. Every tag is closed, every attribute quoted, every character escaped. */
function written(nodes: Hast[], depth = 0): string {
  if (depth > MAX_DEPTH) return ''
  let out = ''
  for (const node of nodes) {
    if (node.type === 'text') out += text(node.value ?? '')
    else if (node.type === 'element' && /^[a-z][a-z0-9]{0,20}$/.test(node.tagName ?? '')) {
      let attributes = ''
      for (const [property, value] of Object.entries(node.properties ?? {})) {
        const name = attributeName(property)
        if (name === null || value === null || value === undefined || value === false) continue
        const shown = value === true ? name : Array.isArray(value) ? value.join(' ') : String(value)
        attributes += ` ${name}="${attribute(shown)}"`
      }
      out += VOID.has(node.tagName!) ? `<${node.tagName}${attributes}/>` : `<${node.tagName}${attributes}>${written(node.children ?? [], depth + 1)}</${node.tagName}>`
    }
  }
  return out
}

/** A stylesheet with what could fetch from elsewhere taken out: fonts it names, other stylesheets, addresses on the web. */
function cleanStyle(css: string): string {
  return css
    .replace(/@import[^;]*;?/gi, '')
    .replace(/@font-face\s*\{[^}]*\}/gi, '')
    // An address on the web, or one with nothing in it (a font or a picture that was not carried).
    .replace(/url\([\s'"]*(?:[a-z][a-z0-9+.-]*:|\/\/)[^)]*\)/gi, 'none')
    .replace(/url\([\s'"]*\)/gi, 'none')
    .replace(/expression\s*\(|behavior\s*:|-moz-binding\s*:/gi, 'x-removed:')
    .replace(NOT_XML, '')
}

const TYPES: Record<string, string> = { xhtml: 'application/xhtml+xml', css: 'text/css', jpg: 'image/jpeg', png: 'image/png', gif: 'image/gif', ncx: 'application/x-dtbncx+xml' }

export async function writeEpub(parts: Parts): Promise<Uint8Array> {
  if (parts.chapters.length === 0) throw new Refusal('This book has no pages in it')
  const [{ unified }, parse, sanitize] = await Promise.all([import('unified'), import('rehype-parse'), import('rehype-sanitize')])
  const base = sanitize.defaultSchema
  const schema = {
    ...base,
    // Marks inside a book are how its own links find their places; they are kept as they are.
    clobber: [],
    clobberPrefix: '',
    strip: ['script', 'style', 'title'],
    tagNames: [...(base.tagNames ?? []).filter((tag) => tag !== 'input'), ...BOOKISH],
    attributes: { ...base.attributes, '*': [...(base.attributes?.['*'] ?? []), 'className', 'id', 'lang', 'dir', 'title'], a: ['href', 'name'], img: ['src', 'alt', 'width', 'height'] },
    // A page may link to the web; a picture may only be one that is in the book.
    protocols: { ...base.protocols, href: ['http', 'https', 'mailto'], src: [] },
  }
  const clean = unified().use(parse.default).use(sanitize.default, schema)
  const names = new Set([...parts.styles.map((style) => style.file), ...parts.pictures.map((picture) => picture.file)])
  const encoder = new TextEncoder()
  const language = /^[a-z]{2,3}(?:-[a-z0-9]{2,8}){0,2}$/i.test(parts.language) ? parts.language : 'en'
  const title = parts.title.trim() || 'Untitled'

  const page = (heading: string, styles: string[], body: string) =>
    `<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n<html xmlns="${XHTML}" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${attribute(language)}" lang="${attribute(language)}">\n<head>\n<meta charset="utf-8"/>\n<title>${text(heading)}</title>\n${styles.map((href) => `<link rel="stylesheet" type="text/css" href="${attribute(href)}"/>\n`).join('')}</head>\n<body>\n${body}\n</body>\n</html>\n`

  const files: Array<{ name: string; data: Uint8Array }> = []
  const chapters: string[] = []
  const cleaned: Array<{ file: string; styles: string[]; tree: Hast }> = []
  /** Every name a place has been given, on each page: what a link may point at. */
  const marks = new Map<string, Set<string>>()
  for (const chapter of parts.chapters) {
    const raw = clean.parse(chapter.html) as unknown as Hast
    // The stylesheets the page asks for, before its head is set aside: only ones that are in the book.
    const styles: string[] = []
    const pending: Hast[] = [raw]
    let body: Hast | undefined
    for (let guard = 0; pending.length > 0 && guard < 200_000; guard++) {
      const node = pending.pop()!
      if (node.tagName === 'link' && typeof node.properties?.href === 'string' && names.has(node.properties.href) && !styles.includes(node.properties.href)) styles.push(node.properties.href)
      if (node.tagName === 'body') body = node
      else for (const kid of node.children ?? []) if (kid.type === 'element') pending.push(kid)
    }
    const tree = (await clean.run({ type: 'root', children: (body ?? raw).children ?? [] } as never)) as unknown as Hast
    const found = new Set<string>()
    const stack: Hast[] = [tree]
    for (let guard = 0; stack.length > 0 && guard < 2_000_000; guard++) {
      const node = stack.pop()!
      // A picture that is not in the book is not asked for.
      if (node.tagName === 'img' && !(typeof node.properties?.src === 'string' && names.has(node.properties.src))) node.properties = { alt: node.properties?.alt ?? '' }
      if (typeof node.properties?.id === 'string') found.add(node.properties.id)
      for (const kid of node.children ?? []) if (kid.type === 'element') stack.push(kid)
    }
    marks.set(chapter.file, found)
    cleaned.push({ file: chapter.file, styles: styles.reverse(), tree })
  }
  /** A link to a place that cleaning took away is a link to the page the place was on. */
  const sound = (href: string, from: string): string => {
    const cut = href.indexOf('#')
    if (cut < 0 || /^[a-z][a-z0-9+.-]*:/i.test(href)) return href
    const page = href.slice(0, cut) || from
    return marks.get(page)?.has(href.slice(cut + 1)) ? href : href.slice(0, cut) || '#'
  }
  for (const { file: name, styles, tree } of cleaned) {
    const stack: Hast[] = [tree]
    for (let guard = 0; stack.length > 0 && guard < 2_000_000; guard++) {
      const node = stack.pop()!
      if (node.tagName === 'a' && typeof node.properties?.href === 'string') node.properties.href = sound(node.properties.href, name)
      for (const kid of node.children ?? []) if (kid.type === 'element') stack.push(kid)
    }
    files.push({ name, data: encoder.encode(page(title, styles, written(tree.children ?? []))) })
    chapters.push(name)
  }
  for (const style of parts.styles) files.push({ name: style.file, data: encoder.encode(cleanStyle(style.css)) })
  for (const picture of parts.pictures) files.push({ name: picture.file, data: picture.bytes })

  // A page for the cover, where the book names one: the first thing a reader opens to.
  if (parts.cover && names.has(parts.cover)) {
    files.unshift({ name: 'cover.xhtml', data: encoder.encode(page(title, [], `<div style="text-align: center"><img src="${attribute(parts.cover)}" alt="${attribute(`Cover of ${title}`)}" style="max-width: 100%"/></div>`)) })
    chapters.unshift('cover.xhtml')
  }

  // The list of contents, as the nested list a reader shows. Where the book gave none, one entry: the beginning.
  const contents = parts.contents.filter((entry) => chapters.includes(entry.file))
  const entries = contents.length > 0 ? contents : [{ label: title, file: chapters[parts.cover ? 1 : 0] ?? chapters[0]!, anchor: null, depth: 0 }]
  const target = (entry: (typeof entries)[number]) => `${entry.file}${entry.anchor && marks.get(entry.file)?.has(entry.anchor) ? `#${entry.anchor}` : ''}`
  let list = ''
  let depth = -1
  for (const entry of entries) {
    const level = Math.max(0, Math.min(entry.depth, depth + 1))
    if (level > depth) list += '<ol>\n'.repeat(level - depth)
    else list += `</li>\n${'</ol>\n</li>\n'.repeat(depth - level)}`
    list += `<li><a href="${attribute(target(entry))}">${text(entry.label)}</a>`
    depth = level
  }
  list += `</li>\n${'</ol>\n</li>\n'.repeat(Math.max(0, depth))}</ol>`
  files.push({ name: 'nav.xhtml', data: encoder.encode(page(title, [], `<nav epub:type="toc" id="toc">\n<h1>Contents</h1>\n${list}\n</nav>`)) })

  // The book's own number: made from what it holds, so the same book always gets the same one.
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(`${title}\n${parts.authors.join('\n')}\n${chapters.length}\n${parts.chapters[0]!.html.slice(0, 4096)}`)))
  const hex = [...digest.subarray(0, 16)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  const id = `urn:uuid:${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`

  files.push({
    name: 'toc.ncx',
    data: encoder.encode(
      `<?xml version="1.0" encoding="utf-8"?>\n<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">\n<head><meta name="dtb:uid" content="${attribute(id)}"/></head>\n<docTitle><text>${text(title)}</text></docTitle>\n<navMap>\n${entries.map((entry, i) => `<navPoint id="n${i + 1}" playOrder="${i + 1}"><navLabel><text>${text(entry.label)}</text></navLabel><content src="${attribute(target(entry))}"/></navPoint>`).join('\n')}\n</navMap>\n</ncx>\n`,
    ),
  })
  const item = ({ name }: { name: string }, i: number) => {
    const type = TYPES[name.split('.').pop()!] ?? 'application/octet-stream'
    const role = name === 'nav.xhtml' ? ' properties="nav"' : name === parts.cover ? ' properties="cover-image"' : ''
    return `<item id="${name === parts.cover ? 'cover-image' : name === 'toc.ncx' ? 'ncx' : `f${i}`}" href="${attribute(name)}" media-type="${type}"${role}/>`
  }
  const idOf = new Map(files.map((file, i) => [file.name, file.name === parts.cover ? 'cover-image' : file.name === 'toc.ncx' ? 'ncx' : `f${i}`]))
  const opf =
    `<?xml version="1.0" encoding="utf-8"?>\n<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id" xml:lang="${attribute(language)}">\n<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">\n` +
    `<dc:identifier id="book-id">${text(id)}</dc:identifier>\n<dc:title>${text(title)}</dc:title>\n<dc:language>${text(language)}</dc:language>\n` +
    parts.authors.map((author) => `<dc:creator>${text(author)}</dc:creator>\n`).join('') +
    (parts.publisher ? `<dc:publisher>${text(parts.publisher)}</dc:publisher>\n` : '') +
    // A book must say when it was last changed. This says nothing of when it was converted.
    `<meta property="dcterms:modified">2000-01-01T00:00:00Z</meta>\n${parts.cover && names.has(parts.cover) ? '<meta name="cover" content="cover-image"/>\n' : ''}</metadata>\n` +
    `<manifest>\n${files.map(item).join('\n')}\n</manifest>\n<spine toc="ncx">\n${chapters.map((name) => `<itemref idref="${idOf.get(name)}"/>`).join('\n')}\n</spine>\n</package>\n`

  const file = (name: string, data: Uint8Array): Entry => ({ name, data, directory: false, modified: null, executable: false })
  return writeZip([
    // The kind of file comes first and is stored as it is, so that an EPUB can be known from its first bytes.
    file('mimetype', encoder.encode('application/epub+zip')),
    file('META-INF/container.xml', encoder.encode('<?xml version="1.0" encoding="utf-8"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">\n<rootfiles>\n<rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>\n</rootfiles>\n</container>\n')),
    file('OEBPS/content.opf', encoder.encode(opf)),
    ...files.map((entry) => file(`OEBPS/${entry.name}`, entry.data)),
  ])
}
