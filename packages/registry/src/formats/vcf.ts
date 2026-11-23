import type { Format } from '../types'

export const vcf: Format = {
  id: 'vcf',
  name: 'vCard',
  category: 'data',
  extensions: ['vcf', 'vcard'],
  mime: ['text/vcard'],
  detect: ['vcf'],
  explain:
    'A vCard file holds contacts: names, phone numbers, email addresses. Phones and address books export and import them, so it is how contacts move from one to another.',
  lossy: 'never',
  traits: [],
}
