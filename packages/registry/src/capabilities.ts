import type { Capability, Trait, WriteSpec } from './types'

// What each engine reads and writes. Every conversion the app offers follows from these lists.
//
// Three rules hold for every engine here, and must hold for any engine added:
//
// - Metadata is dropped. The canvas cannot write any; libvips is told not to. If one engine for
//   a pair kept it, what leaks would depend on the visitor's browser.
// - Only the first frame or page is converted, so animation and extra pages are dropped too.
//   TODO(phase-1): carry animation across where both formats have it.
// - The canvas reads PNG only. A browser's own decoder forgives damaged files and returns the
//   part it could read; PNG is the one format whose structure the app verifies itself before
//   letting the browser decode it (packages/detect/src/png-structure.ts). Every other format is
//   read by libvips, which treats damage as an error.

const DROPPED: WriteSpec['drops'] = ['metadata', 'animation', 'multi-page']

const webp: WriteSpec = { format: 'webp', lossy: true, defaultOptions: { quality: 80 }, drops: DROPPED }
const jpeg: WriteSpec = { format: 'jpeg', lossy: true, defaultOptions: { quality: 85 }, drops: DROPPED }
const png: WriteSpec = { format: 'png', lossy: false, drops: DROPPED }
// GIF stores pixels exactly but holds only 256 colours, so writing one loses colour.
const gif: WriteSpec = { format: 'gif', lossy: true, drops: DROPPED }
const tiff: WriteSpec = { format: 'tiff', lossy: false, defaultOptions: { compression: 'lzw' }, drops: DROPPED }

// AVIF is slow to write. Effort 2 is about ten times quicker than libvips's default for a file a
// few percent larger, which is the right trade for something a person is waiting on.
const avif: WriteSpec = { format: 'avif', lossy: true, defaultOptions: { quality: 55, effort: 2 }, drops: DROPPED }
const jxl: WriteSpec = { format: 'jxl', lossy: true, defaultOptions: { quality: 85 }, drops: DROPPED }

const bmp: WriteSpec = { format: 'bmp', lossy: false, drops: DROPPED }
const qoi: WriteSpec = { format: 'qoi', lossy: false, drops: DROPPED }
const tga: WriteSpec = { format: 'tga', lossy: false, drops: DROPPED }
const pnm: WriteSpec = { format: 'pnm', lossy: false, drops: DROPPED }
// An icon is one picture at several sizes. These are the ones Windows and browsers ask for; a
// picture smaller than one of them is not made larger to fill it.
const ico: WriteSpec = { format: 'ico', lossy: false, defaultOptions: { iconSizes: [16, 32, 48, 256] }, drops: DROPPED }
// JPEG 2000 is written whole: every pixel comes back as it went in.
const jp2: WriteSpec = { format: 'jp2', lossy: false, drops: DROPPED }
// A game's texture, written plainly: the pixels as they are, and no smaller copies beside
// them. The packed kinds a graphics card reads directly lose detail, and are a choice for later.
const dds: WriteSpec = { format: 'dds', lossy: false, defaultOptions: { defines: { 'dds:compression': 'none', 'dds:mipmaps': '0' } }, drops: DROPPED }
// A pointer is an icon with a note of which point of it does the clicking: the top left corner,
// where the tip of an arrow is.
const cur: WriteSpec = { format: 'cur', lossy: false, defaultOptions: { iconSizes: [32, 48, 64], iconHotspot: [0, 0] }, drops: DROPPED }
// A Mac icon holds only the sizes it has names for, each as a PNG under that name.
const icns: WriteSpec = {
  format: 'icns',
  lossy: false,
  defaultOptions: {
    iconSizes: [16, 32, 64, 128, 256, 512, 1024],
    iconExact: true,
    iconNames: { 16: 'icp4', 32: 'icp5', 64: 'ic12', 128: 'ic07', 256: 'ic08', 512: 'ic09', 1024: 'ic10' },
  },
  drops: DROPPED,
}
const MAGICK_READS = ['bmp', 'tga', 'qoi', 'pnm', 'psd', 'psb', 'ico', 'cur', 'jp2', 'exr', 'hdr', 'dds', 'fits', 'dcm', 'dng', 'pcx', 'sgi', 'ras']

/** What plain libvips reads and writes. Its two optional modules add to this, never replace it. */
const CORE = ['png', 'jpeg', 'webp', 'gif', 'tiff']
const CORE_WRITES = [webp, jpeg, png, gif, tiff]
const ANIMATED_PNG = ['apng']

