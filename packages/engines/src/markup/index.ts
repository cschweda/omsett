import { markupInfo } from '../info'
import type { ConvertInput, ConvertOutput, Engine } from '../types'
import { outputName, Refusal, safeBaseName, throwIfAborted } from '../util'
import { readDoc } from './doc-read'
import { readDocx, type ReadDocument } from './docx-read'
import { readOdp } from './odp-read'
import { readOdt } from './odt-read'
import { readPpt } from './ppt-read'
import { readPptx } from './pptx-read'
import { writeDocx } from './docx-write'
import { writeOdt } from './odt-write'

// Markdown and HTML, each to the other. Both are read into a tree of headings, paragraphs,
// lists, tables and links, cleaned, and written out from the tree. Nothing a file holds is run,
// and nothing that could run is written: no scripts, no handlers, no links that are code.

/** Larger than this is not read. A long book in Markdown is about 1 MB. */
const MAX_MARKUP_BYTES = 16 * 1024 * 1024

const TOO_DEEP = 'This file is nested too deeply to convert'
/** A line indented further than this is inside a hundred lists or more. */
const DEEP_INDENT = 200
/** A few such lines may be a wide piece of quoted code. More is nesting for its own sake. */
const MAX_DEEP_LINES = 50

/**
 * Markdown nests by indenting, and reading it slows sharply with depth: a list a thousand
 * levels deep takes most of a minute. Depth like that is refused before any reading starts.
 */
function refuseDeepMarkdown(text: string): void {
  let deep = 0
  for (const line of text.split('\n')) {
    if (line.length <= DEEP_INDENT) continue
    let indent = 0
    while (indent < line.length && (line[indent] === ' ' || line[indent] === '\t')) indent++
    if (indent > DEEP_INDENT && ++deep > MAX_DEEP_LINES) throw new Refusal(TOO_DEEP)
  }
  // HTML written inside the Markdown nests too, and is read after the Markdown's own depth
  // has been checked. Counted here as tags opened and not yet closed.
  const VOID = /^(?:area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)$/i
  let open = 0
  for (const tag of text.matchAll(/<(\/?)([a-z][a-z0-9-]*)\b[^<>]*?(\/?)>/gi)) {
    if (VOID.test(tag[2]!) || tag[3]) continue
    open = tag[1] ? Math.max(0, open - 1) : open + 1
    if (open > MAX_DEPTH) throw new Refusal(TOO_DEEP)
  }
}

/**
 * A tag the cleaner does not keep is taken away and what was inside it left in its place. The
 * cleaner does that itself, but by handing every child to one call, and a tag with a hundred
 * thousand children is more than a call can take: a long page inside <main>, or inside <body>,
 * was refused as "nested too deeply" when it was not nested at all. Done here first, one
 * child at a time, so the cleaner never meets such a tag.
 */
function liftUnknown(schema: { tagNames?: readonly string[] | null; strip?: readonly string[] | null }) {
  const kept = new Set(schema.tagNames ?? [])
  const dropped = new Set(schema.strip ?? [])
  return (tree: Tree) => {
    const pending = [tree]
    while (pending.length > 0) {
      const node = pending.pop()!
      if (!node.children) continue
      const children: Tree[] = []
      const work: Tree[] = []
      pushAll(work, node.children)
      while (work.length > 0) {
        const child = work.pop()!
        if (child.type !== 'element' || kept.has(child.tagName ?? '')) children.push(child)
        // Dropped whole, with what is in it; or opened, and what is in it looked at in turn.
        else if (!dropped.has(child.tagName ?? '')) pushAll(work, child.children)
      }
      node.children = children
      pushAll(pending, children)
    }
  }
}

/** Children onto a stack, last first, so that they come off in the order they are written.
 *  One at a time: handing a hundred thousand of them to one call is more than a call can take. */
function pushAll(stack: Tree[], children: Tree[] | undefined): void {
  if (!children) return
  for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]!)
}

interface Tree {
  type: string
  tagName?: string
  value?: string
  children?: Tree[]
}

/** Parts of a page that are not its content, removed whole: their text is not text to keep. */
const NOT_CONTENT = new Set(['head', 'script', 'style', 'template', 'noscript', 'iframe', 'object', 'embed', 'svg', 'math'])

