import type { Format } from '../types'
import { avif } from './avif'
import { gif } from './gif'
import { heic } from './heic'
import { jpeg } from './jpeg'
import { jxl } from './jxl'
import { png } from './png'
import { tiff } from './tiff'
import { webp } from './webp'

/**
 * Order here is the order targets are offered in: the first few a file can become are shown
 * large, the rest in the list beneath. So this is a ranking, most generally useful first.
 */
export const formats: Format[] = [webp, jpeg, png, avif, gif, tiff, jxl, heic]
