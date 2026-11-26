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
const DATA = ['json', 'jsonl', 'yaml', 'toml', 'xml', 'csv', 'tsv', 'vcf', 'ics', 'xlsx']

// What the subtitle formats cannot say to each other.
const SUBTITLES = ['srt', 'vtt', 'ass', 'ssa', 'ttml', 'lrc', 'sbv', 'smi', 'microdvd']
const FRAMES = [{ id: 'frames-assumed', text: 'MicroDVD counts video frames, not time. 23.976 frames a second is assumed unless the file says otherwise.' }]
const ONE_LINE = [{ id: 'lyrics-one-line', text: 'Each subtitle becomes a single line, timed to a hundredth of a second.' }]
const NO_ENDS = [{ id: 'ends-guessed', text: 'LRC says when a line starts, not when it ends. Each line is shown until the next one.' }]
const others = (id: string) => SUBTITLES.filter((other) => other !== id)

// Documents. Every conversion of one carries the same caution, because the person who gets
// the result may rely on a screen reader, and may not be the person who converted it.
const CHECK_ACCESS = [{ id: 'accessibility-check', text: 'The converted document may have more accessibility problems than the original. Check its headings, picture descriptions and table headers before you publish it.' }]
const FROM_OLD_WORD = [{ id: 'old-word-kept', text: 'Headings, lists, tables, links, bold and italic are kept. Pictures, fonts, colours, page layout, headers, footers, footnotes and comments are not.' }]
const FROM_WORD = [{ id: 'word-kept', text: 'Headings, lists, tables, links and pictures with their descriptions are kept. Fonts, colours, page layout, headers, footers, footnotes and comments are not.' }]
const TO_WORD = [{ id: 'word-written', text: 'Pictures inside the page go into the document. A picture kept on a website is not fetched: its description and address are written in its place.' }]

const FROM_OLD_SLIDES = [{ id: 'old-slides-kept', text: 'Each slide becomes a section, with its title as a heading. Text, lists, tables, links, and PNG and JPEG pictures with their descriptions are kept. A PPT does not mark which rows of a table are headings, so none are. Layout, animations and hidden slides are not kept, and speaker notes only if you choose to include them.' }]
const FROM_RTF = [{ id: 'rtf-kept', text: 'Headings, lists, tables, links, bold, italic and pictures are kept. Fonts, colours, page layout, headers, footers, footnotes and comments are not, nor any text deleted with changes tracked. A picture comes without a description, as RTF has nowhere to keep one.' }]
const FROM_TEXT = [
  { id: 'text-as-paragraphs', text: 'Each block of lines, between blank lines, becomes a paragraph; the lines within it join into one.' },
  { id: 'language-assumed', text: 'Plain text does not say what language it is in, and a web page should. Choose the language before converting.' },
]
const TO_TEXT = [{ id: 'text-only', text: 'Only the words are kept: headings, lists and tables are set out as lines, and pictures as their descriptions. Bold, italic, links and layout are not.' }]
const FROM_SLIDES = [{ id: 'slides-kept', text: 'Each slide becomes a section, with its title as a heading. Text, lists, tables, links and pictures with their descriptions are kept. Layout, animations and hidden slides are not, and speaker notes only if you choose to include them.' }]

// Screenplays.
const SCRIPT_KEPT = [{ id: 'script-kept', text: 'Scene headings, action, characters, dialogue, parentheticals, transitions and the title page are kept. Notes, outline headings, revision marks and page numbering are not.' }]
const PACKAGE_MAIN = [{ id: 'package-main', text: 'The script inside the package is converted. Its drafts, cut material, workbook and voice notes are the writer\'s own papers and are left out.' }]
const PACKAGE_NEW = [{ id: 'package-new', text: 'The package holds the script and nothing else: no drafts or notes yet.' }]

const TO_PDF = [{ id: 'pdf-written', text: 'The PDF is laid out afresh, on plain pages in one typeface, and is tagged: its headings, lists, tables and picture descriptions are marked as what they are, for screen readers. The look of the original is not kept: fonts, colours, columns, headers and footers.' }]
const PICTURE_PAGE = [{ id: 'pdf-of-a-picture', text: 'The PDF is one page with the picture on it. It holds no text: a scan of a letter is still a picture of a letter, which cannot be searched, copied or read aloud.' }]
const FROM_PDF = [{ id: 'pdf-read', text: 'Where the PDF is tagged, its headings, lists, tables and picture descriptions are read from the tags. Where it is not, they are estimated from the layout, and tables are not found. The result says which. Pictures themselves, and the look of the page, are not carried.' }]