// Data formats are all read into the same plain values and written back out, so every one
// converts to every other in a single step. Comments have nowhere to live in between.
// Address books and calendars are rows too: a contact or an event to a row.
// And a workbook is rows in a sheet.
const DATA = ['json', 'yaml', 'csv', 'xlsx', 'xml', 'toml', 'jsonl', 'tsv', 'vcf', 'ics']
const DATA_WRITES: WriteSpec[] = DATA.map((format) => ({ format, lossy: false, drops: ['comments'] }))

// Subtitles are read into lines of text with a start and an end, and written from those. How
// the text looked has nowhere to live in between.
const SUBTITLES = ['srt', 'vtt', 'ass', 'ssa', 'ttml', 'lrc', 'sbv', 'smi', 'microdvd']
const SUBTITLE_WRITES: WriteSpec[] = SUBTITLES.map((format) => ({ format, lossy: false, drops: ['styling'] }))

const TABLES = ['csv', 'tsv', 'xlsx']
const SHEETS = ['xlsx', 'xls', 'ods']
const SHAPED = ['json', 'yaml']
// Any of these can also be set out as a web page: a real table, to read. A page says what
// language it is in, and the file does not, so that is a choice.
const PAGE: WriteSpec = { format: 'html', lossy: false, drops: ['comments'], defaultOptions: { language: 'en' } }
const TABLE_WRITES: WriteSpec[] = [
  ...DATA.map((format) => ({
    format,
    lossy: false,
    drops: ['comments'] as Trait[],
    defaultOptions: { headerRow: true, ...(SHAPED.includes(format) ? { shape: 'records' } : {}) },
  })),
  { ...PAGE, defaultOptions: { headerRow: true, language: 'en' } },
]
// A workbook has sheets, and which of them is converted is a choice: the first with anything
// in it, one by its position, or all of them.
const SHEET_WRITES: WriteSpec[] = TABLE_WRITES.map((write) => ({ ...write, defaultOptions: { ...write.defaultOptions, sheet: 'first' } }))
const SCRIPTS = ['fountain', 'fdx', 'drafter']
const ARCHIVES = ['zip', 'tgz', 'tar']
const SFNT = ['ttf', 'otf', 'woff']
const SOUNDS = ['wav', 'flac', 'aiff', 'au']
// The long tail of sound, read by FFmpeg (libav.js): unpacked to WAV, and from WAV made into the rest.
const LONG_TAIL = ['m4a', 'aac', 'ac3', 'wma', 'ogg', 'opus', 'wv', 'tta']

