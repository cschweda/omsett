import type { EdgeOverride } from './types'

// Pair-specific exceptions: a block, or a warning the trait model cannot derive.
// (What an engine leaves out on purpose is declared on its capability, as `drops`.)
const SVG_NOTES = [
  { id: 'svg-fonts', text: 'Text is drawn in Inter, whatever font the file names.' },
  { id: 'svg-linked', text: 'Pictures the file links to elsewhere are left out.' },
]
const CLIPPED = [{ id: 'range-clipped', text: 'Brightness beyond what a screen shows is cut off.' }]

// What the data formats cannot say to each other.
const NO_NULL = [{ id: 'nulls-dropped', text: 'Empty (null) values are left out: TOML has no way to write one.' }]
const ROWS_NAMED = [{ id: 'rows-named', text: 'TOML needs a name for everything, so the rows are written as a list called "item".' }]
const ATTRIBUTES = [{ id: 'xml-attributes', text: 'Attributes are kept as values whose names begin with @.' }]
const TEXT_VALUES = [{ id: 'values-typed', text: 'Values that are plainly numbers become numbers. Everything else stays text.' }]
const TEXT_CELLS = [{ id: 'cells-typed', text: 'Cells that are plainly numbers become numbers. Everything else stays text.' }]
// A spreadsheet program may run a cell as a formula. Omsett writes what the file said.
const FORMULAS = [{ id: 'cells-exact', text: 'Cells are written exactly as they are. A spreadsheet program may treat one that starts with =, +, - or @ as a formula.' }]
const DATA = ['json', 'jsonl', 'yaml', 'toml', 'xml', 'csv', 'tsv']

// What the subtitle formats cannot say to each other.
const SUBTITLES = ['srt', 'vtt', 'ass', 'ssa', 'ttml', 'lrc', 'sbv', 'smi', 'microdvd']
const FRAMES = [{ id: 'frames-assumed', text: 'MicroDVD counts video frames, not time. 23.976 frames a second is assumed unless the file says otherwise.' }]
const ONE_LINE = [{ id: 'lyrics-one-line', text: 'Each subtitle becomes a single line, timed to a hundredth of a second.' }]
const NO_ENDS = [{ id: 'ends-guessed', text: 'LRC says when a line starts, not when it ends. Each line is shown until the next one.' }]
const others = (id: string) => SUBTITLES.filter((other) => other !== id)

const TYPED = ['json', 'jsonl', 'yaml', 'toml']

export const overrides: EdgeOverride[] = [
  {
    from: 'md',
    to: 'html',
    warnings: [
      { id: 'markup-cleaned', text: 'Scripts, and anything else in the file that could run, are left out.' },
      { id: 'language-assumed', text: 'Markdown does not say what language it is in. The page is marked as English (lang="en"); change that if it is not.' },
    ],
  },
  {
    from: 'html',
    to: 'md',
    warnings: [
      { id: 'content-only', text: 'Only the content is kept: headings, text, links, pictures, lists and tables. Layout, styles and scripts are not.' },
    ],
  },
  ...['csv', 'tsv'].flatMap((to) => DATA.filter((from) => from !== to).map((from) => ({ from, to, warnings: FORMULAS }))),
  ...others('microdvd').flatMap((other) => [
    { from: 'microdvd', to: other, warnings: FRAMES },
    { from: other, to: 'microdvd', warnings: FRAMES },
  ]),
  ...others('lrc').flatMap((other) => [
    { from: 'lrc', to: other, warnings: NO_ENDS },
    { from: other, to: 'lrc', warnings: ONE_LINE },
  ]),
  ...['json', 'jsonl', 'yaml'].map((from) => ({ from, to: 'toml', warnings: NO_NULL })),
  ...['jsonl', 'csv', 'tsv'].map((from) => ({ from, to: 'toml', warnings: ROWS_NAMED })),
  ...[...TYPED, 'csv', 'tsv'].map((to) => ({ from: 'xml', to, warnings: ATTRIBUTES })),
  ...TYPED.map((to) => ({ from: 'xml', to, warnings: TEXT_VALUES })),
  ...['csv', 'tsv'].flatMap((from) => TYPED.map((to) => ({ from, to, warnings: TEXT_CELLS }))),
  { from: 'svgz', to: 'png', warnings: SVG_NOTES },
  { from: 'exr', to: 'png', warnings: CLIPPED },
  { from: 'hdr', to: 'png', warnings: CLIPPED },
  {
    from: 'svg',
    to: 'png',
    warnings: [
      { id: 'svg-fonts', text: 'Text is drawn in Inter, whatever font the file names.' },
      { id: 'svg-linked', text: 'Pictures the file links to elsewhere are left out.' },
    ],
  },
]
