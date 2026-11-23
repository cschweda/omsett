import type { Format } from '../types'

export const woff: Format = {
  id: 'woff',
  name: 'WOFF',
  category: 'font',
  extensions: ['woff'],
  mime: ['font/woff'],
  detect: ['woff'],
  explain:
    'WOFF is a font packed smaller for use on a website. Every browser reads it. It is not for installing on a computer.',
  lossy: 'never',
  traits: [],
}
