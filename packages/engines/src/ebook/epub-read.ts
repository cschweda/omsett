import { readZip } from '../archive/zip'
import type { Entry } from '../archive/entries'
import { all, attrs, child, kids, tagOf, type Node } from '../markup/docx-read'
import { Refusal, withinTags } from '../util'
import { MAX_PAGE_TAGS, tooManyTags, written, type Hast } from './epub-write'
import { pictureType, type Parts } from './kindle'
import { locked } from './mobi'

// An EPUB taken apart into what any e-book is made of. An EPUB is a ZIP: one file says where
// the book's list is, the list names every page, picture and stylesheet and the order the
// pages are read in, and another gives the contents. Each of those is a direction, and each is
// checked before it is followed: a name in the list is a file in the book or it is nothing.
//
// The pages come out under names of Omsett's own (page0001.xhtml, images/image0001.jpg), with
// every link and picture in them pointed at those. A page's stylesheets are not carried: what
// is read here goes on to be a page, a PDF or a document, each laid out afresh.

export const notEpub = () => new Refusal('This file is not a valid EPUB book')
const tooLarge = () => new Refusal('This book is too large to convert in a browser')

const MAX_PAGES = 5000
const MAX_PICTURES = 5000
const MAX_PAGE_BYTES = 32 * 1024 * 1024
/** All the pages of a book together. The longest novels are a few megabytes of text. */
const MAX_TEXT_BYTES = 64 * 1024 * 1024
const MAX_CONTENTS = 20_000
const MAX_CONTENTS_DEPTH = 12
const padded = (n: number) => String(n).padStart(4, '0')

/** Ways of scrambling a font so that it works only inside its book. Not copy protection: the pages can be read. */
const FONT_ONLY = new Set(['http://www.idpf.org/2008/embedding', 'http://ns.adobe.com/pdf/enc#RC'])

/** Tags that hold nothing in a page. Every other tag written closed ("<a id="x"/>") is opened and closed. */
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'])

const SWALLOWS = new Set(['plaintext', 'xmp', 'listing', 'noembed', 'noframes'])

/**
 * A book's pages are XML, where any tag may be written closed: <a id="x"/>, <title/>. Read as a
 * web page, such a tag is taken as opened and never closed, and swallows what follows it. So
 * each is written out in full first. One pass, a character at a time.
 */
export function openedAndClosed(source: string): string {
  let out = ''
  let at = 0
  while (at < source.length) {
    const open = source.indexOf('<', at)
    if (open < 0) break
    // Comments, and text marked to be taken as it is, are passed over whole.
    const skip = source.startsWith('<!--', open) ? '-->' : source.startsWith('<![CDATA[', open) ? ']]>' : source.startsWith('<?', open) ? '?>' : null
    if (skip) {
      const end = source.indexOf(skip, open + 2)
      const next = end < 0 ? source.length : end + skip.length
      // What a page is to make of itself (<?xml …?>) is not text, and is left out.
      out += source.slice(at, open) + (skip === '?>' ? '' : source.slice(open, next))
      at = next
      continue
    }
    let end = open + 1
    let quote = ''
    for (; end < source.length; end++) {
      const letter = source[end]!
      if (quote) {
        if (letter === quote) quote = ''
      } else if (letter === '"' || letter === "'") quote = letter
      else if (letter === '>' || letter === '<') break
    }
    if (end >= source.length || source[end] === '<') {
      // Not a tag after all: a "<" by itself.
      out += source.slice(at, end)
      at = end
      continue
    }
    const tag = source.slice(open, end + 1)
    const name = /^<([a-z][\w:.-]*)/i.exec(tag)?.[1]?.toLowerCase()
    // A tag that tells a web page "all that follows is plain text" is left out, opening and closing: its words stay.
    const swallows = SWALLOWS.has(name ?? /^<\/([a-z][\w:.-]*)/i.exec(tag)?.[1]?.toLowerCase() ?? '')
    out += source.slice(at, open) + (swallows ? '' : name && tag.endsWith('/>') && !VOID.has(name) ? `${tag.slice(0, -2)}></${name}>` : tag)
    at = end + 1
  }
  return out + source.slice(at)
}

