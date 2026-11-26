import type { Format } from '../types'

export const pptx: Format = {
  id: 'pptx',
  name: 'PPTX',
  category: 'presentation',
  // Saved with macros (PPTM), as a slide show (PPSX, PPSM) or as a template (POTX, POTM): the
  // same package under another label, read as a PPTX. Macros never run.
  extensions: ['pptx', 'pptm', 'ppsx', 'ppsm', 'potx', 'potm'],
  mime: [
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-powerpoint.presentation.macroEnabled.12',
    'application/vnd.openxmlformats-officedocument.presentationml.slideshow',
    'application/vnd.ms-powerpoint.slideshow.macroEnabled.12',
    'application/vnd.openxmlformats-officedocument.presentationml.template',
    'application/vnd.ms-powerpoint.template.macroEnabled.12',
  ],
  detect: ['pptx', 'pptm', 'ppsx', 'ppsm', 'potx', 'potm'],
  explain:
    'PPTX is the PowerPoint presentation: a set of slides. PowerPoint, Keynote, Google Slides and LibreOffice all open and save it. One saved with macros (PPTM), as a slide show (PPSX, PPSM) or as a template (POTX, POTM) is read the same way; its macros are never run and never carried over.',
  lossy: 'never',
  traits: [],
  readOnly: 'PPTX can be read but not written yet',
}