/** Removes those parts, without recursion: a page may be nested as deep as its author liked. */
function withoutChrome() {
  return (tree: Tree) => {
    const pending = [tree]
    while (pending.length > 0) {
      const node = pending.pop()!
      if (!node.children) continue
      node.children = node.children.filter((child) => !(child.type === 'element' && NOT_CONTENT.has(child.tagName ?? '')))
      pushAll(pending, node.children)
    }
  }
}

/** Deeper than this is not writing. How deep a reader can go before it fails differs from one
 *  browser to the next, so the limit is stated here and is the same in all of them. */
const MAX_DEPTH = 256

/** Refuses a tree nested past the limit. Walked with a list, not by calling itself. */
function limitDepth() {
  return (tree: Tree) => {
    const pending: Array<[Tree, number]> = [[tree, 0]]
    while (pending.length > 0) {
      const [node, depth] = pending.pop()!
      if (depth > MAX_DEPTH) throw new Refusal(TOO_DEEP)
      for (const child of node.children ?? []) pending.push([child, depth + 1])
    }
  }
}

/** The words of the first top heading, for the page's title. */
function firstHeading(tree: Tree): string | null {
  const pending = [tree]
  while (pending.length > 0) {
    const node = pending.pop()!
    if (node.type === 'element' && node.tagName === 'h1') {
      let words = ''
      const inside = [node]
      while (inside.length > 0) {
        const part = inside.pop()!
        if (part.type === 'text') words += part.value ?? ''
        pushAll(inside, part.children)
      }
      return words.replace(/\s+/g, ' ').trim() || null
    }
    pushAll(pending, node.children)
  }
  return null
}

const escapeText = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

/** Languages written from right to left, which a page must also be told. */
const RIGHT_TO_LEFT = new Set(['ar', 'he', 'fa', 'ur', 'ps', 'sd', 'yi', 'dv', 'ug', 'ckb'])

/**
 * The language option → a tag fit to write into a page: "en", "pt-BR", "zh-Hant". Anything that
 * is not shaped like one is replaced by English, so nothing typed here can break out of the
 * attribute it is written in.
 */
function languageTag(value: unknown): string {
  return typeof value === 'string' && /^[a-z]{2,3}(?:-[a-z0-9]{2,8}){0,3}$/i.test(value) ? value : 'en'
}

async function markdownToHtml(text: string, name: string, language: string): Promise<string> {
  const [{ unified }, parse, gfm, toHtml, raw, sanitize, stringify] = await Promise.all([
    import('unified'),
    import('remark-parse'),
    import('remark-gfm'),
    import('remark-rehype'),
    import('rehype-raw'),
    import('rehype-sanitize'),
    import('rehype-stringify'),
  ])
  let title: string | null = null
  const body = await unified()
    .use(parse.default)
    .use(gfm.default)
    .use(limitDepth)
    // HTML written inside the Markdown is kept, then cleaned with everything else.
    .use(toHtml.default, { allowDangerousHtml: true, clobberPrefix: '' })
    .use(raw.default)
    // And checked again, now that the HTML inside the Markdown is part of the tree.
    .use(limitDepth)
    .use(withoutChrome)
    // Ids are left as written, so a footnote's link still finds its note. Prefixing them guards
    // a page's own scripts against names in the content, and this page has no scripts.
    .use(liftUnknown, sanitize.defaultSchema)
    .use(sanitize.default, { ...sanitize.defaultSchema, clobberPrefix: '' })
    .use(() => (tree: Tree) => {
      title = firstHeading(tree)
    })
    .use(stringify.default)
    .process(text)
  return [
    '<!doctype html>',
    // Markdown does not say what language it is written in. A page has to, so that it is read
    // aloud and hyphenated properly; the person converting chooses it.
    `<html lang="${language}"${RIGHT_TO_LEFT.has(language.split('-')[0]!.toLowerCase()) ? ' dir="rtl"' : ''}>`,
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeText(title ?? safeBaseName(name))}</title>`,
    '</head>',
    '<body>',
    String(body).trimEnd(),
    '</body>',
    '</html>',
    '',
  ].join('\n')
}

async function htmlToMarkdown(text: string): Promise<string> {
  const [{ unified }, parse, sanitize, toMarkdown, gfm, stringify] = await Promise.all([
    import('unified'),
    import('rehype-parse'),
    import('rehype-sanitize'),
    import('rehype-remark'),
    import('remark-gfm'),
    import('remark-stringify'),
  ])
  const written = await unified()
    .use(parse.default)
    .use(limitDepth)
    .use(withoutChrome)
    // A picture carried inside the page stays inside the Markdown, as the same data: address.
    .use(liftUnknown, sanitize.defaultSchema)
    .use(sanitize.default, { ...withPictures(sanitize.defaultSchema), clobberPrefix: 'user-content-' })
    .use(onlyPictures)
    .use(toMarkdown.default)
    .use(gfm.default)
    .use(stringify.default, { bullet: '-', emphasis: '*', fences: true, rule: '-' })
    .process(text)
  return String(written)
}

/** A whole page around a body that has already been cleaned. */
function page(body: string, title: string, language: string): string {
  return [
    '<!doctype html>',
    `<html lang="${language}"${RIGHT_TO_LEFT.has(language.split('-')[0]!.toLowerCase()) ? ' dir="rtl"' : ''}>`,
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeText(title)}</title>`,
    '</head>',
    '<body>',
    body.trimEnd(),
    '</body>',
    '</html>',
    '',
  ].join('\n')
}

