import type { EdgeOverride } from './types'

// Pair-specific exceptions: a block, or a warning the trait model cannot derive.
// (What an engine leaves out on purpose is declared on its capability, as `drops`.)
const SVG_NOTES = [
  { id: 'svg-fonts', text: 'Text is drawn in Inter, whatever font the file names.' },
  { id: 'svg-linked', text: 'Pictures the file links to elsewhere are left out.' },
]
const CLIPPED = [{ id: 'range-clipped', text: 'Brightness beyond what a screen shows is cut off.' }]

export const overrides: EdgeOverride[] = [
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
