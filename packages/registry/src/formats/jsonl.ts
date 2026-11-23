import type { Format } from '../types'

export const jsonl: Format = {
  id: 'jsonl',
  name: 'JSON Lines',
  category: 'data',
  extensions: ['jsonl', 'ndjson'],
  mime: ['application/jsonl', 'application/x-ndjson'],
  detect: ['jsonl'],
  explain:
    'JSON Lines is a list of records with one JSON value on each line. Logs and large data exports use it because a program can read it one line at a time.',
  lossy: 'never',
  traits: ['nesting'],
}