// Workbooks.
const WORKBOOK_READ = [
  { id: 'first-sheet', text: 'The first sheet is converted unless you choose another, or all of them, below. Hidden sheets never are.' },
  { id: 'formulas-as-values', text: 'A formula is replaced by the value it last showed. Formatting, charts and comments are not carried over.' },
]
const WORKBOOK_WRITTEN = [{ id: 'one-plain-sheet', text: 'The workbook has one plain sheet. Text is written as text: nothing is turned into a formula.' }]
const BESIDE_WORKBOOK = ['json', 'jsonl', 'yaml', 'toml', 'xml', 'csv', 'tsv', 'vcf', 'ics']

// Contacts and events.
const NOT_THE_SAME = 'An address book holds people and a calendar holds events. One cannot become the other'
const CONTACT_COLUMNS = [{ id: 'contact-columns', text: 'Each row becomes a contact, from the columns Omsett recognises: name, given name, family name, organization, title, email, phone, address, url, birthday, note. Other columns are left out.' }]
const EVENT_COLUMNS = [{ id: 'event-columns', text: 'Each row becomes an event, from the columns Omsett recognises: summary (or title), start, end, location, description, url, timezone. Write dates as 2026-11-23 or 2026-11-23 14:30.' }]
const CONTACT_EXTRAS = [{ id: 'contact-extras', text: 'Photos, and details beyond the usual ones, are left out.' }]
const EVENT_EXTRAS = [{ id: 'event-extras', text: 'Reminders and time-zone rules are left out. A repeating event is one row, with its rule as text.' }]
const TABLES = ['json', 'jsonl', 'yaml', 'toml', 'xml', 'csv', 'tsv', 'xlsx']

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

// Sound.
const KEPT_WHOLE = ['wav', 'flac', 'aiff', 'au']
// Sound that leaves some out, and sound that keeps every bit.
const SMALLER_SOUND = ['opus', 'ogg']
const ALREADY_LEFT_OUT = ['aac', 'ac3', 'wma', 'opus', 'ogg']
const SMALL_LEFT_OUT = [{ id: 'sound-left-out-small', text: 'Opus and Ogg Vorbis leave out sound to make the file small. It cannot be put back, so keep the original.' }]
const ALREADY_GONE = [{ id: 'sound-already-left-out', text: 'This kind of file has already left sound out. Converting it does not bring that back; a file that keeps every bit only gets larger.' }]
const M4A_LOSSLESS = [{ id: 'm4a-lossless', text: 'Omsett writes M4A as Apple Lossless, which keeps every bit of the sound and is much larger than an M4A from a phone. AAC is not written: its encoders are covered by patents.' }]
const LEFT_OUT = [{ id: 'sound-left-out', text: 'MP3 leaves out sound to make the file small. It cannot be put back, so keep the original.' }]
const NOT_RESTORED = [{ id: 'sound-not-restored', text: 'An MP3 has already left sound out. Converting it does not bring that back; the file only gets larger.' }]

const BOOK_AS_PAGE = [{ id: 'book-as-page', text: 'The whole book is set out as one document, a section to each of its pages. Headings, lists, tables, links, notes and pictures with their descriptions are kept. The book\'s own look is not: fonts, colours and layout.' }]
const PAGE_AS_BOOK = [{ id: 'page-as-book', text: 'A chapter starts at each main heading, and the headings become the list of contents. Pictures inside the file go into the book. A picture kept on a website is not fetched: its description is kept.' }]
// A book is as its publisher made it, and the person converting it is rarely the publisher.
const AS_PUBLISHED = [{ id: 'book-as-published', text: 'A book is only as accessible as its publisher made it. Pictures that came without a description, tables without headings, and lists typed as plain paragraphs, stay that way: Omsett keeps what the book has and cannot add what it lacks.' }]
const KINDLE_BOOK = [{ id: 'book-kept', text: 'The pages, pictures, stylesheets, links and list of contents are kept, and so are the title and the author. Fonts carried inside the book are not, and nor is anything a page could run.' }]
const TABLE_PAGE = [{ id: 'table-as-page', text: 'The rows are set out as one table on a page, to be read. The first row of the table names its columns. Lists and groups inside a row are written as text.' }]

const TYPED = ['json', 'jsonl', 'yaml', 'toml']
// Workbooks read and never written: from before 2007, and OpenDocument's.
const READ_ONLY_BOOKS = ['xls', 'ods']

