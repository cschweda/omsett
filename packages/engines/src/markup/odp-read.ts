import { Refusal } from '../util'
import { attrs, child, escapeHtml, kids, tagOf, type Node, type ReadDocument } from './docx-read'
import { openOdf } from './odt-read'

// OpenDocument presentations (ODP) → HTML: what LibreOffice Impress saves. The same page a PPTX
// becomes: a section to each slide, its title the heading, then what the slide holds in the
// order it is stored, which is the order a screen reader takes it. The text inside a slide's
// boxes is read by the code that reads an ODT, so lists, tables, emphasis, links and pictures
// with their descriptions come across the same way, and what that code leaves out stays out.
//
// What the presenter kept from the audience is left out too: speaker notes, hidden slides,
// shapes that are not shown, and empty placeholders with their prompts. So is the furniture
// that is the same on every slide: the slide's number, the date, the footer.

export const notOdp = () => new Refusal('This file is not a valid ODP presentation')
const TYPES = new Set(['application/vnd.oasis.opendocument.presentation', 'application/vnd.oasis.opendocument.presentation-template'])
const MAX_SLIDES = 2000
const MAX_DEPTH = 64
/** The most HTML a presentation may become, pictures included. */
const MAX_WRITTEN = 64 * 1024 * 1024
/** What a placeholder can be that is not content. */
const FURNITURE = new Set(['page-number', 'footer', 'date-time', 'header', 'notes', 'handout'])
/** Shapes that may hold text of their own. */
const SHAPES = new Set(['custom-shape', 'rect', 'ellipse', 'circle', 'polygon', 'polyline', 'path', 'regular-polygon', 'caption', 'measure', 'line', 'connector'])

const unescape = (html: string) =>
  html
    .replace(/<[^>]*>/g, '')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&amp;', '&')

export async function readOdp(bytes: Uint8Array): Promise<ReadDocument> {
  const odf = await openOdf(bytes, TYPES, notOdp, 'presentation')
  const presentation = child(child(odf.content, 'body') ?? {}, 'presentation')
  if (!presentation) throw notOdp()

  // Which slide styles say the slide is not shown.
  const hiddenPages = new Set<string>()
  for (const style of kids(child(odf.content, 'automatic-styles') ?? {})) {
    if (tagOf(style) !== 'style' || attrs(style)['@family'] !== 'drawing-page') continue
    if (kids(style).some((part) => tagOf(part) === 'drawing-page-properties' && attrs(part)['@visibility'] === 'hidden')) hiddenPages.add(attrs(style)['@name'] ?? '')
  }

  const pages = kids(presentation).filter((node) => tagOf(node) === 'page')
  if (pages.length > MAX_SLIDES) throw new Refusal('This presentation is too large to convert in a browser')
  let written = ''
  let first: string | null = null
  let shown = 0
  for (const page of pages) {
    // A slide marked not to be shown is not part of the presentation as given.
    if (hiddenPages.has(attrs(page)['@style-name'] ?? '') || attrs(page)['@visibility'] === 'hidden') continue
    shown++
    let title = ''
    let content = ''

    const walk = (nodes: Node[], depth: number): void => {
      if (depth > MAX_DEPTH) throw notOdp()
      for (const node of nodes) {
        const tag = tagOf(node)
        const a = attrs(node)
        // Speaker notes, forms, animations and anything of another vocabulary are not the slide.
        if (tag === 'notes' || tag === 'forms' || tag.startsWith('foreign:')) continue
        // A shape not shown, or shown only when printed, is not on the slide the audience saw.
        if (['none', 'printer'].includes(a['@display'] ?? '')) continue
        const kind = a['@class']
        if (kind !== undefined && FURNITURE.has(kind)) continue
        // An empty placeholder shows a prompt ("Click to add Title") that is not the presentation's.
        if (a['@placeholder'] === 'true') continue
        if (tag === 'g') {
          walk(kids(node), depth + 1)
        } else if (tag === 'frame') {
          const box = child(node, 'text-box')
          const table = child(node, 'table')
          if (box && kind === 'title') {
            title ||= kids(box)
              .filter((part) => ['p', 'h'].includes(tagOf(part)))
              .map((part) => odf.inline(part))
              .filter((line) => line.trim() !== '')
              .join(' ')
          } else if (box) content += odf.blocks(kids(box), depth + 1)
          else if (table) content += odf.blocks([table], depth + 1)
          else if (child(node, 'image')) {
            const picture = odf.picture(node)
            if (picture) content += `<p>${picture}</p>`
          }
        } else if (SHAPES.has(tag)) {
          // A shape drawn by hand holds its paragraphs itself.
          content += odf.blocks(kids(node).filter((part) => ['p', 'h', 'list'].includes(tagOf(part))), depth + 1)
        }
      }
    }
    walk(kids(page), 0)

    if (title === '' && content === '') continue
    // Every slide is a section with a heading, so the page can be moved through slide by slide.
    const heading = title || `Slide ${shown}`
    first ??= title ? unescape(title).trim() : null
    written += `<section><h2>${heading}</h2>${content}</section>`
    if (written.length > MAX_WRITTEN) throw new Refusal('This presentation is too large to convert in a browser')
  }
  if (written === '') throw new Refusal('This presentation has no text in it to convert')

  const meta = odf.meta()
  const title = meta.title ?? first
  return { body: title ? `<h1>${escapeHtml(title)}</h1>${written}` : written, title: title ?? null, language: meta.language }
}
