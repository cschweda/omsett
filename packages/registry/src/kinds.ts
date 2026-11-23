import type { Category } from './types'

// Categories whose formats can turn into one another. A drawing can become a picture; a table
// cannot. Everything not listed here keeps to its own category.
const KINDS: Category[][] = [['image', 'vector']]

/** Whether a file in one category could ever become a format in the other. */
export function sameKind(a: Category, b: Category): boolean {
  return a === b || KINDS.some((kind) => kind.includes(a) && kind.includes(b))
}

/** Categories whose files are text a person can read, and so can be shown as text. */
const READABLE: Category[] = ['data', 'subtitle']

export const isReadable = (category: Category): boolean => READABLE.includes(category)
