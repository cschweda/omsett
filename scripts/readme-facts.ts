// Writes the "What it does today" figures and format table in README.md from the registry and the
// trap list, so the README says what the code does and cannot fall behind.
// scripts/readme-facts.test.ts fails when it is out of date.
//
//     pnpm readme:facts
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deriveEdges, registry, type Category } from '@omsett/registry'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
export const FACTS_START = '<!-- facts:start -->'
export const FACTS_END = '<!-- facts:end -->'

const KINDS: Array<[Category, string]> = [
  ['image', 'Pictures'],
  ['vector', 'Drawings'],
  ['document', 'Documents'],
  ['presentation', 'Presentations'],
  ['pdf', 'PDF'],
  ['text', 'Text and markup'],
  ['spreadsheet', 'Spreadsheets'],
  ['data', 'Data'],
  ['subtitle', 'Subtitles'],
  ['screenplay', 'Screenplays'],
  ['font', 'Fonts'],
  ['audio', 'Sound'],
  ['archive', 'Archives'],
]

export function renderFacts(): string {
  const edges = deriveEdges(registry).edges
  const traps = (JSON.parse(readFileSync(join(root, 'fixtures', '_traps', 'manifest.json'), 'utf8')) as unknown[]).length
  const written = new Set(registry.capabilities.flatMap((capability) => capability.writes.map((write) => write.format)))
  const number = (value: number) => value.toLocaleString('en-GB')
  const rows = KINDS.flatMap(([category, label]) => {
    const formats = registry.formats.filter((format) => format.category === category)
    if (formats.length === 0) return []
    const both = formats.filter((format) => written.has(format.id)).map((format) => format.name)
    const readOnly = formats.filter((format) => !written.has(format.id)).map((format) => format.name)
    return [`| ${label} | ${both.join(', ') || '—'} | ${readOnly.join(', ') || '—'} |`]
  })
  const unlisted = registry.formats.filter((format) => !KINDS.some(([category]) => category === format.category))
  if (unlisted.length > 0) throw new Error(`readme-facts: no heading for ${unlisted.map((format) => format.category).join(', ')}`)
  return [
    FACTS_START,
    '<!-- Generated from the registry by `pnpm readme:facts`. Do not edit by hand. -->',
    '',
    `**${registry.formats.length} formats, ${edges.length} conversions**, every one of them run in your browser, on your device, ` +
      `and tested against ${number(traps)} files made on purpose to be broken, hostile or dishonest. ` +
      'How many tests there are today is on the site\'s [Trust](https://omsett.com/trust) page, counted at every build.',
    '',
    '| Kind | Converts to and from | Reads only |',
    '| --- | --- | --- |',
    ...rows,
    '',
    'A file is offered the formats of its own kind: a picture becomes another picture, a workbook becomes data, a Word document becomes a web page or Markdown.',
    '',
    FACTS_END,
  ].join('\n')
}

export function withFacts(readme: string): string {
  const start = readme.indexOf(FACTS_START)
  const end = readme.indexOf(FACTS_END)
  if (start < 0 || end < 0) throw new Error('README.md has no facts markers')
  return readme.slice(0, start) + renderFacts() + readme.slice(end + FACTS_END.length)
}
