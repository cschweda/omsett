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

export const capabilities: Capability[] = [
  {
    engine: 'canvas',
    tier: 'browser',
    reads: ['png'],
    writes: [webp, jpeg],
    priority: 10,
  },
  {
    engine: 'vips',
    tier: 'browser',
    reads: ['png', 'jpeg', 'webp', 'gif', 'tiff'],
    writes: [webp, jpeg, png, gif, tiff],
    priority: 20,
  },
]
