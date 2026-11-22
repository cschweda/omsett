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

/** What plain libvips reads and writes. Its two optional modules add to this, never replace it. */
const CORE = ['png', 'jpeg', 'webp', 'gif', 'tiff']
const CORE_WRITES = [webp, jpeg, png, gif, tiff]

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

  // libvips with its JPEG XL module, on the same terms.
  { engine: 'vips-jxl', tier: 'browser', reads: CORE, writes: [jxl], priority: 30 },
  { engine: 'vips-jxl', tier: 'browser', reads: ['jxl'], writes: CORE_WRITES, priority: 30 },
]
