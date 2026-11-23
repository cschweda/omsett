import type { Format } from '../types'

export const pptx: Format = {
  id: 'pptx',
  name: 'PPTX',
  category: 'presentation',
  extensions: ['pptx'],
  mime: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  detect: ['pptx'],
  explain:
    'PPTX is the PowerPoint presentation: a set of slides. PowerPoint, Keynote, Google Slides and LibreOffice all open and save it.',
  lossy: 'never',
  traits: [],
  readOnly: 'PPTX can be read but not written yet',
}