const MAX_DEPTH = 256
/** Tags a web page closes by itself when the next one opens, so that a run of them is not depth. */
const CLOSES_ITSELF = new Set(['p', 'li', 'dt', 'dd', 'tr', 'td', 'th', 'option', 'thead', 'tbody', 'tfoot'])

/** Whether a page opens more tags inside one another than a page of writing does. One pass. */
export function tooDeep(source: string): boolean {
  let open = 0
  for (const tag of source.matchAll(/<(\/?)([a-z][\w:.-]*)/gi)) {
    const name = tag[2]!.toLowerCase()
    if (VOID.has(name) || CLOSES_ITSELF.has(name)) continue
    open = tag[1] ? Math.max(0, open - 1) : open + 1
    if (open > MAX_DEPTH) return true
  }
  return false
}

/** A path named in one file of the book, as a path from the top of the book. Null if it leads out of the book or is an address. */
function resolve(from: string, href: string): { path: string; mark: string | null } | null {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//')) return null
  const cut = href.indexOf('#')
  const mark = cut < 0 ? null : href.slice(cut + 1)
  let named = cut < 0 ? href : href.slice(0, cut)
  try {
    named = decodeURIComponent(named)
  } catch {
    // Left as written: it will name nothing in the book, and so be nothing.
  }
  if (named === '') return { path: from, mark }
  const steps = named.startsWith('/') ? [] : from.split('/').slice(0, -1)
  for (const step of named.split('/')) {
    if (step === '..') {
      if (steps.length === 0) return null
      steps.pop()
    } else if (step !== '' && step !== '.') steps.push(step)
  }
  return { path: steps.join('/'), mark }
}

const words = (node: Node | undefined): string => {
  if (!node) return ''
  let out = ''
  const pending: Node[] = [node]
  for (let guard = 0; pending.length > 0 && guard < 10_000; guard++) {
    const next = pending.pop()!
    if (typeof next['#text'] === 'string') out = `${next['#text']}${out}`
    else pending.push(...kids(next))
  }
  return out.replace(/\s+/g, ' ').trim()
}