/**
 * The cleaner's rules, with one addition: a picture may be carried inside the page itself, as
 * a data: address. `onlyPictures` then drops any such address that is not a plain picture.
 */
function withPictures<T extends object>(schema: T): T {
  const protocols = (schema as { protocols?: Record<string, readonly string[]> | null }).protocols ?? {}
  return { ...schema, clobberPrefix: '', protocols: { ...protocols, src: [...(protocols.src ?? []), 'data'] } }
}
function onlyPictures() {
  return (tree: Tree) => {
    const pending = [tree]
    while (pending.length > 0) {
      const node = pending.pop()! as Tree & { properties?: Record<string, unknown> }
      const src = node.properties?.src
      if (typeof src === 'string' && /^data:/i.test(src) && !/^data:image\/(?:png|jpeg|gif|webp);base64,[a-z0-9+/=]+$/i.test(src)) {
        delete node.properties!.src
      }
      pushAll(pending, node.children)
    }
  }
}

/**
 * A "<" or ">" inside a quoted value is only a letter there, and the writer leaves it as it is.
 * A description of a picture that reads `<script>` is then harmless, and still looks like a tag
 * to anything that searches a page for tags without reading it as a browser does. So inside a
 * value each is written as its reference. The page is the writer's own: every value is in
 * double quotes, and a "<" in the words between tags has already been written as a reference.
 */
export function quietValues(html: string): string {
  let out = ''
  let from = 0
  let inTag = false
  let inValue = false
  for (let at = 0; at < html.length; at++) {
    const letter = html[at]!
    if (inValue) {
      if (letter === '"') inValue = false
      else if (letter === '<' || letter === '>') {
        out += `${html.slice(from, at)}${letter === '<' ? '&#x3C;' : '&#x3E;'}`
        from = at + 1
      }
    } else if (inTag) {
      if (letter === '"') inValue = true
      else if (letter === '>') inTag = false
    } else if (letter === '<') inTag = true
  }
  return out + html.slice(from)
}

/** A Word document or a presentation, read to a page and cleaned like any other page. */
export async function officeToHtml(document: ReadDocument, name: string): Promise<string> {
  const [{ unified }, parse, sanitize, stringify] = await Promise.all([
    import('unified'),
    import('rehype-parse'),
    import('rehype-sanitize'),
    import('rehype-stringify'),
  ])
  let heading: string | null = null
  // What was read from the document is cleaned like any other page: a link in a document can
  // be code as easily as a link on a website can.
  const body = await unified()
    .use(parse.default, { fragment: true })
    .use(limitDepth)
    .use(liftUnknown, sanitize.defaultSchema)
    .use(sanitize.default, withPictures(sanitize.defaultSchema))
    .use(onlyPictures)
    .use(() => (tree: Tree) => {
      heading = firstHeading(tree)
    })
    .use(stringify.default)
    .process(document.body)
  // One block to a line, so that the page can be read as well as opened.
  const lines = quietValues(String(body)).replace(/(<\/(?:p|h[1-6]|ul|ol|li|table|thead|tbody|tr|blockquote|section)>|<(?:ul|ol|table|thead|tbody|tr|section)>)(?=<)/g, '$1\n')
  return page(lines, document.title ?? heading ?? safeBaseName(name), document.language ?? 'en')
}

