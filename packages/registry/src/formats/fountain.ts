import type { Format } from '../types'

export const fountain: Format = {
  id: 'fountain',
  name: 'Fountain',
  category: 'screenplay',
  extensions: ['fountain', 'spmd'],
  mime: ['text/x-fountain'],
  detect: ['fountain'],
  explain:
    "Fountain is a screenplay written as plain text. A scene heading, a character's name and a line of dialogue are each told from how they are typed, so a script can be written in any editor and read by any person.",
  lossy: 'never',
  traits: [],
}
