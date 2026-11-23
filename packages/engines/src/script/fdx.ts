import { text as escapeXml } from '../data/xml'
import { lookup, Refusal } from '../util'
import type { Element, Kind, Run, Script } from './fountain'

// Final Draft (FDX): a screenplay as XML, one <Paragraph> to an element, each saying what kind
// it is. It is the format studios and most screenwriting programs exchange.

type Node = Record<string, unknown>
export const notFdx = () => new Refusal('This file is not a valid Final Draft script')

const tagOf = (node: Node) => Object.keys(node).find((key) => key !== ':@') ?? ''
const attrs = (node: Node) => (node[':@'] ?? {}) as Record<string, string>
const kids = (node: Node): Node[] => (Array.isArray(node[tagOf(node)]) ? (node[tagOf(node)] as Node[]) : [])
const all = (node: Node, tag: string) => kids(node).filter((kid) => tagOf(kid) === tag)

const KINDS: Record<string, Kind> = lookup<Kind>({
  'scene heading': 'scene',
  action: 'action',
  character: 'character',
  parenthetical: 'parenthetical',
  dialogue: 'dialogue',
  transition: 'transition',
  // A shot is a line of direction in capitals; Fountain has no such thing, and action is the nearest.
  shot: 'action',
  general: 'action',
  lyrics: 'lyric',
  'cast list': 'action',
})
const NAMES: Record<Kind, string> = {
  scene: 'Scene Heading',
  action: 'Action',
  character: 'Character',
  parenthetical: 'Parenthetical',
  dialogue: 'Dialogue',
  transition: 'Transition',
  centered: 'Action',
  lyric: 'Lyrics',
  'page-break': 'Action',
}
/** More paragraphs than any film has. */
const MAX_PARAGRAPHS = 500_000

function runsOf(paragraph: Node): Run[] {
  return all(paragraph, 'Text')
    .map((text) => {
      const style = (attrs(text)['@Style'] ?? '').toLowerCase()
      const words = kids(text)
        .map((piece) => String(piece['#text'] ?? ''))
        .join('')
      return {
        text: words,
        ...(style.includes('bold') && { bold: true }),
        ...(style.includes('italic') && { italic: true }),
        ...(style.includes('underline') && { underline: true }),
      }
    })
    .filter((run) => run.text !== '')
}

export async function readFdx(source: string): Promise<Script> {
  // A script's XML never declares a document type. One that does is defining shorthand of its
  // own, which is how a small file is made to expand into a vast one.
  if (/<!DOCTYPE/i.test(source.slice(0, 4096))) throw notFdx()
  const { XMLParser, XMLValidator } = await import('fast-xml-parser')
  if (XMLValidator.validate(source) !== true) throw notFdx()
  let tree: Node[]
  try {
    tree = new XMLParser({
      preserveOrder: true,
      ignoreAttributes: false,
      attributeNamePrefix: '@',
      parseTagValue: false,
      parseAttributeValue: false,
      trimValues: false,
      ignoreDeclaration: true,
      ignorePiTags: true,
    }).parse(source) as Node[]
  } catch {
    throw notFdx()
  }
  const root = tree.find((node) => tagOf(node) === 'FinalDraft')
  const content = root && all(root, 'Content')[0]
  if (!root || !content) throw notFdx()

  const elements: Element[] = []
  const add = (paragraph: Node, dual: boolean) => {
    if (elements.length >= MAX_PARAGRAPHS) throw new Refusal('This script is too large to convert in a browser')
    const a = attrs(paragraph)
    if ((a['@StartsNewPage'] ?? '').toLowerCase() === 'yes') elements.push({ kind: 'page-break', runs: [] })
    const kind = KINDS[(a['@Type'] ?? 'action').toLowerCase()] ?? 'action'
    const runs = runsOf(paragraph)
    if (runs.length === 0) return
    const centered = kind === 'action' && (a['@Alignment'] ?? '').toLowerCase() === 'center'
    elements.push({
      kind: centered ? 'centered' : kind,
      runs: kind === 'scene' || kind === 'character' || kind === 'parenthetical' ? [{ text: runs.map((run) => run.text).join('') }] : runs,
      ...(kind === 'scene' && /^[\w.-]{1,12}$/.test(a['@Number'] ?? '') && { number: a['@Number'] }),
      ...(kind === 'character' && dual && { dual: true }),
    })
  }
  for (const paragraph of all(content, 'Paragraph')) {
    // Two characters speaking at once are kept inside one paragraph, side by side.
    const together = all(paragraph, 'DualDialogue')[0]
    if (!together) {
      add(paragraph, false)
      continue
    }
    let speakers = 0
    for (const inner of all(together, 'Paragraph')) {
      const speaker = (attrs(inner)['@Type'] ?? '').toLowerCase() === 'character'
      if (speaker) speakers++
      add(inner, speaker && speakers > 1)
    }
  }
  if (elements.length === 0) throw new Refusal('This script has nothing in it to convert')

  // The title page is a page of centred lines. The first is the title; a name follows "by".
  const title: Script['title'] = []
  const page = all(all(root, 'TitlePage')[0] ?? {}, 'Content')[0]
  const lines = (page ? all(page, 'Paragraph') : []).map((paragraph) => runsOf(paragraph).map((run) => run.text).join('').trim()).filter(Boolean)
  if (lines[0]) title.push({ key: 'Title', value: lines[0] })
  const by = lines.findIndex((line) => /^(?:written )?by$/i.test(line))
  if (by > 0 && lines[by + 1]) title.push({ key: 'Credit', value: lines[by]! }, { key: 'Author', value: lines[by + 1]! })
  return { title, elements }
}

