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
// Every format that can be written into a table, address books and calendars included.
const DATA = ['json', 'jsonl', 'yaml', 'toml', 'xml', 'csv', 'tsv', 'vcf', 'ics']

// What the subtitle formats cannot say to each other.
const SUBTITLES = ['srt', 'vtt', 'ass', 'ssa', 'ttml', 'lrc', 'sbv', 'smi', 'microdvd']
const FRAMES = [{ id: 'frames-assumed', text: 'MicroDVD counts video frames, not time. 23.976 frames a second is assumed unless the file says otherwise.' }]
const ONE_LINE = [{ id: 'lyrics-one-line', text: 'Each subtitle becomes a single line, timed to a hundredth of a second.' }]
const NO_ENDS = [{ id: 'ends-guessed', text: 'LRC says when a line starts, not when it ends. Each line is shown until the next one.' }]
const others = (id: string) => SUBTITLES.filter((other) => other !== id)

// Contacts and events.
const NOT_THE_SAME = 'An address book holds people and a calendar holds events. One cannot become the other'
const CONTACT_COLUMNS = [{ id: 'contact-columns', text: 'Each row becomes a contact, from the columns Omsett recognises: name, given name, family name, organization, title, email, phone, address, url, birthday, note. Other columns are left out.' }]
const EVENT_COLUMNS = [{ id: 'event-columns', text: 'Each row becomes an event, from the columns Omsett recognises: summary (or title), start, end, location, description, url, timezone. Write dates as 2026-11-23 or 2026-11-23 14:30.' }]
const CONTACT_EXTRAS = [{ id: 'contact-extras', text: 'Photos, and details beyond the usual ones, are left out.' }]
const EVENT_EXTRAS = [{ id: 'event-extras', text: 'Reminders and time-zone rules are left out. A repeating event is one row, with its rule as text.' }]
const TABLES = ['json', 'jsonl', 'yaml', 'toml', 'xml', 'csv', 'tsv']

// Archives.
const ARCHIVES = ['zip', 'tgz', 'tar']
const ARCHIVE_NOTES = [
  { id: 'archive-links', text: 'Links and other special files are left out. Only files and folders are kept.' },
  { id: 'archive-owners', text: 'Who owned each file is not carried over. Names, contents and dates are.' },
]

// Fonts.
const REDRAW = 'TTF and OTF draw letters in different ways. Changing one into the other means redrawing every letter, which Omsett does not do yet'
const WEB_LICENCE = [{ id: 'font-licence', text: "Check that the font's licence allows it to be used on a website." }]
const OUTLINES = [{ id: 'font-outlines', text: 'A web font unwraps to TTF or to OTF, depending on how its letters are drawn. If one is refused, choose the other.' }]

const TYPED = ['json', 'jsonl', 'yaml', 'toml']

export const overrides: EdgeOverride[] = [
  ...ARCHIVES.flatMap((from) => ARCHIVES.filter((to) => to !== from).map((to) => ({ from, to, warnings: ARCHIVE_NOTES }))),
  { from: 'vcf', to: 'ics', block: NOT_THE_SAME },
  { from: 'ics', to: 'vcf', block: NOT_THE_SAME },
  ...TABLES.flatMap((other) => [
    { from: other, to: 'vcf', warnings: CONTACT_COLUMNS },
    { from: other, to: 'ics', warnings: EVENT_COLUMNS },
    { from: 'vcf', to: other, warnings: CONTACT_EXTRAS },
    { from: 'ics', to: other, warnings: EVENT_EXTRAS },
  ]),
  // A TTF and an OTF hold different kinds of outline. Going between them is drawing.
  { from: 'ttf', to: 'otf', block: REDRAW },
  { from: 'otf', to: 'ttf', block: REDRAW },
  ...['ttf', 'otf', 'woff', 'woff2'].flatMap((from) =>
    ['woff', 'woff2'].filter((to) => to !== from).map((to) => ({ from, to, warnings: WEB_LICENCE })),
  ),
  ...['woff', 'woff2'].flatMap((from) => ['ttf', 'otf'].map((to) => ({ from, to, warnings: OUTLINES }))),
  {
    from: 'md',
    to: 'html',
    warnings: [
      { id: 'markup-cleaned', text: 'Scripts, and anything else in the file that could run, are left out.' },
      { id: 'language-assumed', text: 'Markdown does not say what language it is in, and a web page should. Choose the language before converting.' },
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
