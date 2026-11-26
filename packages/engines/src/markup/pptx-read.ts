import { Refusal } from '../util'
import { all, attrs, child, escapeHtml, kids, MAX_PICTURE_BYTES, openOffice, pictureAddress, tagOf, type Node, type ReadDocument } from './docx-read'

// PowerPoint presentations (PPTX) → HTML. A presentation is a ZIP of XML with a part for each
// slide. Each slide becomes a section whose heading is the slide's title, so the result has
// the outline the presentation had: titles as headings, bullets as lists at their levels,
// tables as tables, and each picture with the description its author gave it.
//
// Hidden slides are never read. Speaker notes are read only when the person converting asks
// for them (`notes`), and are then written after their slide under a heading of their own:
// they are what the presenter kept from the audience, and are not published unless asked.

const MAX_SLIDES = 2000
/** The most HTML a presentation may become, pictures included. */
const MAX_WRITTEN = 64 * 1024 * 1024
const MAX_DEPTH = 64

export const notPresentation = () => new Refusal('This file is not a valid PPTX presentation')

interface Links {
  get(id: string | undefined): { target: string; external: boolean } | undefined
  /** The first link of a kind ("notesSlide"), by the end of its type. */
  ofType(kind: string): { target: string; external: boolean } | undefined
}

/** "../media/image1.png", named from "ppt/slides/slide1.xml" → "ppt/media/image1.png". Null if it leaves the file. */
function resolve(from: string, target: string): string | null {
  const parts = target.startsWith('/') ? [] : from.split('/').slice(0, -1)
  for (const part of target.split('/')) {
    if (part === '..') {
      if (parts.length === 0) return null
      parts.pop()
    } else if (part !== '' && part !== '.') parts.push(part)
  }
  return parts.join('/')
}

