import type { Trait, Warning } from './types'

export const traitWarnings: Record<Trait, Warning> = {
  alpha: { id: 'alpha-lost', text: 'Transparency will be flattened to white.' },
  animation: { id: 'animation-lost', text: 'Animation will be dropped (first frame kept).' },
  metadata: { id: 'metadata-lost', text: 'Author, location and other metadata are removed.' },
  'multi-page': { id: 'pages-lost', text: 'Only the first page will be kept.' },
  layers: { id: 'layers-lost', text: 'Layers will be merged into one image.' },
}

export const lossyToLossy: Warning = {
  id: 'lossy-to-lossy',
  text: "Lossy to lossy: quality can't improve.",
}
