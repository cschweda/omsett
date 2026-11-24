import type { Format } from '../types'

export const drafter: Format = {
  id: 'drafter',
  name: 'Drafter',
  category: 'screenplay',
  extensions: ['drafter'],
  mime: ['application/vnd.drafter.package+zip'],
  detect: ['drafter'],
  explain:
    "Drafter is the screenplay format of drafter.dev, a writing app by the author of Omsett. One file holds a whole writing project: the script as plain Fountain, with its drafts and notes beside it. It is built on Fountain, goes to and from Final Draft (FDX), is open, and unzips to ordinary files.",
  lossy: 'never',
  traits: [],
}