export async function readPptx(bytes: Uint8Array, options: { notes?: boolean } = {}): Promise<ReadDocument> {
  const { parts, root } = await openOffice(bytes, notPresentation, 'presentation')
  const linksOf = (path: string): Links => {
    const folder = path.slice(0, path.lastIndexOf('/'))
    const name = path.slice(path.lastIndexOf('/') + 1)
    const found = new Map<string, { target: string; external: boolean }>()
    const kinds: Array<{ type: string; target: string; external: boolean }> = []
    for (const link of all(root(`${folder}/_rels/${name}.rels`, 'Relationships') ?? {}, 'Relationship')) {
      const a = attrs(link)
      const entry = { target: a['@Target'] ?? '', external: a['@TargetMode'] === 'External' }
      if (a['@Id']) found.set(a['@Id'], entry)
      kinds.push({ type: a['@Type'] ?? '', ...entry })
    }
    return { get: (id) => (id ? found.get(id) : undefined), ofType: (kind) => kinds.find((link) => link.type.endsWith(`/${kind}`)) }
  }

  const presentation = root('ppt/presentation.xml', 'presentation')
  if (!presentation) throw notPresentation()
  const order = linksOf('ppt/presentation.xml')
  const slides = all(child(presentation, 'sldIdLst') ?? {}, 'sldId')
    .map((slide) => order.get(attrs(slide)['@id']))
    .filter((link): link is { target: string; external: boolean } => link !== undefined && !link.external)
    .map((link) => resolve('ppt/presentation.xml', link.target))
    .filter((path): path is string => path !== null)
  // A slide is shown once. A list that names one slide a thousand times is asking for it to be
  // read a thousand times, and is refused.
  if (new Set(slides.map((path) => path.toLowerCase())).size !== slides.length) throw notPresentation()
  if (slides.length > MAX_SLIDES) throw new Refusal('This presentation is too large to convert in a browser')

  const budget = { left: MAX_PICTURE_BYTES }
  let language: string | null = null

  /** The text of one paragraph: runs with their emphasis and links, and line breaks. */
  function inline(paragraph: Node, links: Links): string {
    let html = ''
    for (const part of kids(paragraph)) {
      const tag = tagOf(part)
      if (tag === 'br') html += '<br>'
      if (tag !== 'r' && tag !== 'fld') continue
      const props = child(part, 'rPr') ?? {}
      const a = attrs(props)
      language ??= a['@lang'] && /^[a-z]{2,3}(?:-[a-z0-9]{2,8}){0,3}$/i.test(a['@lang']) ? a['@lang'] : null
      let text = escapeHtml(
        all(part, 't')
          .flatMap((t) => kids(t).map((piece) => String(piece['#text'] ?? '')))
          .join(''),
      )
      if (text === '') continue
      if (a['@i'] === '1') text = `<em>${text}</em>`
      if (a['@b'] === '1') text = `<strong>${text}</strong>`
      const target = links.get(attrs(child(props, 'hlinkClick') ?? {})['@id'])
      // A link to another site is a link. One to another slide, or to a program, is its words.
      if (target?.external) text = `<a href="${escapeHtml(target.target)}">${text}</a>`
      html += text
    }
    return html
  }

  /** The paragraphs of a text box, as a list at its levels or as plain paragraphs. */
  function paragraphs(body: Node, links: Links, bulleted: boolean): string {
    let html = ''
    let open = 0
    const closeTo = (level: number) => {
      while (open > level) {
        html += '</li></ul>'
        open--
      }
    }
    for (const paragraph of all(body, 'p')) {
      const text = inline(paragraph, links)
      if (text.trim() === '') continue
      const props = child(paragraph, 'pPr')
      // A paragraph is a bullet where its box makes bullets and it does not say otherwise.
      const plain = !bulleted || (props !== undefined && child(props, 'buNone') !== undefined)
      if (plain) {
        closeTo(0)
        html += `<p>${text}</p>`
        continue
      }
      const level = Math.min(8, Number(attrs(props ?? {})['@lvl'] ?? 0) || 0) + 1
      if (open > level) closeTo(level)
      if (open === level) html += '</li>'
      while (open < level) {
        html += '<ul>'
        open++
        if (open < level) html += '<li>'
      }
      html += `<li>${text}`
    }
    closeTo(0)
    return html
  }

  function table(node: Node, links: Links): string {
    const headed = attrs(child(node, 'tblPr') ?? {})['@firstRow'] === '1'
    const rows = all(node, 'tr').map((row, r) => {
      const tag = headed && r === 0 ? 'th' : 'td'
      const cells = all(row, 'tc').map((cell) => {
        const body = child(cell, 'txBody')
        const text = body
          ? all(body, 'p')
              .map((paragraph) => inline(paragraph, links))
              .filter((line) => line.trim() !== '')
              .join('<br>')
          : ''
        return `<${tag}>${text}</${tag}>`
      })
      return `<tr>${cells.join('')}</tr>`
    })
    if (rows.length === 0) return ''
    return headed ? `<table><thead>${rows[0]}</thead><tbody>${rows.slice(1).join('')}</tbody></table>` : `<table><tbody>${rows.join('')}</tbody></table>`
  }

  const yes = (setting: string) => setting === '1' || setting === 'true'
  let written = ''
  let first: string | null = null
  let shown = 0
  for (const path of slides) {
    const slide = root(path, 'sld')
    // A slide marked not to be shown is not part of the presentation as given.
    // "show" is a yes or a no, and a no is spelled more than one way. Anything that is not a yes is one.
    if (!slide || !yes(attrs(slide)['@show'] ?? '1')) continue
    shown++
    const links = linksOf(path)
    let title = ''
    let content = ''
    // Shapes are read in the order they are stored, which is the order a screen reader takes them.
    const walk = (nodes: Node[], depth: number): void => {
      if (depth > MAX_DEPTH) throw notPresentation()
      for (const node of nodes) {
        const tag = tagOf(node)
        // A shape hidden in the editor is not on the slide the audience saw.
        if (kids(node).some((part) => tagOf(part).startsWith('nv') && yes(attrs(child(part, 'cNvPr') ?? {})['@hidden'] ?? '0'))) continue
        if (tag === 'sp') {
          const body = child(node, 'txBody')
          if (!body) continue
          const kind = attrs(child(child(child(node, 'nvSpPr') ?? {}, 'nvPr') ?? {}, 'ph') ?? {})['@type']
          const placeholder = child(child(child(node, 'nvSpPr') ?? {}, 'nvPr') ?? {}, 'ph') !== undefined
          if (kind === 'title' || kind === 'ctrTitle') {
            title ||= all(body, 'p')
              .map((paragraph) => inline(paragraph, links))
              .filter((line) => line.trim() !== '')
              .join(' ')
          } else if (kind === 'sldNum' || kind === 'dt' || kind === 'ftr') {
            // The slide number, date and footer are furniture, the same on every slide.
          } else {
            // The body of a slide makes bullets; a subtitle or a box drawn by hand does not.
            content += paragraphs(body, links, placeholder && (kind === undefined || kind === 'body' || kind === 'obj'))
          }
        } else if (tag === 'pic') {
          const named = attrs(child(child(node, 'nvPicPr') ?? {}, 'cNvPr') ?? {})
          const alt = named['@descr'] ?? ''
          const link = links.get(attrs(child(child(node, 'blipFill') ?? {}, 'blip') ?? {})['@embed'])
          // A picture kept on another site would have to be fetched. It is not.
          const file = link && !link.external ? resolve(path, link.target) : null
          const address = file ? pictureAddress(parts, file, budget) : null
          if (address) content += `<p><img src="${address}" alt="${escapeHtml(alt)}"></p>`
          else if (alt) content += `<p>[Picture: ${escapeHtml(alt)}]</p>`
        } else if (tag === 'graphicFrame') {
          const found = child(child(child(node, 'graphic') ?? {}, 'graphicData') ?? {}, 'tbl')
          if (found) content += table(found, links)
        } else if (tag === 'grpSp' || tag === 'spTree' || tag === 'cSld') walk(kids(node), depth + 1)
      }
    }
    walk(kids(slide), 0)
    // The presenter's notes, where asked for: the body of the slide's notes page, and nothing
    // else of it (its picture of the slide, its number).
    const notesLink = options.notes ? links.ofType('notesSlide') : undefined
    const notesPath = notesLink && !notesLink.external ? resolve(path, notesLink.target) : null
    const notesPage = notesPath ? root(notesPath, 'notes') : undefined
    if (notesPage) {
      const notesLinks = linksOf(notesPath!)
      let said = ''
      const look = (nodes: Node[], depth: number): void => {
        if (depth > MAX_DEPTH) throw notPresentation()
        for (const node of nodes) {
          const tag = tagOf(node)
          if (tag === 'sp') {
            const kind = attrs(child(child(child(node, 'nvSpPr') ?? {}, 'nvPr') ?? {}, 'ph') ?? {})['@type']
            const body = child(node, 'txBody')
            if (kind === 'body' && body) said += paragraphs(body, notesLinks, false)
          } else if (tag === 'grpSp' || tag === 'spTree' || tag === 'cSld') look(kids(node), depth + 1)
        }
      }
      look(kids(notesPage), 0)
      if (said !== '') content += `<h3>Speaker notes</h3>${said}`
    }
    if (title === '' && content === '') continue
    // Every slide is a section with a heading, so the page can be moved through slide by slide.
    const heading = title || `Slide ${shown}`
    first ??= title ? heading.replace(/<[^>]*>/g, '') : null
    written += `<section><h2>${heading}</h2>${content}</section>`
    // What is written is held to a size as well as what is read.
    if (written.length > MAX_WRITTEN) throw new Refusal('This presentation is too large to convert in a browser')
  }
  if (written === '') throw new Refusal('This presentation has no text in it to convert')

  const core = root('docprops/core.xml', 'coreProperties')
  const stated = core
    ? kids(child(core, 'title') ?? {})
        .map((t) => String(t['#text'] ?? ''))
        .join('')
        .trim()
    : ''
  // "PowerPoint Presentation" is what PowerPoint calls a file nobody named.
  const title = stated && !/^powerpoint presentation$/i.test(stated) ? stated : first
  return { body: title ? `<h1>${escapeHtml(title)}</h1>${written}` : written, title: title ?? null, language }
}
