import type { Format } from '../types'

export const heic: Format = {
  id: 'heic',
  name: 'HEIC',
  category: 'image',
  extensions: ['heic', 'heif'],
  mime: ['image/heic', 'image/heif'],
  detect: ['heic'],
  explain:
    'HEIC is what an iPhone saves photographs as. The files are small and the quality is high, but outside Apple devices little can open them, which is usually why they need converting. Omsett reads HEIC and turns it into something everything understands.',
  lossy: 'always',
  traits: ['alpha', 'metadata', 'multi-page', 'full-color'],
  readOnly: 'HEIC can be read but not written',
}
