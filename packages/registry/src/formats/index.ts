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
import { xlsx } from './xlsx'
import { xls } from './xls'
import { ods } from './ods'
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
import { zip } from './zip'
import { tgz } from './tgz'
import { tar } from './tar'
import { fountain } from './fountain'
import { fdx } from './fdx'
import { drafter } from './drafter'
import { pdf } from './pdf'
import { docx } from './docx'
import { doc } from './doc'
import { pptx } from './pptx'
import { ppt } from './ppt'
import { odt } from './odt'
import { odp } from './odp'
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
import { psb } from './psb'
import { cur } from './cur'
import { icns } from './icns'
import { dds } from './dds'
import { fits } from './fits'
import { dcm } from './dcm'
import { dng } from './dng'
import { qoi } from './qoi'
import { svg } from './svg'
import { apng } from './apng'
import { tiff } from './tiff'
import { webp } from './webp'
import { wav } from './wav'
import { aiff } from './aiff'
import { au } from './au'
import { flac } from './flac'
import { epub } from './epub'
import { azw3 } from './azw3'
import { mobi } from './mobi'
import { mp3 } from './mp3'

/**
 * Order here is the order targets are offered in: the first few a file can become are shown
 * large, the rest in the list beneath. So this is a ranking, most generally useful first.
 */
export const formats: Format[] = [
  webp, jpeg, png, avif, gif, tiff, jxl, bmp, tga, qoi, pnm,
  heic, apng, svg, svgz, psd, psb, ico, icns, cur, jp2, exr, hdr, dds, fits, dcm, dng, pcx, sgi, ras,
  // Data. A picture never becomes one of these, nor the other way round.
  json, yaml, csv, xlsx, xml, toml, jsonl, tsv, vcf, ics, xls, ods,
  // Subtitles and lyrics: text with times.
  srt, vtt, ass, ssa, ttml, lrc, sbv, smi, microdvd,
  // Writing: text with structure.
  md, html, docx, pdf, pptx, doc, ppt, odt, odp,
  // Screenplays.
  fountain, fdx, drafter,
  // Fonts: the same tables in four wrappings.
  woff2, woff, ttf, otf,
  // Archives: files and folders, packed three ways.
  zip, tgz, tar,
  // Sound: MP3, which leaves some out to be small, and four formats that keep all of it.
  mp3, wav, flac, aiff, au,
  // E-books: the one everything opens, and the Kindle's two.
  epub, azw3, mobi,
]
