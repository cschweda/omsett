import { tga } from './tga'
import { pnm } from './pnm'
import { pcx } from './pcx'
import { sgi } from './sgi'
import { ras } from './ras'
import { hdr } from './hdr'
import { exr } from './exr'
import { svgz } from './svgz'
import type { Format } from '../types'
import { avif } from './avif'
import { bmp } from './bmp'
import { gif } from './gif'
import { heic } from './heic'
import { ico } from './ico'
import { jp2 } from './jp2'
import { jpeg } from './jpeg'
import { jxl } from './jxl'
import { png } from './png'
import { psd } from './psd'
import { qoi } from './qoi'
import { svg } from './svg'
import { tiff } from './tiff'
import { webp } from './webp'

/**
 * Order here is the order targets are offered in: the first few a file can become are shown
 * large, the rest in the list beneath. So this is a ranking, most generally useful first.
 */
export const formats: Format[] = [
  webp, jpeg, png, avif, gif, tiff, jxl, bmp, tga, qoi, pnm,
  heic, svg, svgz, psd, ico, jp2, exr, hdr, pcx, sgi, ras,
]
