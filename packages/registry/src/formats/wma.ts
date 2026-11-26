import type { Format } from '../types'

export const wma: Format = {
  id: 'wma',
  name: 'WMA',
  category: 'audio',
  extensions: ['wma'],
  mime: ['audio/x-ms-wma'],
  detect: ['asf'],
  explain:
    'WMA is Windows Media Audio, the sound format of Windows Media Player and of many older music downloads. Converting it to MP3, FLAC or WAV makes it play everywhere.',
  lossy: 'optional',
  traits: ['metadata'],
  readOnly: 'WMA can be read but not written: it is an old Microsoft format, and few new programs play it',
}
