import type { Format } from '../types'

export const ppt: Format = {
  id: 'ppt',
  name: 'PPT',
  category: 'presentation',
  extensions: ['ppt', 'pps', 'pot'],
  mime: ['application/vnd.ms-powerpoint'],
  detect: ['ppt'],
  explain:
    'PPT is the PowerPoint presentation as it was until 2007. PowerPoint still opens it, but many newer programs and websites will not. Converting it to a web page, a Word document, Markdown or a PDF makes what the slides say usable everywhere.',
  lossy: 'never',
  traits: [],
  readOnly: 'PPT can be read but not written: it is an old format, and PPTX has taken its place',
}
