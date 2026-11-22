import type { Format } from '../types'
import { jpeg } from './jpeg'
import { png } from './png'
import { webp } from './webp'

/** Order here is the order tiles appear in within a category. */
export const formats: Format[] = [webp, jpeg, png]
