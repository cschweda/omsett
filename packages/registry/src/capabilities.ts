import type { Capability, WriteSpec } from './types'

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
const MAGICK_READS = ['bmp', 'tga', 'qoi', 'pnm', 'psd', 'ico', 'jp2', 'exr', 'hdr', 'pcx', 'sgi', 'ras']

/** What plain libvips reads and writes. Its two optional modules add to this, never replace it. */
const CORE = ['png', 'jpeg', 'webp', 'gif', 'tiff']
const CORE_WRITES = [webp, jpeg, png, gif, tiff]

// Data formats are all read into the same plain values and written back out, so every one
// converts to every other in a single step. Comments have nowhere to live in between.
const DATA = ['json', 'yaml', 'csv', 'xml', 'toml', 'jsonl', 'tsv']
const DATA_WRITES: WriteSpec[] = DATA.map((format) => ({ format, lossy: false, drops: ['comments'] }))

// Subtitles are read into lines of text with a start and an end, and written from those. How
// the text looked has nowhere to live in between.
const SUBTITLES = ['srt', 'vtt', 'ass', 'ssa', 'ttml', 'lrc', 'sbv', 'smi', 'microdvd']
const SUBTITLE_WRITES: WriteSpec[] = SUBTITLES.map((format) => ({ format, lossy: false, drops: ['styling'] }))

export const capabilities: Capability[] = [
  {
    engine: 'canvas',
    tier: 'browser',
    reads: ['png'],
    writes: [webp, jpeg],
    priority: 10,
  },
  { engine: 'vips', tier: 'browser', reads: CORE, writes: CORE_WRITES, priority: 20 },

  // libvips with its HEIF module, which reads and writes AVIF. Loaded only when AVIF is
  // involved, so nobody converting a PNG to a JPEG pays for it. An engine may have more than
  // one entry; these two keep it from being offered for pairs plain libvips covers.
  //
  // The module can open a HEIC file's header but cannot decode its pixels: this build of
  // libvips has no HEVC decoder. HEIC needs a decoder of its own (see docs/format-roadmap.md).
  { engine: 'vips-heif', tier: 'browser', reads: CORE, writes: [avif], priority: 30 },
  { engine: 'vips-heif', tier: 'browser', reads: ['avif'], writes: CORE_WRITES, priority: 30 },

  // libheif with libde265, which decodes HEIC. It hands back plain pixels, written out as a PNG;
  // from there any other engine takes over, so HEIC to JPEG is two steps. It can be switched
  // off in switches.ts.
  { engine: 'heif', tier: 'browser', reads: ['heic'], writes: [png], priority: 30 },

  // resvg draws an SVG and hands back a PNG, on the same terms as HEIC: other engines go on
  // from there. It is given Omsett's own typeface, since a browser tab has no fonts to offer.
  { engine: 'resvg', tier: 'browser', reads: ['svg', 'svgz'], writes: [png], priority: 30 },

  // ImageMagick, for the long tail of formats nothing else here reads. It is large, so it is
  // the last resort: it reads these to PNG and writes them from PNG, and every other pair goes
  // through that step. Each file is read as the one format it was identified as, never guessed.
  { engine: 'magick', tier: 'browser', reads: MAGICK_READS, writes: [png], priority: 40 },
  { engine: 'magick', tier: 'browser', reads: ['png'], writes: [bmp, qoi, tga, pnm], priority: 40 },

  // libvips with its JPEG XL module, on the same terms.
  { engine: 'vips-jxl', tier: 'browser', reads: CORE, writes: [jxl], priority: 30 },
  { engine: 'vips-jxl', tier: 'browser', reads: ['jxl'], writes: CORE_WRITES, priority: 30 },

  // Small parsers written in JavaScript: nothing to download beyond the app itself.
  { engine: 'data', tier: 'browser', reads: DATA, writes: DATA_WRITES, priority: 20 },
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
  { engine: 'subtitle', tier: 'browser', reads: SUBTITLES, writes: SUBTITLE_WRITES, priority: 20 },
]
