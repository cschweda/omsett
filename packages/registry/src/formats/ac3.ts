import type { Format } from '../types'

export const ac3: Format = {
  id: 'ac3',
  name: 'AC-3',
  category: 'audio',
  extensions: ['ac3', 'eac3', 'ec3'],
  mime: ['audio/ac3', 'audio/eac3', 'audio/vnd.dolby.dd-raw'],
  detect: ['ac3'],
  explain:
    'AC-3 and E-AC-3, also called Dolby Digital, are the sound of DVDs, Blu-rays and broadcast television, often in five or more channels. Converting it to WAV or FLAC keeps every channel.',
  lossy: 'always',
  traits: ['metadata'],
  readOnly: 'AC-3 can be read but not written: its encoders are covered by patents, so Omsett does not ship one',
}
