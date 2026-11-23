import { markupInfo } from '../info'
import type { ConvertInput, ConvertOutput, Engine } from '../types'
import { outputName, Refusal, safeBaseName, throwIfAborted } from '../util'

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
      pending.push(...node.children)
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
    const node = pending.shift()!
    if (node.type === 'element' && node.tagName === 'h1') {
      let words = ''
      const inside = [node]
      while (inside.length > 0) {
        const part = inside.shift()!
        if (part.type === 'text') words += part.value ?? ''
        inside.unshift(...(part.children ?? []))
      }
      return words.replace(/\s+/g, ' ').trim() || null
    }
    pending.unshift(...(node.children ?? []))
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
    .use(withoutChrome)
    // Ids are left as written, so a footnote's link still finds its note. Prefixing them guards
    // a page's own scripts against names in the content, and this page has no scripts.
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
    .use(sanitize.default)
    .use(toMarkdown.default)
    .use(gfm.default)
    .use(stringify.default, { bullet: '-', emphasis: '*', fences: true, rule: '-' })
    .process(text)
  return String(written)
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
      let text: string
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(await input.blob.arrayBuffer())
      } catch {
        throw new Refusal('This file is not text in UTF-8, the encoding Omsett reads text in')
      }
      input.onProgress(0.2)

      const pair = `${input.from.id}>${input.to.id}`
      let written: string
      try {
        if (pair === 'md>html') refuseDeepMarkdown(text)
        if (pair === 'md>html') written = await markdownToHtml(text, input.name, languageTag(input.options.language))
        else if (pair === 'html>md') written = await htmlToMarkdown(text)
        else throw new Error(`The markup engine does not convert ${pair}`)
      } catch (error) {
        // Running out of stack is what a file nested thousands deep does to a reader.
        // A reader may run out of room before the depth limit is even checked. Browsers name
        // that differently: a RangeError in most, "too much recursion" in Firefox.
        const message = error instanceof Error ? `${error.name} ${error.message}` : ''
        if (error instanceof RangeError || /recursion|call stack/i.test(message)) throw new Refusal(TOO_DEEP)
        throw error
      }
      throwIfAborted(input.signal)
      if (written.trim() === '' || (input.to.id === 'html' && !/<body>\n\S/.test(written))) {
        throw new Refusal('This file has no text in it to convert')
      }
      input.onProgress(1)
      return [
        {
          name: outputName(input.name, input.to),
          format: input.to.id,
          blob: new Blob([written], { type: input.to.mime[0] }),
        },
      ]
    },
  }
}
