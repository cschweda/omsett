import type { Format } from '../types'
import { gif } from './gif'
import { jpeg } from './jpeg'
import { png } from './png'
import { tiff } from './tiff'
import { webp } from './webp'

/**
 * Order here is the order targets are offered in: the first few a file can become are shown
 * large, the rest in the list beneath. So this is a ranking, most generally useful first.
 */
export const formats: Format[] = [webp, jpeg, png, gif, tiff]
