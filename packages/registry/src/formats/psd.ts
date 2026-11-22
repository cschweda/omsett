import type { Format } from '../types'

export const psd: Format = {
  id: 'psd',
  name: 'PSD',
  category: 'image',
  extensions: ['psd'],
  mime: ['image/vnd.adobe.photoshop'],
  detect: ['psd'],
  explain:
    'PSD is the file Photoshop saves its work in, with every layer kept separate so the picture can go on being edited. Little outside Adobe software opens it. Omsett reads the finished picture, with the layers merged, and turns it into something that can be shared.',
  lossy: 'never',
  traits: ['alpha', 'metadata', 'layers', 'full-color'],
  readOnly: 'PSD can be read but not written',
}