export const capabilities: Capability[] = [
  {
    engine: 'canvas',
    tier: 'browser',
    reads: ['png'],
    writes: [webp, jpeg],
    priority: 10,
  },
  { engine: 'vips', tier: 'browser', reads: CORE, writes: CORE_WRITES, priority: 20 },
  // An animated PNG is read as the PNG it also is: its first picture. Never by the canvas,
  // which is given plain PNG only.
  { engine: 'vips', tier: 'browser', reads: ANIMATED_PNG, writes: CORE_WRITES, priority: 20 },

  // libvips with its HEIF module, which reads and writes AVIF. Loaded only when AVIF is
  // involved, so nobody converting a PNG to a JPEG pays for it. An engine may have more than
  // one entry; these two keep it from being offered for pairs plain libvips covers.
  //
  // The module can open a HEIC file's header but cannot decode its pixels: this build of
  // libvips has no HEVC decoder. HEIC needs a decoder of its own (see docs/format-roadmap.md).
  { engine: 'vips-heif', tier: 'browser', reads: [...CORE, ...ANIMATED_PNG], writes: [avif], priority: 30 },
  { engine: 'vips-heif', tier: 'browser', reads: ['avif'], writes: CORE_WRITES, priority: 30 },

  // libheif with libde265, which decodes HEIC. It hands back plain pixels, written out as a PNG;
  // from there any other engine takes over, so HEIC to JPEG is two steps. It can be switched
  // off in switches.ts.
  { engine: 'heif', tier: 'browser', reads: ['heic'], writes: [png], priority: 30 },

  // resvg draws an SVG and hands back a PNG, on the same terms as HEIC: other engines go on
  // from there. It is given Omsett's own typeface, since a browser tab has no fonts to offer.
  { engine: 'resvg', tier: 'browser', reads: ['svg', 'svgz'], writes: [png], priority: 30 },

  // Mac icons, by Omsett's own code: the largest picture in the file, handed on as a PNG.
  { engine: 'icon', tier: 'browser', reads: ['icns'], writes: [png], priority: 30 },

  // ImageMagick, for the long tail of formats nothing else here reads. It is large, so it is
  // the last resort: it reads these to PNG and writes them from PNG, and every other pair goes
  // through that step. An icon is the one thing it writes at another size than it was given. Each file is read as the one format it was identified as, never guessed.
  { engine: 'magick', tier: 'browser', reads: MAGICK_READS, writes: [png], priority: 40 },
  { engine: 'magick', tier: 'browser', reads: ['png'], writes: [bmp, qoi, tga, pnm, ico, cur, icns, jp2, dds], priority: 40 },

  // libvips with its JPEG XL module, on the same terms.
  { engine: 'vips-jxl', tier: 'browser', reads: CORE, writes: [jxl], priority: 30 },
  { engine: 'vips-jxl', tier: 'browser', reads: ['jxl'], writes: CORE_WRITES, priority: 30 },

  // Small parsers written in JavaScript: nothing to download beyond the app itself.
  // A table going in has two things to say about itself that nothing else does: whether its
  // first row is the names of its columns, and, for a format that can nest, what shape to take.
  { engine: 'data', tier: 'browser', reads: TABLES.filter((format) => !SHEETS.includes(format)), writes: TABLE_WRITES, priority: 20 },
  { engine: 'data', tier: 'browser', reads: SHEETS, writes: SHEET_WRITES, priority: 20 },
  { engine: 'data', tier: 'browser', reads: DATA.filter((format) => !TABLES.includes(format)), writes: [...DATA_WRITES, PAGE], priority: 20 },
  // Screenplays are read into their elements and written from them, in Omsett's own code.
  { engine: 'script', tier: 'browser', reads: SCRIPTS, writes: SCRIPTS.map((format) => ({ format, lossy: false })), priority: 20 },

  // Archives are unpacked into files and folders and packed again, in Omsett's own code.
  { engine: 'archive', tier: 'browser', reads: ARCHIVES, writes: ARCHIVES.map((format) => ({ format, lossy: false })), priority: 20 },

  // Fonts. TTF, OTF and WOFF are read and written by Omsett's own code. WOFF2 needs a
  // compressor of its own, which is a separate engine so that only WOFF2 work fetches it.
  { engine: 'font', tier: 'browser', reads: SFNT, writes: SFNT.map((format) => ({ format, lossy: false })), priority: 20 },
  { engine: 'font-woff2', tier: 'browser', reads: SFNT, writes: [{ format: 'woff2', lossy: false }], priority: 30 },
  { engine: 'font-woff2', tier: 'browser', reads: ['woff2'], writes: SFNT.map((format) => ({ format, lossy: false })), priority: 30 },

  // Sound stored unpacked, in Omsett's own code: a new label, and the same numbers. A title, an
  // artist and whatever else the file says about itself are left behind, as a picture's are.
  { engine: 'audio', tier: 'browser', reads: SOUNDS, writes: SOUNDS.map((format) => ({ format, lossy: false, drops: ['metadata'] as Trait[] })), priority: 20 },
  // MP3, through mpg123 and LAME, which are fetched only for this. How much sound is left out
  // to make the file small is the person's choice.
  { engine: 'audio-mp3', tier: 'browser', reads: SOUNDS, writes: [{ format: 'mp3', lossy: true, drops: ['metadata'], defaultOptions: { soundQuality: 'standard' } }], priority: 30 },
  { engine: 'audio-mp3', tier: 'browser', reads: ['mp3'], writes: SOUNDS.map((format) => ({ format, lossy: false, drops: ['metadata'] as Trait[] })), priority: 30 },
  // FFmpeg reads the long tail into WAV, and writes the four it can write freely. Opus and
  // Vorbis leave out sound, by the person's choice of how much; WavPack and Apple Lossless keep
  // every bit. AAC and AC-3 are never written: their encoders are covered by patents.
  { engine: 'audio-libav', tier: 'browser', reads: LONG_TAIL, writes: [{ format: 'wav', lossy: false, drops: ['metadata'] }], priority: 30 },
  {
    engine: 'audio-libav',
    tier: 'browser',
    reads: ['wav', 'flac', 'aiff', ...LONG_TAIL],
    writes: [
      { format: 'opus', lossy: true, drops: ['metadata'], defaultOptions: { soundQuality: 'standard' } },
      { format: 'ogg', lossy: true, drops: ['metadata'], defaultOptions: { soundQuality: 'standard' } },
      { format: 'wv', lossy: false, drops: ['metadata'] },
      { format: 'm4a', lossy: false, drops: ['metadata'] },
    ],
    priority: 30,
  },

  // A Kindle book is taken apart and written as an EPUB, in Omsett's own code.
  { engine: 'ebook', tier: 'browser', reads: ['azw3', 'mobi'], writes: [{ format: 'epub', lossy: false }], priority: 20 },
  // A book set out as one page, which is how it reaches PDF, Word and Markdown; and a page cut
  // into chapters and written as a book, which is how those reach EPUB.
  { engine: 'ebook', tier: 'browser', reads: ['epub', 'azw3', 'mobi'], writes: [{ format: 'html', lossy: false }], priority: 20 },
  { engine: 'ebook', tier: 'browser', reads: ['html'], writes: [{ format: 'epub', lossy: false }], priority: 20 },

  // Markdown and HTML, each to the other, through a tree that is cleaned on the way.
  {
    engine: 'markup',
    tier: 'browser',
    reads: ['md'],
    // Markdown does not say what language it is in, and a page must. This is the default; the
    // person converting can say otherwise.
    writes: [{ format: 'html', lossy: false, defaultOptions: { language: 'en' } }],
    priority: 20,
  },
  { engine: 'markup', tier: 'browser', reads: ['html'], writes: [{ format: 'md', lossy: false }], priority: 20 },
  // A Word document is read to a page and written from one. To and from Markdown is two
  // steps, through the page.
  { engine: 'markup', tier: 'browser', reads: ['docx'], writes: [{ format: 'html', lossy: false }], priority: 20 },
  { engine: 'markup', tier: 'browser', reads: ['html'], writes: [{ format: 'docx', lossy: false }], priority: 20 },
  // A Word document from before 2007 is read to a page as the newer kind is. It is never written.
  { engine: 'markup', tier: 'browser', reads: ['doc'], writes: [{ format: 'html', lossy: false }], priority: 20 },
  // A page is laid out as a PDF by Typst, which is large and is fetched only for this. Every
  // other document reaches PDF through a page: a Word document in two steps, Markdown in two.
  { engine: 'typst', tier: 'browser', reads: ['html'], writes: [{ format: 'pdf', lossy: false }], priority: 30 },
  // A picture is set on a page of its own, the shape of the picture. Only PNG is read here:
  // every other picture is made a PNG first, by the engines that leave its metadata behind.
  { engine: 'typst', tier: 'browser', reads: ['png'], writes: [{ format: 'pdf', lossy: false, defaultOptions: { onPage: true }, drops: ['metadata'] }], priority: 30 },
  // A PDF is read to a page, from its tags where it has them and from its layout where not.
  { engine: 'pdf', tier: 'browser', reads: ['pdf'], writes: [{ format: 'html', lossy: false }], priority: 20 },
  // A presentation is read to a page, a section to a slide. Its speaker notes are left out
  // unless the person converting asks for them.
  { engine: 'markup', tier: 'browser', reads: ['pptx'], writes: [{ format: 'html', lossy: false, defaultOptions: { speakerNotes: false } }], priority: 20 },
  // A presentation from before 2007 is read to a page as the newer kind is. It is never written.
  { engine: 'markup', tier: 'browser', reads: ['ppt'], writes: [{ format: 'html', lossy: false, defaultOptions: { speakerNotes: false } }], priority: 20 },
  // RTF is read to a page by Pandoc, fetched only for this; Omsett's own code walks the RTF
  // first, and cleans the page Pandoc makes. It is written from a page by Omsett's own code,
  // with real lists and headings, which Pandoc's writer does not make.
  { engine: 'pandoc', tier: 'browser', reads: ['rtf'], writes: [{ format: 'html', lossy: false }], priority: 30 },
  { engine: 'markup', tier: 'browser', reads: ['html'], writes: [{ format: 'rtf', lossy: false }], priority: 20 },
  // Plain text is read as paragraphs and written as lines, by Omsett's own code.
  { engine: 'markup', tier: 'browser', reads: ['txt'], writes: [{ format: 'html', lossy: false, defaultOptions: { language: 'en' } }], priority: 20 },
  { engine: 'markup', tier: 'browser', reads: ['html'], writes: [{ format: 'txt', lossy: false }], priority: 20 },
  // An OpenDocument presentation is read to a page as a PowerPoint one is. It is not written yet.
  { engine: 'markup', tier: 'browser', reads: ['odp'], writes: [{ format: 'html', lossy: false, defaultOptions: { speakerNotes: false } }], priority: 20 },
  // An OpenDocument text is read to a page as a Word document is, and written from one.
  { engine: 'markup', tier: 'browser', reads: ['odt'], writes: [{ format: 'html', lossy: false }], priority: 20 },
  { engine: 'markup', tier: 'browser', reads: ['html'], writes: [{ format: 'odt', lossy: false }], priority: 20 },
  { engine: 'subtitle', tier: 'browser', reads: SUBTITLES, writes: SUBTITLE_WRITES, priority: 20 },
]
