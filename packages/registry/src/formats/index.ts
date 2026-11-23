import { tga } from './tga'
import { pnm } from './pnm'
import { pcx } from './pcx'
import { sgi } from './sgi'
import { ras } from './ras'
import { hdr } from './hdr'
import { exr } from './exr'
import { svgz } from './svgz'
import type { Format } from '../types'
import { json } from './json'
import { yaml } from './yaml'
import { csv } from './csv'
import { xml } from './xml'
import { toml } from './toml'
import { jsonl } from './jsonl'
import { tsv } from './tsv'
import { vcf } from './vcf'
import { ics } from './ics'
import { srt } from './srt'
import { vtt } from './vtt'
import { ass } from './ass'
import { ssa } from './ssa'
import { sbv } from './sbv'
import { lrc } from './lrc'
import { ttml } from './ttml'
import { smi } from './smi'
import { microdvd } from './microdvd'
import { woff2 } from './woff2'
import { woff } from './woff'
import { ttf } from './ttf'
import { otf } from './otf'
import { md } from './md'
import { html } from './html'
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
  // Data. A picture never becomes one of these, nor the other way round.
  json, yaml, csv, xml, toml, jsonl, tsv, vcf, ics,
  // Subtitles and lyrics: text with times.
  srt, vtt, ass, ssa, ttml, lrc, sbv, smi, microdvd,
  // Writing: text with structure.
  md, html,
  // Fonts: the same tables in four wrappings.
  woff2, woff, ttf, otf,
]
