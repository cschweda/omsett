import { officeToHtml, readPage } from '../markup'
import { Refusal, withinTags } from '../util'
import { MAX_PAGE_TAGS, tooManyTags, written, type Hast } from './epub-write'
import { pictureType, type Parts } from './kindle'

// A book as one page, and a page as a book.
//
// A book is many pages that link to each other by name. As one page they are sections, one
// after another: every mark a link could point at is renamed for the section it is in, and
// every link is pointed at the new name, so that a note still leads to its place. Pictures go
// inside the page. The page is then cleaned as any page Omsett writes is.
//
// A page becomes a book the other way: it is cut where its top headings are, each stretch a
// chapter, and the headings are the list of contents.

/** Pictures are carried inside the page, which later steps read whole. Past this much, the rest are left out. */
const MAX_PICTURE_BYTES = 9 * 1024 * 1024
const MAX_PAGE_BYTES = 16 * 1024 * 1024
const WALK = 4_000_000
const NOT_WORDS = new Set(['head', 'title', 'script', 'style', 'template', 'noscript', 'iframe', 'object', 'embed', 'svg', 'math', 'form', 'input', 'button', 'select', 'textarea'])

function address(bytes: Uint8Array, type: string): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCodePoint(...bytes.subarray(i, i + 0x8000))
  return `data:${type};base64,${btoa(binary)}`
}

/** Every element of a tree, in the order written, without recursion. */
function* elements(tree: Hast): Generator<Hast> {
  const pending: Hast[] = [tree]
  for (let guard = 0; pending.length > 0 && guard < WALK; guard++) {
    const node = pending.pop()!
    if (node.type === 'element') yield node
    // Read after the yield: whoever is walking may have changed what is inside.
    const inside = node.children ?? []
    for (let i = inside.length - 1; i >= 0; i--) if (inside[i]!.type === 'element') pending.push(inside[i]!)
  }
  // A walk that stopped short would leave part of a page unlooked at, and so uncleaned.
  if (pending.length > 0) throw tooManyTags()
}

const HEADING = /^h[1-6]$/
/** The words in a tag. With a limit, null as soon as there are more than that, without reading the rest. */
function said(node: Hast): string
function said(node: Hast, most: number): string | null
function said(node: Hast, most = Infinity): string | null {
  let out = ''
  const pending: Hast[] = [node]
  for (let guard = 0; pending.length > 0 && guard < 100_000; guard++) {
    if (out.length > most || guard > most * 4) return null
    const next = pending.pop()!
    if (next.type === 'text') out += next.value ?? ''
    else for (let i = (next.children ?? []).length - 1; i >= 0; i--) pending.push(next.children![i]!)
  }
  return out.replace(/\s+/g, ' ').trim()
}

