import type { Format } from '../types'

export const dng: Format = {
  id: 'dng',
  name: 'DNG',
  category: 'image',
  extensions: ['dng'],
  mime: ['image/x-adobe-dng'],
  detect: ['dng'],
  explain:
    'DNG is a camera\u2019s raw file in an open format: what the sensor recorded, before the camera made a picture of it. Some phones and cameras save it directly, and other raw files can be turned into it. Omsett develops it with standard settings, the right way up, so colours and brightness may differ a little from what the camera or a photo editor would show.',
  lossy: 'optional',
  traits: ['metadata', 'multi-page', 'full-color'],
  readOnly: 'DNG can be read but not written',
}