export async function readEpub(bytes: Uint8Array): Promise<Parts> {
  let entries: Entry[]
  try {
    entries = await readZip(bytes)
  } catch (error) {
    if (error instanceof Refusal && /more than Omsett will handle/.test(error.message)) throw tooLarge()
    throw notEpub()
  }
  const files = new Map<string, Uint8Array>()
  for (const entry of entries) if (!entry.directory) files.set(entry.name, entry.data)
  const decoder = new TextDecoder('utf-8')

  const { XMLParser } = await import('fast-xml-parser')
  const parser = new XMLParser({ preserveOrder: true, ignoreAttributes: false, attributeNamePrefix: '@', removeNSPrefix: true, parseTagValue: false, parseAttributeValue: false, trimValues: false, ignoreDeclaration: true, ignorePiTags: true })
  /** One of the book's lists, read as XML. A list that defines shorthand of its own is refused: that is how a small file is made vast. */
  const list = (path: string): Node[] => {
    const data = files.get(path)
    if (!data) return []
    if (data.length > MAX_PAGE_BYTES) throw tooLarge()
    const source = decoder.decode(data)
    if (/<!ENTITY/i.test(source)) throw notEpub()
    if (!withinTags(source)) throw tooLarge()
    try {
      return parser.parse(source) as Node[]
    } catch {
      throw notEpub()
    }
  }
  const root = (path: string, tag: string) => list(path).find((node) => tagOf(node) === tag)
  /** Every tag of a name, however deep, in the order written. */
  const within = (node: Node | undefined, tag: string): Node[] => {
    const found: Node[] = []
    const pending: Array<[Node, number]> = node ? [[node, 0]] : []
    for (let guard = 0; pending.length > 0 && guard < 500_000; guard++) {
      const [next, depth] = pending.pop()!
      if (tagOf(next) === tag) found.push(next)
      const inside = kids(next)
      if (depth < 64) for (let i = inside.length - 1; i >= 0; i--) pending.push([inside[i]!, depth + 1])
    }
    return found
  }

  // A locked book says so: it lists what is scrambled and how. Fonts scrambled to stay with
  // their book are not that; anything else is, and the book is refused, never worked round.
  // The names are looked for whatever their capitals: a reader on a Mac or Windows finds them so.
  const about = new Map([...files].filter(([name]) => /^meta-inf\//i.test(name)).map(([name, data]) => [name.toLowerCase(), data]))
  const scrambled = about.get('meta-inf/encryption.xml')
  if (scrambled) {
    // A list too long to read through is not taken on trust.
    if (scrambled.length > MAX_PAGE_BYTES) throw locked()
    const how = [...decoder.decode(scrambled).matchAll(/\bAlgorithm\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)].map((match) => match[1] ?? match[2]!)
    if (how.length === 0 || how.some((algorithm) => !FONT_ONLY.has(algorithm))) throw locked()
  }
  if (about.has('meta-inf/rights.xml') || about.has('meta-inf/sinf.xml') || about.has('meta-inf/license.lcpl') || [...files.keys()].some((name) => /^license\.lcpl$/i.test(name))) throw locked()

  const container = root('META-INF/container.xml', 'container')
  const listPath = within(container, 'rootfile').map((node) => attrs(node)['@full-path']).find((path) => typeof path === 'string' && files.has(path))
  if (!listPath) throw notEpub()
  const pack = root(listPath, 'package')
  const manifest = pack && child(pack, 'manifest')
  const spine = pack && child(pack, 'spine')
  if (!pack || !manifest || !spine) throw notEpub()

  // Everything the book says it holds, by the name the book gives it. Only what is really in the file counts.
  interface Item { path: string; type: string; role: string }
  const items = new Map<string, Item>()
  for (const item of all(manifest, 'item').slice(0, 20_000)) {
    const { '@id': id, '@href': href, '@media-type': type, '@properties': role } = attrs(item)
    const found = typeof href === 'string' ? resolve(listPath, href) : null
    if (typeof id === 'string' && found && files.has(found.path) && !items.has(id)) items.set(id, { path: found.path, type: (type ?? '').toLowerCase(), role: ` ${role ?? ''} ` })
  }

  // The pages, in the order they are read; each once.
  const pageOf = new Map<string, string>()
  const pages: Array<{ file: string; path: string }> = []
  for (const ref of all(spine, 'itemref')) {
    const item = items.get(attrs(ref)['@idref'] ?? '')
    if (!item || pageOf.has(item.path) || !/html/.test(item.type)) continue
    if (pages.length >= MAX_PAGES) throw tooLarge()
    const file = `page${padded(pages.length + 1)}.xhtml`
    pageOf.set(item.path, file)
    pages.push({ file, path: item.path })
  }
  if (pages.length === 0) throw new Refusal('This book has no pages in it')
  // Added up before any page is read: each page is under the limit for one, and together they may still be vast.
  if (pages.reduce((sum, page) => sum + files.get(page.path)!.length, 0) > MAX_TEXT_BYTES) throw tooLarge()

  // The pictures: those the book lists as pictures and that are, by their own first bytes.
  const pictureOf = new Map<string, string>()
  const pictures: Parts['pictures'] = []
  const webp = (data: Uint8Array) => data.length > 12 && String.fromCharCode(...data.subarray(0, 4), ...data.subarray(8, 12)) === 'RIFFWEBP'
  for (const item of items.values()) {
    if (!item.type.startsWith('image/') || pictureOf.has(item.path) || pictures.length >= MAX_PICTURES) continue
    const data = files.get(item.path)!
    const found = pictureType(data) ?? (webp(data) ? { type: 'image/webp', ending: 'webp' } : null)
    if (!found) continue
    const file = `images/image${padded(pictures.length + 1)}.${found.ending}`
    pictureOf.set(item.path, file)
    pictures.push({ file, bytes: data, type: found.type })
  }

  const { unified } = await import('unified')
  const parse = await import('rehype-parse')
  const reader = unified().use(parse.default)
  const tree = (path: string): Hast => {
    const data = files.get(path)!
    if (data.length > MAX_PAGE_BYTES) throw tooLarge()
    const source = openedAndClosed(decoder.decode(data))
    // Both counted before the page is read: how much is in it, so that every walk below reaches
    // its end, and how deep it goes, so that no browser's stack decides what is refused.
    if (!withinTags(source, MAX_PAGE_TAGS)) throw tooManyTags()
    if (tooDeep(source)) throw new Refusal('This file is nested too deeply to convert')
    return reader.parse(source) as unknown as Hast
  }
  /** Where a link in a page of the book leads, in the names given here. Null where it leads nowhere in the book. */
  const linked = (from: string, href: string): string | null => {
    const found = resolve(from, href)
    const file = found && pageOf.get(found.path)
    return file ? `${file}${found.mark ? `#${found.mark}` : ''}` : null
  }

  const chapters: Parts['chapters'] = []
  for (const page of pages) {
    const whole = tree(page.path)
    let body: Hast | undefined
    const pending: Hast[] = [whole]
    for (let guard = 0; pending.length > 0 && guard < 2_000_000; guard++) {
      const node = pending.pop()!
      const properties = node.properties ?? {}
      if (node.tagName === 'body' && !body) body = node
      if (node.tagName === 'a' && typeof properties.href === 'string' && !/^(?:https?|mailto):/i.test(properties.href)) {
        const to = linked(page.path, properties.href)
        if (to) properties.href = to
        else delete properties.href
      }
      if (node.tagName === 'img') {
        const found = typeof properties.src === 'string' ? resolve(page.path, properties.src) : null
        const file = found && pictureOf.get(found.path)
        if (file) properties.src = file
        else delete properties.src
      }
      // A cover is often a drawing with one picture in it. The picture is what there is to keep.
      if (node.tagName === 'svg') {
        const inside: Hast[] = []
        const drawn: Hast[] = [node]
        for (let turn = 0; drawn.length > 0 && turn < 10_000; turn++) {
          const part = drawn.pop()!
          const address = part.properties?.xLinkHref ?? part.properties?.href
          const found = part.tagName === 'image' && typeof address === 'string' ? resolve(page.path, address) : null
          const file = found && pictureOf.get(found.path)
          if (file) inside.push({ type: 'element', tagName: 'img', properties: { src: file, alt: '' }, children: [] })
          for (const kid of part.children ?? []) if (kid.type === 'element') drawn.push(kid)
        }
        node.tagName = 'div'
        node.properties = {}
        node.children = inside
        continue
      }
      for (const kid of node.children ?? []) if (kid.type === 'element') pending.push(kid)
    }
    chapters.push({ file: page.file, html: written((body ?? whole).children ?? []) })
  }

  // The contents: the newer kind of list where the book has one, else the older.
  const contents: Parts['contents'] = []
  const entry = (label: string, from: string, href: string | undefined, depth: number) => {
    const to = typeof href === 'string' ? linked(from, href) : null
    if (!to || !label || contents.length >= MAX_CONTENTS) return
    const cut = to.indexOf('#')
    contents.push({ label: label.slice(0, 500), file: cut < 0 ? to : to.slice(0, cut), anchor: cut < 0 ? null : to.slice(cut + 1) || null, depth: Math.min(depth, MAX_CONTENTS_DEPTH) })
  }
  const said = (node: Hast): string => {
    let out = ''
    const pending: Hast[] = [node]
    for (let guard = 0; pending.length > 0 && guard < 10_000; guard++) {
      const next = pending.pop()!
      if (next.type === 'text') out += next.value ?? ''
      // A list inside an entry is the entries under it, not part of its name.
      else for (let i = (next.children ?? []).length - 1; i >= 0; i--) if (next.children![i]!.tagName !== 'ol' && next.children![i]!.tagName !== 'ul') pending.push(next.children![i]!)
    }
    return out.replace(/\s+/g, ' ').trim()
  }
  const newer = [...items.values()].find((item) => item.role.includes(' nav ') && /html/.test(item.type))
  if (newer) {
    const navs: Hast[] = []
    const pending: Hast[] = [tree(newer.path)]
    for (let guard = 0; pending.length > 0 && guard < 500_000; guard++) {
      const node = pending.pop()!
      if (node.tagName === 'nav') navs.push(node)
      else for (let i = (node.children ?? []).length - 1; i >= 0; i--) pending.push(node.children![i]!)
    }
    const chosen = navs.find((nav) => /\btoc\b/.test(String(nav.properties?.['epub:type'] ?? nav.properties?.role ?? ''))) ?? navs[0]
    const walk: Array<[Hast, number]> = chosen ? [[chosen, -1]] : []
    for (let guard = 0; walk.length > 0 && guard < 500_000; guard++) {
      const [node, depth] = walk.pop()!
      if (node.tagName === 'a') {
        entry(said(node), newer.path, typeof node.properties?.href === 'string' ? node.properties.href : undefined, Math.max(0, depth))
        continue
      }
      const deeper = node.tagName === 'ol' || node.tagName === 'ul' ? depth + 1 : depth
      for (let i = (node.children ?? []).length - 1; i >= 0; i--) if (node.children![i]!.type === 'element') walk.push([node.children![i]!, deeper])
    }
  }
  if (contents.length === 0) {
    const older = items.get(attrs(spine)['@toc'] ?? '') ?? [...items.values()].find((item) => item.type === 'application/x-dtbncx+xml')
    const map = older && child(root(older.path, 'ncx') ?? {}, 'navMap')
    const walk: Array<[Node, number]> = map ? all(map, 'navPoint').reverse().map((point) => [point, 0]) : []
    for (let guard = 0; walk.length > 0 && guard < 500_000; guard++) {
      const [point, depth] = walk.pop()!
      const label = child(point, 'navLabel')
      entry(words(label && child(label, 'text')), older!.path, attrs(child(point, 'content') ?? {})['@src'], depth)
      for (const under of all(point, 'navPoint').reverse()) walk.push([under, depth + 1])
    }
  }

  // What the book says of itself.
  const facts = child(pack, 'metadata')
  const stated = (tag: string) => (facts ? all(facts, tag) : []).map((node) => words(node)).filter(Boolean)
  const language = stated('language')[0] ?? ''
  const cover =
    [...items.values()].find((item) => item.role.includes(' cover-image '))?.path ??
    items.get((facts ? all(facts, 'meta') : []).map((node) => attrs(node)).find((meta) => meta['@name'] === 'cover')?.['@content'] ?? '')?.path
  return {
    title: (stated('title')[0] ?? '').slice(0, 500),
    authors: stated('creator').slice(0, 20).map((author) => author.slice(0, 200)),
    language: /^[a-z]{2,3}(?:-[a-z0-9]{2,8}){0,2}$/i.test(language) ? language : 'en',
    publisher: stated('publisher')[0]?.slice(0, 200) ?? null,
    description: stated('description')[0]?.slice(0, 4000) ?? null,
    chapters,
    // Each of the three things this becomes is laid out afresh, so the book's stylesheets are not carried.
    styles: [],
    pictures,
    cover: (cover && pictureOf.get(cover)) ?? null,
    contents,
  }
}
