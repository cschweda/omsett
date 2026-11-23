import type { Format } from '../types'

export const json: Format = {
  id: 'json',
  name: 'JSON',
  category: 'data',
  extensions: ['json'],
  mime: ['application/json'],
  detect: ['json'],
  explain:
    'JSON holds structured data as nested lists and named values. It is what most websites and programs use to pass data to each other, and almost every programming language reads it.',
  lossy: 'never',
  traits: ['nesting'],
}
