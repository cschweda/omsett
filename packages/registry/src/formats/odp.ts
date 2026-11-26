import type { Format } from '../types'

export const odp: Format = {
  id: 'odp',
  name: 'ODP',
  category: 'presentation',
  extensions: ['odp', 'otp'],
  mime: ['application/vnd.oasis.opendocument.presentation', 'application/vnd.oasis.opendocument.presentation-template'],
  detect: ['odp', 'otp'],
  explain:
    'ODP is the OpenDocument presentation: what LibreOffice Impress saves. Converting it to a web page, a Word document, Markdown or a PDF makes what the slides say usable everywhere.',
  lossy: 'never',
  traits: [],
  readOnly: 'ODP can be read but not written yet',
}
