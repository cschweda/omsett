import type { Trait, Warning } from './types'

export const traitWarnings: Record<Trait, Warning> = {
  alpha: { id: 'alpha-lost', text: 'Transparency will be flattened to white.' },
  animation: { id: 'animation-lost', text: 'Animation will be dropped (first frame kept).' },
  metadata: { id: 'metadata-lost', text: 'Author, location and other metadata are removed.' },
  'multi-page': { id: 'pages-lost', text: 'Only the first page will be kept.' },
  layers: { id: 'layers-lost', text: 'Layers will be merged into one image.' },
  'full-color': { id: 'colors-reduced', text: 'Reduced to 256 colours.' },
  nesting: { id: 'nesting-flattened', text: 'A table holds one value per cell. Lists and groups inside a row are written as text.' },
  styling: { id: 'styling-lost', text: 'Only the words and their times are kept. Fonts, colours, italics and positions are not.' },
  comments: { id: 'comments-lost', text: 'Comments are not carried over.' },
}

export const lossyToLossy: Warning = {
  id: 'lossy-to-lossy',
  text: "Lossy to lossy: quality can't improve.",
}
