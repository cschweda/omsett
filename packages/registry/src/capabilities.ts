import type { Capability } from './types'

// TODO(phase-1): the long tail of raster formats joins these two lists.
const WEBP_DEFAULTS = { quality: 80 }

export const capabilities: Capability[] = [
  {
    engine: 'canvas',
    tier: 'browser',
    reads: ['png'],
    writes: [{ format: 'webp', lossy: true, defaultOptions: WEBP_DEFAULTS }],
    priority: 10,
  },
  {
    engine: 'vips',
    tier: 'browser',
    reads: ['png'],
    writes: [{ format: 'webp', lossy: true, defaultOptions: WEBP_DEFAULTS }],
    priority: 20,
  },
]
