import { Refusal } from '../util'
import { attrs, child, escapeHtml, kids, tagOf, type Node, type ReadDocument } from './docx-read'
import { openOdf, type Odf } from './odt-read'

// OpenDocument presentations (ODP) → HTML: what LibreOffice Impress saves. The same page a PPTX
// becomes: a section to each slide, its title the heading, then what the slide holds in the
// order it is stored, which is the order a screen reader takes it. The text inside a slide's
// boxes is read by the code that reads an ODT, so lists, tables, emphasis, links and pictures
// with their descriptions come across the same way, and what that code leaves out stays out.
//
// What the presenter kept from the audience is left out too: speaker notes (unless the person
// converting asks for them, when they follow their slide under a heading of their own), hidden slides,
// shapes that are not shown (hidden, only printed, or on a hidden layer), and empty placeholders
// with their prompts. So is the furniture that is the same on every slide: the slide's number,
// the date, the footer. `odf.shown` decides for every shape, at any depth.

export const notOdp = () => new Refusal('This file is not a valid ODP presentation')
const TYPES = new Set(['application/vnd.oasis.opendocument.presentation', 'application/vnd.oasis.opendocument.presentation-template'])
const MAX_SLIDES = 2000
const MAX_DEPTH = 64
/** The most HTML a presentation may become, pictures included. */
const MAX_WRITTEN = 64 * 1024 * 1024
/** Shapes that may hold text of their own. */
const SHAPES = new Set(['custom-shape', 'rect', 'ellipse', 'circle', 'polygon', 'polyline', 'path', 'regular-polygon', 'caption', 'measure', 'line', 'connector'])

const unescape = (html: string) =>
  html
    .replace(/<[^>]*>/g, '')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&amp;', '&')

/** The slides of a presentation, each with whether it is hidden. */
function slidesOf(odf: Odf): Array<{ page: Node; hidden: boolean }> {
  const presentation = child(child(odf.content, 'body') ?? {}, 'presentation')
  if (!presentation) throw notOdp()
  // Which slide styles say the slide is not shown: by saying so in any part of themselves, or by
  // taking it from the style they are based on, wherever that is kept. The file's own take the
  // place of named ones of the same name.
  const styles = new Map<string, { parent?: string; hidden?: boolean }>()
  const styled = odf.root('styles.xml', 'document-styles')
  for (const holder of [child(styled ?? {}, 'styles'), child(styled ?? {}, 'automatic-styles'), child(odf.content, 'automatic-styles')]) {
    for (const style of kids(holder ?? {})) {
      const a = attrs(style)
      if (tagOf(style) !== 'style' || a['@style:family'] !== 'drawing-page' || !a['@style:name']) continue
      const said = kids(style).filter((part) => tagOf(part) === 'drawing-page-properties').map((part) => attrs(part)['@presentation:visibility'])
      styles.set(a['@style:name'], { parent: a['@style:parent-style-name'], hidden: said.includes('hidden') ? true : said.includes('visible') ? false : undefined })
    }
  }
  const hidden = (name: string | undefined): boolean => {
    const seen = new Set<string>()
    for (let at = name; at !== undefined && !seen.has(at) && seen.size < MAX_DEPTH; ) {
      seen.add(at)
      const style = styles.get(at)
      if (!style) return false
      if (style.hidden !== undefined) return style.hidden
      at = style.parent
    }
    return false
  }
  const pages = kids(presentation).filter((node) => tagOf(node) === 'page')
  if (pages.length > MAX_SLIDES) throw new Refusal('This presentation is too large to convert in a browser')
  return pages.map((page) => ({ page, hidden: hidden(attrs(page)['@draw:style-name']) }))
}

/** How many slides a presentation has, how many are hidden, and how many carry speaker notes. Read as a conversion reads them. */
export async function describeSlides(bytes: Uint8Array): Promise<{ slides: number; hidden: number; notes: number }> {
  const slides = slidesOf(await openOdf(bytes, TYPES, notOdp, 'presentation'))
  return {
    slides: slides.length,
    hidden: slides.filter((slide) => slide.hidden).length,
    notes: slides.filter((slide) => kids(slide.page).some((part) => tagOf(part) === 'notes')).length,
  }
}

export async function readOdp(bytes: Uint8Array, options: { notes?: boolean } = {}): Promise<ReadDocument> {
  const odf = await openOdf(bytes, TYPES, notOdp, 'presentation')
  let written = ''
  let first: string | null = null
  let shown = 0
  for (const { page, hidden } of slidesOf(odf)) {
    // A slide marked not to be shown is not part of the presentation as given.
    if (hidden) continue
    shown++
    let title = ''
    let plain = ''
    let content = ''

    const walk = (nodes: Node[], depth: number): void => {
      if (depth > MAX_DEPTH) throw notOdp()
      for (const node of nodes) {
        const tag = tagOf(node)
        // Speaker notes, forms, animations and anything of another vocabulary are not the slide.
        if (tag === 'notes' || tag === 'forms' || tag.startsWith('foreign:')) continue
        if (!odf.shown(node)) continue
        // A group, and a shape made into a link, hold shapes.
        if (tag === 'g' || tag === 'a') {
          walk(kids(node), depth + 1)
        } else if (tag === 'frame') {
          const box = child(node, 'text-box')
          const table = child(node, 'table')
          // The first title is the heading. A second is read as what it says.
          if (box && attrs(node)['@presentation:class'] === 'title' && title === '') {
            title = kids(box)
              .filter((part) => ['p', 'h'].includes(tagOf(part)) && !odf.paragraphHidden(part))
              .map((part) => odf.inline(part))
              .filter((line) => line.trim() !== '')
              .join(' ')
            plain = unescape(title).trim()
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
    // The presenter's notes, where asked for: the notes box of the slide's notes page, nothing else of it.
    if (options.notes) {
      let said = ''
      for (const notes of kids(page).filter((part) => tagOf(part) === 'notes')) {
        for (const frame of kids(notes)) {
          const box = tagOf(frame) === 'frame' && attrs(frame)['@presentation:class'] === 'notes' ? child(frame, 'text-box') : undefined
          if (box) said += odf.blocks(kids(box), 1)
        }
      }
      if (said !== '') content += `<h3>Speaker notes</h3>${said}`
    }

    if (title === '' && content === '') continue
    // Every slide is a section with a heading, so the page can be moved through slide by slide.
    const heading = title || `Slide ${shown}`
    first ??= plain || null
    written += `<section><h2>${heading}</h2>${content}</section>`
    if (written.length > MAX_WRITTEN) throw new Refusal('This presentation is too large to convert in a browser')
  }
  if (written === '') throw new Refusal('This presentation has no text in it to convert')

  const meta = odf.meta()
  const title = meta.title ?? first
  return { body: title ? `<h1>${escapeHtml(title)}</h1>${written}` : written, title: title ?? null, language: meta.language }
}