const attribute = (value: string) => escapeXml(value).replaceAll('"', '&quot;')

function texts(runs: Run[]): string {
  return runs
    .map((run) => {
      const style = [run.bold && 'Bold', run.italic && 'Italic', run.underline && 'Underline'].filter(Boolean).join('+')
      return `<Text${style ? ` Style="${style}"` : ''}>${escapeXml(run.text)}</Text>`
    })
    .join('')
}

/** Runs, divided where a run holds a line break. */
function linesOf(runs: Run[]): Run[][] {
  const lines: Run[][] = [[]]
  for (const run of runs) {
    run.text.split('\n').forEach((part, i) => {
      if (i > 0) lines.push([])
      if (part !== '') lines.at(-1)!.push({ ...run, text: part })
    })
  }
  return lines.filter((line) => line.length > 0)
}

export function writeFdx(script: Script): string {
  const out = ['<?xml version="1.0" encoding="UTF-8" standalone="no" ?>', '<FinalDraft DocumentType="Script" Template="No" Version="5">', '  <Content>']
  // A line break inside an element is a new paragraph of the same kind: Final Draft has no
  // other way to say it.
  const paragraph = (element: Element, newPage: boolean, indent: string) =>
    linesOf(element.runs)
      .map((runs, line) => {
        const extra =
          (element.kind === 'centered' ? ' Alignment="Center"' : '') +
          (element.number && line === 0 ? ` Number="${attribute(element.number)}"` : '') +
          (newPage && line === 0 ? ' StartsNewPage="Yes"' : '')
        return `${indent}<Paragraph${extra} Type="${NAMES[element.kind]}">${texts(runs)}</Paragraph>`
      })
      .join('\n')
  const elements = script.elements
  // Where the next character after each element is, found once from the end.
  const nextCharacter = new Int32Array(elements.length).fill(-1)
  for (let i = elements.length - 2; i >= 0; i--) nextCharacter[i] = elements[i + 1]!.kind === 'character' ? i + 1 : nextCharacter[i + 1]!
  let newPage = false
  for (let i = 0; i < elements.length; i++) {
    const element = elements[i]!
    if (element.kind === 'page-break') {
      newPage = true
      continue
    }
    // A character marked as speaking at the same time is paired with the speech before theirs.
    const next = nextCharacter[i]! < 0 ? -1 : nextCharacter[i]! - i - 1
    const partner = next >= 0 ? elements[i + 1 + next]! : null
    const speech = (from: number) => {
      let end = from + 1
      while (end < elements.length && ['parenthetical', 'dialogue', 'lyric'].includes(elements[end]!.kind)) end++
      return end
    }
    if (element.kind === 'character' && !element.dual && partner?.dual && speech(i) === i + 1 + next) {
      const end = speech(i + 1 + next)
      out.push('    <Paragraph>', '      <DualDialogue>')
      for (let j = i; j < end; j++) out.push(paragraph({ ...elements[j]!, dual: undefined }, false, '        '))
      out.push('      </DualDialogue>', '    </Paragraph>')
      i = end - 1
      newPage = false
      continue
    }
    out.push(paragraph(element, newPage, '    '))
    newPage = false
  }
  out.push('  </Content>')
  if (script.title.length > 0) {
    out.push('  <TitlePage>', '    <Content>')
    const value = (key: string) => script.title.find((entry) => entry.key.toLowerCase() === key)?.value
    const lines = [value('title'), value('credit') ?? (value('author') || value('authors') ? 'Written by' : undefined), value('author') ?? value('authors'), value('source'), value('draft date'), value('contact')]
    for (const line of lines) {
      if (!line) continue
      for (const part of line.split('\n')) out.push(`      <Paragraph Alignment="Center" Type="General"><Text>${escapeXml(part.replace(/[*_]/g, ''))}</Text></Paragraph>`)
    }
    out.push('    </Content>', '  </TitlePage>')
  }
  out.push('</FinalDraft>', '')
  return out.join('\n')
}