/** A page read into a tree and cleaned, with the title and the language it gives for itself. */
export async function readPage(text: string, name: string): Promise<{ tree: Tree; title: string; language: string }> {
  const [{ unified }, parse, sanitize] = await Promise.all([import('unified'), import('rehype-parse'), import('rehype-sanitize')])
  let title: string | null = null
  const processor = unified()
    .use(parse.default)
    .use(limitDepth)
    .use(() => (tree: Tree) => {
      // The page's own title, read before its head is set aside.
      const pending = [tree]
      while (pending.length > 0 && title === null) {
        const node = pending.pop()!
        if (node.type === 'element' && node.tagName === 'title') title = (node.children ?? []).map((kid) => kid.value ?? '').join('').trim() || null
        pushAll(pending, node.children)
      }
    })
    .use(withoutChrome)
    .use(liftUnknown, sanitize.defaultSchema)
    .use(sanitize.default, withPictures(sanitize.defaultSchema))
    .use(onlyPictures)
  const tree = (await processor.run(processor.parse(text))) as Tree
  // The language the page says it is in, where it says so in a form that is one.
  const stated = /<html[^>]*\slang\s*=\s*["']?([a-z]{2,3}(?:-[a-z0-9]{2,8}){0,3})["'\s>]/i.exec(text.slice(0, 4096))?.[1]
  return { tree, title: title ?? firstHeading(tree) ?? safeBaseName(name), language: stated ?? 'en' }
}

async function htmlToDocx(text: string, name: string): Promise<Uint8Array> {
  const page = await readPage(text, name)
  return writeDocx(page.tree, page.title, page.language)
}

async function htmlToOdt(text: string, name: string): Promise<Uint8Array> {
  const page = await readPage(text, name)
  return writeOdt(page.tree, page.title, page.language)
}

export function createMarkupEngine(): Engine {
  return {
    ...markupInfo,
    available: async () => true,
    // The parsers are scripts that arrive with the first file that needs them.
    load: async () => {},
    async convert(input: ConvertInput): Promise<ConvertOutput[]> {
      throwIfAborted(input.signal)
      if (input.blob.size > MAX_MARKUP_BYTES) throw new Refusal('This file is too large to convert as text')
      const bytes = new Uint8Array(await input.blob.arrayBuffer())
      const decode = () => {
        try {
          return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
        } catch {
          throw new Refusal('This file is not text in UTF-8, the encoding Omsett reads text in')
        }
      }
      input.onProgress(0.2)

      const pair = `${input.from.id}>${input.to.id}`
      let written: string | Uint8Array
      try {
        if (pair === 'md>html') {
          const text = decode()
          refuseDeepMarkdown(text)
          written = await markdownToHtml(text, input.name, languageTag(input.options.language))
        } else if (pair === 'html>md') written = await htmlToMarkdown(decode())
        else if (pair === 'docx>html') written = await officeToHtml(await readDocx(bytes), input.name)
        else if (pair === 'doc>html') written = await officeToHtml(readDoc(bytes), input.name)
        else if (pair === 'pptx>html') written = await officeToHtml(await readPptx(bytes, { notes: input.options.speakerNotes === true }), input.name)
        else if (pair === 'ppt>html') written = await officeToHtml(readPpt(bytes, { notes: input.options.speakerNotes === true }), input.name)
        else if (pair === 'odt>html') written = await officeToHtml(await readOdt(bytes), input.name)
        else if (pair === 'odp>html') written = await officeToHtml(await readOdp(bytes, { notes: input.options.speakerNotes === true }), input.name)
        else if (pair === 'html>docx') written = await htmlToDocx(decode(), input.name)
        else if (pair === 'html>odt') written = await htmlToOdt(decode(), input.name)
        else throw new Error(`The markup engine does not convert ${pair}`)
      } catch (error) {
        // A reader may run out of room before the depth limit is even checked. Browsers name
        // that differently: a RangeError in most, "too much recursion" in Firefox.
        const message = error instanceof Error ? `${error.name} ${error.message}` : ''
        if (error instanceof RangeError || /recursion|call stack/i.test(message)) throw new Refusal(TOO_DEEP)
        throw error
      }
      throwIfAborted(input.signal)
      if (typeof written === 'string' && (written.trim() === '' || (input.to.id === 'html' && !/<body>\n\S/.test(written)))) {
        throw new Refusal('This file has no text in it to convert')
      }
      input.onProgress(1)
      return [
        {
          name: outputName(input.name, input.to),
          format: input.to.id,
          blob: new Blob([written as BlobPart], { type: input.to.mime[0] }),
        },
      ]
    },
  }
}
