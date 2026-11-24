import type { Format } from '../types'

export const fits: Format = {
  id: 'fits',
  name: 'FITS',
  category: 'image',
  extensions: ['fits', 'fit', 'fts'],
  mime: ['image/fits', 'application/fits'],
  detect: ['fits'],
  explain:
    'FITS is the format astronomers keep their pictures in: what a telescope measured, with notes on where and when it was pointed. One file can hold several pictures, and each is usually in shades of grey. Omsett reads the first, and leaves the notes behind.',
  lossy: 'never',
  traits: ['metadata', 'multi-page', 'full-color'],
  readOnly: 'FITS can be read but not written',
}
