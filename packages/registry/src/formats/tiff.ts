import type { Format } from '../types'

export const tiff: Format = {
  id: 'tiff',
  name: 'TIFF',
  category: 'image',
  extensions: ['tiff', 'tif'],
  mime: ['image/tiff'],
  detect: ['tif'],
  explain:
    'TIFF is the format printers, scanners, and archives ask for. It keeps every pixel exactly, can hold several pages in one file, and is understood by professional software everywhere. The files are large, and web browsers will not display them, so it is a format for handing work to someone, not for putting on a website.',
  lossy: 'optional',
  traits: ['alpha', 'metadata', 'multi-page', 'full-color'],
}
