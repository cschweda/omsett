import type { Format } from '../types'

export const jp2: Format = {
  id: 'jp2',
  name: 'JPEG 2000',
  category: 'image',
  extensions: ['jp2', 'j2k', 'jpf'],
  mime: ['image/jp2'],
  detect: ['jp2'],
  explain:
    'JPEG 2000 was meant to replace JPEG and never did. It survives in archives, medical imaging, digital cinema and some scanned documents. Browsers do not display it, so a JPEG 2000 file usually needs converting before anyone can look at it. Omsett writes one without losing anything.',
  lossy: 'optional',
  traits: ['alpha', 'metadata', 'full-color'],
}
