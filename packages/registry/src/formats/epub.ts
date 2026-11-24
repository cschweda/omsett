import type { Format } from '../types'

export const epub: Format = {
  id: 'epub',
  name: 'EPUB',
  category: 'ebook',
  extensions: ['epub'],
  mime: ['application/epub+zip'],
  detect: ['epub'],
  explain:
    'EPUB is the e-book that nearly every reader opens: Apple Books, Kobo, Nook, phones and computers. The pages reshape themselves to fit the screen. A Kindle is the exception, and takes its own formats.',
  lossy: 'never',
  traits: [],
}
