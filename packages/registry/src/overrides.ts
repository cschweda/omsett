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
const TYPED = ['json', 'jsonl', 'yaml', 'toml']

export const overrides: EdgeOverride[] = [
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