export const overrides: EdgeOverride[] = [
  { from: 'fountain', to: 'fdx', warnings: SCRIPT_KEPT },
  { from: 'fdx', to: 'fountain', warnings: SCRIPT_KEPT },
  { from: 'drafter', to: 'fountain', warnings: PACKAGE_MAIN },
  { from: 'drafter', to: 'fdx', warnings: [...PACKAGE_MAIN, ...SCRIPT_KEPT] },
  { from: 'fountain', to: 'drafter', warnings: PACKAGE_NEW },
  { from: 'fdx', to: 'drafter', warnings: [...PACKAGE_NEW, ...SCRIPT_KEPT] },
  { from: 'docx', to: 'html', warnings: [...FROM_WORD, ...CHECK_ACCESS] },
  { from: 'doc', to: 'html', warnings: [...FROM_OLD_WORD, ...CHECK_ACCESS] },
  { from: 'pptx', to: 'html', warnings: [...FROM_SLIDES, ...CHECK_ACCESS] },
  { from: 'ppt', to: 'html', warnings: [...FROM_OLD_SLIDES, ...CHECK_ACCESS] },
  { from: 'odt', to: 'html', warnings: [...FROM_WORD, ...CHECK_ACCESS] },
  { from: 'odp', to: 'html', warnings: [...FROM_SLIDES, ...CHECK_ACCESS] },
  { from: 'pdf', to: 'html', warnings: [...FROM_PDF, ...CHECK_ACCESS] },
  { from: 'html', to: 'pdf', warnings: [...TO_PDF, ...CHECK_ACCESS] },
  { from: 'png', to: 'pdf', warnings: PICTURE_PAGE },
  { from: 'html', to: 'docx', warnings: [...TO_WORD, ...CHECK_ACCESS] },
  { from: 'html', to: 'odt', warnings: [...TO_WORD, ...CHECK_ACCESS] },
  { from: 'rtf', to: 'html', warnings: [...FROM_RTF, ...CHECK_ACCESS] },
  { from: 'html', to: 'rtf', warnings: [...TO_WORD, ...CHECK_ACCESS] },
  { from: 'txt', to: 'html', warnings: FROM_TEXT },
  { from: 'html', to: 'txt', warnings: TO_TEXT },
  ...BESIDE_WORKBOOK.flatMap((other) => [
    { from: 'xlsx', to: other, warnings: WORKBOOK_READ },
    { from: other, to: 'xlsx', warnings: WORKBOOK_WRITTEN },
  ]),
  ...[...DATA, ...READ_ONLY_BOOKS].map((from) => ({ from, to: 'html', warnings: ['xlsx', ...READ_ONLY_BOOKS].includes(from) ? [...WORKBOOK_READ, ...TABLE_PAGE] : TABLE_PAGE })),
  // A workbook from before 2007, or an OpenDocument one, is read as the newer kind is, and says the same of itself.
  ...READ_ONLY_BOOKS.flatMap((from) => [
    { from, to: 'vcf', warnings: CONTACT_COLUMNS },
    { from, to: 'ics', warnings: EVENT_COLUMNS },
    ...BESIDE_WORKBOOK.map((other) => ({ from, to: other, warnings: WORKBOOK_READ })),
    { from, to: 'xlsx', warnings: [...WORKBOOK_READ, ...WORKBOOK_WRITTEN] },
  ]),
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
  ...['csv', 'tsv'].flatMap((to) => [...DATA, ...READ_ONLY_BOOKS].filter((from) => from !== to).map((from) => ({ from, to, warnings: FORMULAS }))),
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
  ...['epub', 'azw3', 'mobi'].map((from) => ({ from, to: 'html', warnings: [...BOOK_AS_PAGE, ...AS_PUBLISHED, ...CHECK_ACCESS] })),
  { from: 'html', to: 'epub', warnings: [...PAGE_AS_BOOK, ...CHECK_ACCESS] },
  { from: 'azw3', to: 'epub', warnings: [...KINDLE_BOOK, ...AS_PUBLISHED] },
  { from: 'mobi', to: 'epub', warnings: [...KINDLE_BOOK, ...AS_PUBLISHED] },
  ...[...KEPT_WHOLE, 'm4a', 'aac', 'ac3', 'wma', 'wv', 'tta'].flatMap((from) => SMALLER_SOUND.filter((to) => to !== from).map((to) => ({ from, to, warnings: SMALL_LEFT_OUT }))),
  ...ALREADY_LEFT_OUT.flatMap((from) => ['wav', 'wv', 'm4a'].filter((to) => to !== from).map((to) => ({ from, to, warnings: to === 'm4a' ? [...ALREADY_GONE, ...M4A_LOSSLESS] : ALREADY_GONE }))),
  ...[...KEPT_WHOLE, 'wv', 'tta'].map((from) => ({ from, to: 'm4a', warnings: M4A_LOSSLESS })),
  ...KEPT_WHOLE.flatMap((other) => [
    { from: other, to: 'mp3', warnings: LEFT_OUT },
    { from: 'mp3', to: other, warnings: NOT_RESTORED },
  ]),
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
