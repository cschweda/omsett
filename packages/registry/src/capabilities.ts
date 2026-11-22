import type { Capability } from './types'

// TODO(phase-1): the long tail of raster formats joins these two lists.
//
// Both engines drop metadata. The canvas cannot write any; libvips is told not to. Every engine
// for a pair must agree on this, or what leaks would depend on the visitor's browser.
const WEBP_DEFAULTS = { quality: 80 }

export const capabilities: Capability[] = [
  {
    engine: 'canvas',
    tier: 'browser',
    reads: ['png'],
    writes: [{ format: 'webp', lossy: true, defaultOptions: WEBP_DEFAULTS, drops: ['metadata'] }],
    priority: 10,
  },
  {
    engine: 'vips',
    tier: 'browser',
    reads: ['png'],
    writes: [{ format: 'webp', lossy: true, defaultOptions: WEBP_DEFAULTS, drops: ['metadata'] }],
    priority: 20,
  },
]
