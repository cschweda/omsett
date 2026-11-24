import { lookup, Refusal } from '../util'

// PDF → HTML. A PDF says where each letter sits on a page. Some also say what the letters are:
// a "tagged" PDF carries a tree that marks this run of words as a heading, that as a list, that
// as a table's header cell. Where the tree is there it is read, and nothing is guessed. Where
// it is not, structure is estimated from how the page looks: larger type is a heading, a line
// that opens with a bullet is a list item, a gap is a new paragraph.
//
// The file is opened by pdf.js, the reader Firefox uses for every PDF on the web. Nothing in
// a PDF is run: its scripts, its forms and the actions it attaches to opening are never called.

export interface ReadPdf {
  /** The inside of <body>. Not yet cleaned: the caller passes it through the sanitizer. */
  body: string
  title: string | null
  language: string | null
  /**
   * How the structure was found: read from the PDF's own tags; estimated from its layout
   * because it has no tags; or estimated although it has tags, because the tags do not
   * describe its text.
   */
  structure: 'tags' | 'layout' | 'layout-despite-tags'
  pages: number
}

/** More pages than this is not converted in a browser tab. */
const MAX_PAGES = 2000
/** The most HTML a PDF may become. */
const MAX_WRITTEN = 32 * 1024 * 1024
const MAX_DEPTH = 64

export const notPdf = () => new Refusal('This file is not a valid PDF')
const tooLarge = () => new Refusal('This PDF is too large to convert in a browser')

const escapeHtml = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')

interface TextItem {
  str: string
  height: number
  transform: number[]
  hasEOL: boolean
}
interface Marker {
  type: string
  id?: string
}
interface TreeNode {
  role?: string
  alt?: string
  type?: string
  id?: string
  children?: TreeNode[]
}

/** Structure tags that only group what is inside them. */
const GROUPS = new Set(['Root', 'Document', 'Part', 'Art', 'Sect', 'Div', 'NonStruct', 'Reference', 'TOC', 'Index', 'LBody', 'TBody', 'THead', 'TFoot', 'Private', 'DocumentFragment', 'Aside'])
const INLINE = lookup<string>({ Span: '', Quote: 'q', Code: 'code', Em: 'em', Strong: 'strong', Sub: 'sub', Sup: 'sup' })
const BULLET = /^[•‣◦⁃∙·▪●○–—*-]\s*/
const NUMBERED = /^(?:\d{1,3}|[a-z])[.)]\s+/i