export async function bookPage(parts: Parts, name: string): Promise<{ html: string; note?: string }> {
  const [{ unified }, parse] = await Promise.all([import('unified'), import('rehype-parse')])
  const reader = unified().use(parse.default)
  const section = new Map(parts.chapters.map((chapter, i) => [chapter.file, `part-${i + 1}`]))
  const pictures = new Map(parts.pictures.map((picture) => [picture.file, picture]))
  const budget = { left: MAX_PICTURE_BYTES }
  const carried = new Map<string, string | null>()
  let leftOut = 0
  const carry = (file: string): string | null => {
    if (carried.has(file)) return carried.get(file)!
    const picture = pictures.get(file)
    const fits = picture && picture.bytes.length <= budget.left
    if (picture && !fits) leftOut++
    if (fits) budget.left -= picture.bytes.length
    const made = fits ? address(picture.bytes, picture.type) : null
    carried.set(file, made)
    return made
  }

  const trees: Array<{ id: string; tree: Hast; file: string }> = []
  const marks = new Set<string>()
  let coverShown = false
  for (const chapter of parts.chapters) {
    const id = section.get(chapter.file)!
    // A page of a Kindle book is a whole page, with a head; what is wanted is what is in its body.
    if (!withinTags(chapter.html, MAX_PAGE_TAGS)) throw tooManyTags()
    let tree = reader.parse(chapter.html) as unknown as Hast
    for (const node of elements(tree)) {
      if (node.tagName === 'body') {
        tree = node
        break
      }
    }
    for (const node of elements(tree)) {
      // What a page carries that is not its words (styles, scripts) is not text to keep.
      node.children = (node.children ?? []).filter((kid) => !NOT_WORDS.has(kid.tagName ?? ''))
      const properties = (node.properties ??= {})
      // A class is a word for the book's own stylesheet, which is not carried.
      delete properties.className
      if (typeof properties.id === 'string' && properties.id !== '') {
        const mark = `${id}-${properties.id}`
        properties.id = mark
        marks.add(mark)
      }
      // The older way of marking a place: a link with a name.
      if (node.tagName === 'a' && typeof properties.name === 'string' && properties.name !== '' && properties.id === undefined) {
        const mark = `${id}-${properties.name}`
        properties.id = mark
        marks.add(mark)
      }
      delete properties.name
      if (node.tagName === 'img') {
        const cover = typeof properties.src === 'string' && properties.src === parts.cover
        if (cover) coverShown = true
        const made = typeof properties.src === 'string' ? carry(properties.src) : null
        if (made) properties.src = made
        else delete properties.src
        // A cover with no description is given the plain one: it is the first thing a screen reader meets.
        if (typeof properties.alt !== 'string' || (properties.alt === '' && cover)) properties.alt = cover ? `Cover of ${parts.title.trim() || 'the book'}` : ''
      }
    }
    // A mark with nothing in it (<a id="page-12"/>) is a place, not a thing. Its name goes to what
    // follows it, or to what it is in, and it is taken out: left in, it becomes an empty link
    // in Markdown and an empty run in a document.
    for (const node of [tree, ...elements(tree)]) {
      const inside = node.children ?? []
      // What follows each thing, found in one pass from the end: the next that is not empty space.
      const after: Array<Hast | undefined> = []
      let following: Hast | undefined
      for (let at = inside.length - 1; at >= 0; at--) {
        after[at] = following
        if (inside[at]!.type === 'element' || (inside[at]!.value ?? '').trim() !== '') following = inside[at]
      }
      const kept: Hast[] = []
      inside.forEach((kid, at) => {
        kept.push(kid)
        const mark = kid.properties?.id
        const empty = (kid.tagName === 'a' || kid.tagName === 'span') && kid.properties?.href === undefined && !(kid.children ?? []).some((part) => part.type === 'element' || (part.value ?? '').trim() !== '')
        if (!empty || typeof mark !== 'string') return
        const next = after[at]
        const taker = next?.type === 'element' && next.properties?.id === undefined ? next : node.type === 'element' && node.properties?.id === undefined && node.tagName !== 'body' ? node : null
        if (!taker) return
        ;(taker.properties ??= {}).id = mark
        kept.pop()
      })
      node.children = kept
    }
    trees.push({ id, tree, file: chapter.file })
  }

  // Many books mark no headings at all: a chapter's title is a paragraph set large. The book's
  // own list of contents says which paragraphs those are, so where a page has no heading, the
  // paragraph that is word for word an entry of the list is made the heading it is.
  let headingsMade = 0
  const BLOCKS = new Set(['p', 'div', 'table', 'ul', 'ol', 'blockquote', 'section'])
  const plain = (words: string) => words.replace(/\s+/g, ' ').trim().toLowerCase()
  for (const { tree, file } of trees) {
    const entries = parts.contents.filter((entry) => entry.file === file)
    if (entries.length === 0) continue
    const candidates: Hast[] = []
    let marked = false
    for (const node of elements(tree)) {
      if (HEADING.test(node.tagName ?? '')) marked = true
      else if ((node.tagName === 'p' || node.tagName === 'div') && !(node.children ?? []).some((kid) => BLOCKS.has(kid.tagName ?? ''))) candidates.push(node)
    }
    if (marked) continue
    const wanted = new Map(entries.map((entry) => [plain(entry.label), entry.depth] as const).reverse())
    for (const node of candidates) {
      // A title is short. What is longer than any entry is not read to its end.
      const words = said(node, 600)
      const depth = words === null ? undefined : wanted.get(plain(words))
      if (depth === undefined) continue
      wanted.delete(plain(words!))
      node.tagName = `h${Math.min(6, depth + 1)}`
      headingsMade++
    }
  }
  // Links, now that every place in the book has its new name.
  for (const { id, tree } of trees) {
    for (const node of elements(tree)) {
      const href = node.tagName === 'a' ? node.properties?.href : undefined
      if (node.tagName === 'a' && typeof href !== 'string') node.tagName = 'span'
      if (typeof href !== 'string' || /^[a-z][a-z0-9+.-]*:/i.test(href)) continue
      const cut = href.indexOf('#')
      const to = section.get(cut < 0 ? href : href.slice(0, cut)) ?? (cut === 0 ? id : undefined)
      const mark = cut < 0 ? '' : href.slice(cut + 1)
      if (!to) {
        // A link that leads nowhere in the book is its words and nothing more.
        delete node.properties!.href
        node.tagName = 'span'
      }
      else node.properties!.href = `#${mark && marks.has(`${to}-${mark}`) ? `${to}-${mark}` : to}`
    }
  }

  const title = parts.title.trim()
  let body = ''
  // The cover, where the book names one and no page of it shows it.
  const cover = parts.cover && !coverShown ? carry(parts.cover) : null
  if (cover) body += written([{ type: 'element', tagName: 'p', properties: {}, children: [{ type: 'element', tagName: 'img', properties: { src: cover, alt: `Cover of ${title || 'the book'}` }, children: [] }] }])
  for (const { id, tree } of trees) body += `<section id="${id}">${written(tree.children ?? [])}</section>\n`
  if (body.length > MAX_PAGE_BYTES) throw new Refusal('This book is too large to convert in a browser')

  const cleaned = await officeToHtml({ body, title: title || null, language: parts.language }, name)
  // Cleaning may have taken away a tag that a link pointed at. Such a link goes to its section instead.
  const kept = new Set([...cleaned.matchAll(/ id="([^"]*)"/g)].map((match) => match[1]!))
  // Only inside a link's own tag: the same letters in the words of the book are words.
  const html = cleaned.replace(/(<a (?:id="[^"]*" )?href="#)(part-\d+)-([^"]*)"/g, (whole, open: string, part: string, mark: string) => (kept.has(`${part}-${mark}`) ? whole : `${open}${part}"`))
  const inside = html.slice(html.indexOf('<body>'))
  if (!/<img\b/.test(inside) && inside.replace(/<[^<>]*>/g, '').trim() === '') throw new Refusal('This book has no text in it to convert')
  const notes = [
    ...(leftOut > 0 ? [`${leftOut === 1 ? 'One picture was' : `${leftOut} pictures were`} left out: the book's pictures come to more than a page can carry. The description of each is kept.`] : []),
    ...(headingsMade > 0 ? [`The book marks ${headingsMade === 1 ? 'a chapter title' : 'its chapter titles'} only by how ${headingsMade === 1 ? 'it looks' : 'they look'}. ${headingsMade === 1 ? 'One was' : `${headingsMade} were`} found from its list of contents and made ${headingsMade === 1 ? 'a heading' : 'headings'}.`] : []),
  ]
  return { html, ...(notes.length > 0 ? { note: notes.join(' ') } : {}) }
}

/** What a book's pages are given to look like, where the page they came from says nothing of looks. */
const STYLE = 'img { max-width: 100%; height: auto; }\ntable { border-collapse: collapse; }\nth, td { border: 1px solid; padding: 0.25em 0.5em; text-align: left; vertical-align: top; }\n'

export async function pageParts(text: string, name: string): Promise<Parts> {
  // Counted before it is read, so that every walk below reaches the end of the page.
  if (!withinTags(text, MAX_PAGE_TAGS * 4)) throw new Refusal('This page has more in it than Omsett will make a book of')
  const page = await readPage(text, name)
  // Wrappers at the top of the page are opened, so that the headings inside them are where a chapter can start.
  let top = ((page.tree as Hast).children ?? []).filter((node) => node.type === 'element' || (node.type === 'text' && (node.value ?? '').trim() !== ''))
  for (let round = 0; round < 8; round++) {
    const opened: Hast[] = []
    let any = false
    for (const node of top) {
      if (node.type === 'element' && ['section', 'div', 'article', 'main'].includes(node.tagName ?? '') && (node.children ?? []).some((kid) => kid.type === 'element')) {
        any = true
        const inside = (node.children ?? []).filter((kid) => kid.type === 'element' || (kid.type === 'text' && (kid.value ?? '').trim() !== ''))
        // A mark on the wrapper moves to the first thing in it that has none, so a link to it still lands.
        const first = inside.find((kid) => kid.type === 'element' && kid.properties?.id === undefined)
        if (typeof node.properties?.id === 'string' && first) (first.properties ??= {}).id = node.properties.id
        for (const kid of inside) opened.push(kid.type === 'text' ? { type: 'element', tagName: 'p', properties: {}, children: [kid] } : kid)
      } else opened.push(node.type === 'text' ? { type: 'element', tagName: 'p', properties: {}, children: [node] } : node)
    }
    top = opened
    if (!any) break
  }

  // A chapter starts at each heading of the highest level the page has more than one of.
  const levels = top.filter((node) => HEADING.test(node.tagName ?? '')).map((node) => Number(node.tagName![1]))
  const cutAt = [1, 2, 3].find((level) => levels.filter((found) => found === level).length > 1) ?? 0
  const groups: Hast[][] = [[]]
  for (const node of top) {
    if (cutAt > 0 && HEADING.test(node.tagName ?? '') && Number(node.tagName![1]) <= cutAt && groups.at(-1)!.length > 0) groups.push([])
    groups.at(-1)!.push(node)
  }
  if (groups.length > 5000) throw new Refusal('This page would make a book of more chapters than Omsett will write (5,000)')

  // Pictures carried in the page become files of the book; marks are noted, with the chapter each is in.
  const pictures: Parts['pictures'] = []
  const made = new Map<string, string>()
  const where = new Map<string, string>()
  const contents: Parts['contents'] = []
  const taken = new Set<string>()
  for (const group of groups) for (const node of group) for (const part of elements(node)) if (typeof part.properties?.id === 'string') taken.add(part.properties.id)
  const files = groups.map((_, i) => `page${String(i + 1).padStart(4, '0')}.xhtml`)
  let headings = 0
  groups.forEach((group, i) => {
    for (const top of group) {
      for (const node of elements(top)) {
        const properties = (node.properties ??= {})
        if (node.tagName === 'img' && typeof properties.src === 'string') {
          const src = properties.src
          let file = made.get(src)
          if (!file) {
            const data = /^data:image\/[a-z]+;base64,([a-z0-9+/=]+)$/i.exec(src)?.[1]
            let bytes: Uint8Array | null
            try {
              bytes = data ? Uint8Array.from(atob(data), (letter) => letter.charCodeAt(0)) : null
            } catch {
              bytes = null
            }
            const webp = bytes !== null && bytes.length > 12 && String.fromCharCode(...bytes.subarray(0, 4), ...bytes.subarray(8, 12)) === 'RIFFWEBP'
            const found = bytes && (pictureType(bytes) ?? (webp ? { type: 'image/webp', ending: 'webp' } : null))
            if (bytes && found && pictures.length < 5000) {
              file = `images/image${String(pictures.length + 1).padStart(4, '0')}.${found.ending}`
              pictures.push({ file, bytes, type: found.type })
              made.set(src, file)
            }
          }
          // A picture kept on a website is not fetched, and a book does not ask for one: its description stays.
          if (file) properties.src = file
          else delete properties.src
        }
        if (typeof properties.id === 'string') where.set(properties.id, files[i]!)
      }
      // The list of contents: the headings chapters are cut at, and those one level under them.
      const level = HEADING.test(top.tagName ?? '') ? Number(top.tagName![1]) : 0
      const label = level > 0 ? said(top).slice(0, 500) : ''
      if (label && (cutAt === 0 ? level <= 2 : level <= cutAt + 1) && contents.length < 20_000) {
        const properties = (top.properties ??= {})
        if (typeof properties.id !== 'string' || properties.id === '') {
          do properties.id = `heading-${++headings}`
          while (taken.has(properties.id as string))
          where.set(properties.id as string, files[i]!)
        }
        contents.push({ label, file: files[i]!, anchor: properties.id as string, depth: cutAt > 0 && level > cutAt ? 1 : 0 })
      }
    }
  })
  // A link to a place on the page is a link to the chapter that place is now in.
  groups.forEach((group, i) => {
    for (const top of group) {
      for (const node of elements(top)) {
        const href = node.tagName === 'a' ? node.properties?.href : undefined
        if (typeof href !== 'string' || !href.startsWith('#')) continue
        const file = where.get(href.slice(1))
        if (!file) delete node.properties!.href
        else if (file !== files[i]) node.properties!.href = `${file}${href}`
      }
    }
  })

  const chapters = groups.map((group, i) => ({ file: files[i]!, html: `<html><head><link rel="stylesheet" href="styles/book.css"/></head><body>${written(group)}</body></html>` })).filter((chapter, i) => groups[i]!.length > 0)
  if (chapters.length === 0) throw new Refusal('This file has no text in it to convert')
  return { title: page.title, authors: [], language: page.language, publisher: null, description: null, chapters, styles: [{ file: 'styles/book.css', css: STYLE }], pictures, cover: null, contents }
}
