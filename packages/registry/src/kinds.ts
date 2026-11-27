import type { Category } from './types'

// Categories whose formats can turn into one another. A drawing can become a picture; a table
// cannot. Everything not listed here keeps to its own category.
// A spreadsheet is a table, and so is most data.
const KINDS: Category[][] = [
  ['image', 'vector'],
  ['data', 'spreadsheet'],
  // A document is writing, and so are Markdown and a web page; a presentation is writing on slides.
  // A book is writing too: it can be set out as a page, and a page can be cut into chapters.
  ['text', 'document', 'presentation', 'pdf', 'ebook'],
]

/** Whether a file in one category could ever become a format in the other. */
export function sameKind(a: Category, b: Category): boolean {
  return a === b || KINDS.some((kind) => kind.includes(a) && kind.includes(b))
}

/**
 * What can become something of another kind, one way only. A picture can be put on a page of
 * a PDF, and a PDF's pages can be drawn as pictures; a picture does not become a Word document
 * by way of a PDF, nor a PDF a drawing. A table can be set out as a page; a page does not become a table.
 */
const ALSO: Array<[from: Category, to: Category]> = [
  ['image', 'pdf'],
  ['vector', 'pdf'],
  // A page of a PDF can be drawn as a picture. The words become part of it.
  ['pdf', 'image'],
  // A table can be set out as a page to read, and so as a document or a PDF. Writing does not become a table.
  ['data', 'text'],
  ['data', 'document'],
  ['data', 'pdf'],
  ['spreadsheet', 'text'],
  ['spreadsheet', 'document'],
  ['spreadsheet', 'pdf'],
]

/** Whether a file in one category may be offered a format in the other, and routed to it. */
export function canBecome(from: Category, to: Category): boolean {
  return sameKind(from, to) || ALSO.some(([a, b]) => a === from && b === to)
}

/**
 * Formats are offered in one order for everyone (the order of `formats/index.ts`), with one
 * exception: for a book, the formats of books come first. A book can become a page or a PDF,
 * but what a person holding a Kindle book most often wants is the book every reader opens.
 */
const OWN_FIRST: Category[] = ['ebook']

export const ownFirst = (category: Category): boolean => OWN_FIRST.includes(category)

/** Categories whose files are text a person can read, and so can be shown as text. */
// A workbook and a Word document are not text, and are left out.
const READABLE: Category[] = ['data', 'subtitle', 'text', 'screenplay']

export const isReadable = (category: Category): boolean => READABLE.includes(category)