export async function readPdf(bytes: Uint8Array): Promise<ReadPdf> {
  // The reader and the part of it that parses, loaded together and run here, in the worker
  // this engine already runs in. Nothing is fetched when a file is opened.
  const [pdfjs, parser] = await Promise.all([
    import('pdfjs-dist/legacy/build/pdf.mjs'),
    // @ts-expect-error -- the parsing half of the library ships without types of its own
    import('pdfjs-dist/legacy/build/pdf.worker.mjs') as Promise<unknown>,
  ])
  ;(globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = parser

  const task = pdfjs.getDocument({
    data: bytes,
    // No font of the device's is consulted, and none from the file is installed in the page.
    useSystemFonts: false,
    disableFontFace: true,
    // Forms that are programs (XFA) are not opened.
    enableXfa: false,
    stopAtErrors: false,
    verbosity: 0,
  })
  try {
    let document: Awaited<typeof task.promise>
    try {
      document = await task.promise
    } catch (error) {
      const name = error instanceof Error ? error.name : ''
      if (name === 'PasswordException') throw new Refusal('This PDF is protected by a password, which Omsett cannot open')
      throw notPdf()
    }
    if (document.numPages > MAX_PAGES) throw tooLarge()
    return await read(document)
  } catch (error) {
    // The reader's own complaints (a list of pages that holds itself, a part that is missing)
    // are written for programmers. What to say is that the file is not a sound PDF.
    throw error instanceof Refusal ? error : notPdf()
  } finally {
    await task.destroy().catch(() => {})
  }

  async function read(document: Awaited<typeof task.promise>): Promise<ReadPdf> {
    const details = await document.getMetadata().catch(() => null)
    const info = (details?.info ?? {}) as { Title?: unknown; Language?: unknown }
    const title = typeof info.Title === 'string' && info.Title.trim() !== '' ? info.Title.trim() : null
    const stated = typeof info.Language === 'string' ? info.Language : ''
    const language = /^[a-z]{2,3}(?:-[a-z0-9]{2,8}){0,3}$/i.test(stated) ? stated : null

    // Every page is read once: its tree if it has one, its words, and where its links go.
    const pages: Array<{ tree: TreeNode | null; items: Array<TextItem | Marker>; links: Map<string, string>; height: number }> = []
    for (let number = 1; number <= document.numPages; number++) {
      const page = await document.getPage(number)
      const [tree, content, annotations] = await Promise.all([
        page.getStructTree().catch(() => null) as Promise<TreeNode | null>,
        page.getTextContent({ includeMarkedContent: true }),
        page.getAnnotations().catch(() => []),
      ])
      const links = new Map<string, string>()
      for (const annotation of annotations as Array<{ id?: string; url?: string }>) {
        // Only an address the reader has checked is a web address is kept.
        if (annotation.id && typeof annotation.url === 'string' && /^(?:https?:|mailto:)/i.test(annotation.url)) links.set(annotation.id, annotation.url)
      }
      pages.push({ tree, items: content.items as Array<TextItem | Marker>, links, height: page.view[3] ?? 792 })
      page.cleanup()
    }

    const hasWords = (node: TreeNode | null, depth = 0): boolean =>
      node !== null && depth <= MAX_DEPTH && (node.children ?? []).some((kid) => kid.type === 'content' || hasWords(kid, depth + 1))
    const hasTags = pages.some((page) => hasWords(page.tree))
    const written = (from: (page: (typeof pages)[number]) => string) => {
      let html = ''
      for (const page of pages) {
        html += from(page)
        if (html.length > MAX_WRITTEN) throw tooLarge()
      }
      return html
    }
    // Tags are believed only if they do the two things tags are for. They must say what at
    // least some of the text is (a paragraph, a heading, a list, a table): tags that mark each
    // page as one block say nothing. And they must cover the text: a PDF tagged only for its
    // pictures would otherwise come out with its pictures' descriptions and none of its words.
    let body = hasTags ? written(fromTags) : ''
    const words = pages.reduce((sum, page) => sum + content(page.items, page.tree), 0)
    // What the tags gave, counted the same way: the words alone, without the descriptions of
    // pictures (which are not on the page) and with each escaped character as the one it is.
    const covered = body
      .replace(/\[Picture: [^\]]*\]/g, '')
      .replace(/<[^>]*>/g, '')
      .replace(/&[a-z#0-9]+;/gi, 'x')
      .replace(/\s+/g, '').length
    const describes = pages.some((page) => names(page.tree).some((role) => /^(?:P|H[1-6]?|L|LI|Table|TH|TD|Title)$/.test(role)))
    // Nearly all, not all: list bullets are words on the page and are not carried, and a
    // stray mark or two is common. More than that missing, and the tags are not trusted.
    const structure = !hasTags ? 'layout' : describes && covered >= words * 0.97 ? 'tags' : 'layout-despite-tags'
    if (structure !== 'tags') {
      const size = bodySize(pages)
      body = written((page) => fromLayout(page, size))
    }
    if (body.replace(/<[^>]*>/g, '').trim() === '') {
      throw new Refusal('This PDF has no text in it. It may be a scan: pictures of pages, which Omsett cannot read the words in yet')
    }
    return { body, title, language, structure, pages: document.numPages }
  }
}

const isText = (item: TextItem | Marker): item is TextItem => typeof (item as TextItem).str === 'string'

/** The marked runs a tree gives to the labels of list items: their bullets and their numbers. */
function labelRuns(tree: TreeNode | null): Set<string> {
  const found = new Set<string>()
  const pending: Array<[TreeNode, number, boolean]> = tree ? [[tree, 0, false]] : []
  while (pending.length > 0) {
    const [node, depth, label] = pending.pop()!
    if (label && node.type === 'content' && node.id) found.add(node.id)
    if (depth < MAX_DEPTH) for (const kid of node.children ?? []) pending.push([kid, depth + 1, label || kid.role === 'Lbl'])
  }
  return found
}

/** How many characters a page holds that are its content: not spaces, and not page furniture. */
function content(items: Array<TextItem | Marker>, tree: TreeNode | null = null): number {
  let count = 0
  // What a PDF marks as an artifact (a running head, a page number) is not content. Nor is what
  // its tags call the label of a list item: "2." and a dash are drawn by the list, and are not
  // carried as words, so they are not counted as words the tags failed to give.
  const labels = labelRuns(tree)
  const open: boolean[] = []
  for (const item of items) {
    if (isText(item)) {
      // A list's bullet is a mark, not a word.
      if (!open.includes(true) && !/^[\u2022\u25E6\u25AA\u25CF\u00B7]$/.test(item.str.trim())) count += item.str.replace(/\s+/g, '').length
    } else if (item.type?.startsWith('begin')) open.push((item as Marker & { tag?: string }).tag === 'Artifact' || labels.has(item.id ?? ''))
    else if (item.type === 'endMarkedContent') open.pop()
  }
  return count
}

/** Every structure tag used in a tree. */
function names(tree: TreeNode | null): string[] {
  const found: string[] = []
  const pending: Array<[TreeNode, number]> = tree ? [[tree, 0]] : []
  while (pending.length > 0) {
    const [node, depth] = pending.pop()!
    if (node.role) found.push(node.role)
    if (depth < MAX_DEPTH) for (const kid of node.children ?? []) if (!kid.type) pending.push([kid, depth + 1])
  }
  return found
}

// --- From the PDF's own tags -------------------------------------------------------------------

function fromTags(page: { tree: TreeNode | null; items: Array<TextItem | Marker>; links: Map<string, string> }): string {
  if (!page.tree) return ''
  // The words inside each marked run, by the run's id. A run inside a run belongs to the inner.
  const words = new Map<string, string>()
  const open: Array<string | null> = []
  for (const item of page.items) {
    if (isText(item)) {
      const id = open.findLast((entry) => entry !== null)
      if (id) words.set(id, (words.get(id) ?? '') + item.str + (item.hasEOL ? ' ' : ''))
    } else if (item.type === 'beginMarkedContentProps' || item.type === 'beginMarkedContent') open.push(item.id ?? null)
    else if (item.type === 'endMarkedContent') open.pop()
  }

  /** Everything said inside a node, as a run of text with its links and inline marks. */
  const inline = (node: TreeNode, depth: number): string => {
    if (depth > MAX_DEPTH) throw notPdf()
    let html = ''
    for (const kid of node.children ?? []) {
      if (kid.type === 'content') html += escapeHtml(words.get(kid.id ?? '') ?? '')
      else if (kid.type) continue
      else if (kid.role === 'Link') {
        const target = (kid.children ?? []).map((part) => (part.type === 'annotation' || part.type === 'object' ? page.links.get((part.id ?? '').replace('pdfjs_internal_id_', '')) : undefined)).find(Boolean)
        const text = inline(kid, depth + 1)
        // The space around a link's words stays outside the link.
        html += target && text.trim() !== '' ? `${/^\s/.test(text) ? ' ' : ''}<a href="${escapeHtml(target)}">${text.trim()}</a>${/\s$/.test(text) ? ' ' : ''}` : text
      } else if (kid.role === 'Figure' || kid.role === 'Formula') html += kid.alt ? `[Picture: ${escapeHtml(kid.alt)}]` : ''
      // A list's bullet or number is drawn by the list; the words of it are not content.
      else if (kid.role === 'Lbl' && node.role === 'LI') continue
      else if (kid.role === 'Artifact') continue
      else {
        const tag = INLINE[kid.role ?? '']
        const text = inline(kid, depth + 1)
        html += tag ? `<${tag}>${text}</${tag}>` : text
      }
    }
    return html
  }
  const tidy = (html: string) => html.replace(/\s+/g, ' ').trim()

  const block = (node: TreeNode, depth: number): string => {
    if (depth > MAX_DEPTH) throw notPdf()
    const role = node.role ?? ''
    const kids = (node.children ?? []).filter((kid) => !kid.type)
    const inside = () => kids.map((kid) => block(kid, depth + 1)).join('')
    if (role === 'Artifact') return ''
    const heading = /^H([1-6])$/.exec(role)
    if (heading) return wrap(`h${heading[1]}`, tidy(inline(node, depth)))
    if (role === 'H' || role === 'Title') return wrap(role === 'Title' ? 'h1' : 'h2', tidy(inline(node, depth)))
    if (role === 'L') {
      // Numbered if its first item is labelled with a number or a letter.
      const label = kids[0]?.children?.find((kid) => kid.role === 'Lbl')
      const ordered = label !== undefined && NUMBERED.test(`${tidy(inline(label, depth + 1))} `)
      return `<${ordered ? 'ol' : 'ul'}>${inside()}</${ordered ? 'ol' : 'ul'}>`
    }
    if (role === 'LI') {
      const nested = kids.flatMap((kid) => (kid.role === 'L' ? [kid] : (kid.children ?? []).filter((inner) => inner.role === 'L')))
      const text = tidy(inline({ ...node, children: (node.children ?? []).map((kid) => (kid.role === 'LBody' ? { ...kid, children: (kid.children ?? []).filter((inner) => inner.role !== 'L') } : kid)).filter((kid) => kid.role !== 'L') }, depth))
      return `<li>${text}${nested.map((list) => block(list, depth + 1)).join('')}</li>`
    }
    if (role === 'Table') {
      const rows = (list: TreeNode[]): TreeNode[] => list.flatMap((kid) => (kid.role === 'TR' ? [kid] : ['THead', 'TBody', 'TFoot'].includes(kid.role ?? '') ? rows((kid.children ?? []).filter((inner) => !inner.type)) : []))
      const written = rows(kids).map((row) => {
        const cells = (row.children ?? []).filter((cell) => cell.role === 'TH' || cell.role === 'TD')
        return { head: cells.length > 0 && cells.every((cell) => cell.role === 'TH'), html: `<tr>${cells.map((cell) => wrapAlways(cell.role === 'TH' ? 'th' : 'td', tidy(inline(cell, depth + 1)))).join('')}</tr>` }
      })
      const caption = kids.find((kid) => kid.role === 'Caption')
      const head = written.filter((row) => row.head).map((row) => row.html)
      const rest = written.filter((row) => !row.head).map((row) => row.html)
      if (written.length === 0) return ''
      return `<table>${caption ? wrap('caption', tidy(inline(caption, depth + 1))) : ''}${head.length ? `<thead>${head.join('')}</thead>` : ''}<tbody>${rest.join('')}</tbody></table>`
    }
    if (role === 'Figure' || role === 'Formula') return node.alt ? `<p>[Picture: ${escapeHtml(node.alt)}]</p>` : ''
    if (role === 'BlockQuote') return `<blockquote>${inside() || wrap('p', tidy(inline(node, depth)))}</blockquote>`
    if (role === 'TOCI') return wrap('p', tidy(inline(node, depth)))
    if (GROUPS.has(role)) {
      // A group may hold loose words of its own beside its children; they are a paragraph.
      const loose = (node.children ?? []).some((kid) => kid.type === 'content')
      return loose && kids.length === 0 ? wrap('p', tidy(inline(node, depth))) : inside()
    }
    // A paragraph, a caption, a note, and any tag this does not know: its words, as a paragraph.
    return wrap('p', tidy(inline(node, depth)))
  }
  return block(page.tree, 0)
}

const wrap = (tag: string, text: string) => (text === '' ? '' : `<${tag}>${text}</${tag}>`)
const wrapAlways = (tag: string, text: string) => `<${tag}>${text}</${tag}>`

// --- From the look of the page -----------------------------------------------------------------

interface Line {
  text: string
  size: number
  y: number
}

/** The lines on a page, in the order the PDF gives them, which is usually the order they are read in. */
function linesOf(items: Array<TextItem | Marker>): Line[] {
  const lines: Line[] = []
  let current: Line | null = null
  for (const item of items) {
    if (!isText(item)) continue
    const y = item.transform[5] ?? 0
    if (item.str !== '') {
      // Words on the same baseline, near enough, are one line.
      if (current && Math.abs(current.y - y) < Math.max(2, current.size * 0.3)) {
        current.text += item.str
        current.size = Math.max(current.size, item.height)
      } else {
        current = { text: item.str, size: item.height, y }
        lines.push(current)
      }
    }
    if (item.hasEOL) current = null
  }
  return lines.map((line) => ({ ...line, text: line.text.replace(/\s+/g, ' ').trim() })).filter((line) => line.text !== '')
}

/** The size most of the words are set in, across the whole file: the size of ordinary text. */
function bodySize(pages: Array<{ items: Array<TextItem | Marker> }>): number {
  const weight = new Map<number, number>()
  for (const page of pages) {
    for (const item of page.items) {
      if (!isText(item) || item.str.trim() === '') continue
      const size = Math.round(item.height * 2) / 2
      weight.set(size, (weight.get(size) ?? 0) + item.str.length)
    }
  }
  return [...weight.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 11
}

function fromLayout(page: { items: Array<TextItem | Marker>; height: number }, body: number): string {
  const lines = linesOf(page.items)
  let html = ''
  let paragraph: string[] = []
  let list: { tag: 'ul' | 'ol'; items: string[] } | null = null
  let previous: Line | null = null
  let heading: { level: number; size: number } | null = null
  const endParagraph = () => {
    if (paragraph.length > 0) html += `<p>${escapeHtml(paragraph.join(' '))}</p>`
    paragraph = []
  }
  const endList = () => {
    if (list) html += `<${list.tag}>${list.items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</${list.tag}>`
    list = null
  }
  for (const line of lines) {
    // A number alone at the head or foot of a page is the page's number.
    const edge = line.y < page.height * 0.08 || line.y > page.height * 0.94
    if (edge && /^(?:page\s+)?\d{1,4}(?:\s+of\s+\d{1,4})?$/i.test(line.text)) continue

    const gap = previous ? Math.abs(previous.y - line.y) : 0
    const apart = previous === null || gap > Math.max(previous.size, line.size) * 1.6
    const bullet = BULLET.exec(line.text)
    const numbered = NUMBERED.exec(line.text)
    // Type a good deal larger than the body's, in a short line, is a heading. How much larger says which.
    const ratio = line.size / body
    if (ratio >= 1.15 && line.text.length <= 120) {
      endParagraph()
      endList()
      const level = ratio >= 1.8 ? 1 : ratio >= 1.35 ? 2 : 3
      // A heading too long for one line is set on two or three, close together in the same
      // size. Those are one heading.
      if (heading && heading.level === level && !apart && Math.abs(heading.size - line.size) < 0.5 && html.endsWith(`</h${level}>`)) {
        html = `${html.slice(0, -`</h${level}>`.length)} ${escapeHtml(line.text)}</h${level}>`
      } else html += `<h${level}>${escapeHtml(line.text)}</h${level}>`
      heading = { level, size: line.size }
      previous = line
      continue
    } else if ((bullet && line.text.length > bullet[0].length) || numbered) {
      endParagraph()
      const tag = numbered && !bullet ? 'ol' : 'ul'
      if (list && list.tag !== tag) endList()
      list ??= { tag, items: [] }
      list.items.push(line.text.slice((bullet ?? numbered)![0].length))
    } else if (list && !apart) {
      // A line close under a list item is the rest of that item.
      list.items[list.items.length - 1] += ` ${line.text}`
    } else {
      endList()
      if (apart) endParagraph()
      // A word broken across two lines with a hyphen is put back together.
      const last = paragraph.at(-1)
      if (last !== undefined && /[a-z]-$/.test(last) && /^[a-z]/.test(line.text)) paragraph[paragraph.length - 1] = last.slice(0, -1) + line.text
      else paragraph.push(line.text)
    }
    heading = null
    previous = line
  }
  endParagraph()
  endList()
  return html
}
