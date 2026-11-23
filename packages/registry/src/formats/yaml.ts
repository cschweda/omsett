import type { Format } from '../types'

export const yaml: Format = {
  id: 'yaml',
  name: 'YAML',
  category: 'data',
  extensions: ['yaml', 'yml'],
  mime: ['application/yaml', 'text/yaml'],
  detect: ['yaml'],
  explain:
    'YAML holds the same kind of data as JSON, laid out with indentation instead of brackets so that people can read and edit it. Settings files for servers and developer tools are often YAML.',
  lossy: 'never',
  traits: ['nesting', 'comments'],
}
