import type { Format } from '@omsett/registry'
import { fileTypeFromBuffer } from 'file-type'
import { HEADER_BYTES, readDimensions, type Dimensions } from './dimensions'
import { gunzip } from './gzip'
import { sniff } from './signatures'
import { svgDimensions, svgRoot } from './svg'

export { readDimensions, type Dimensions } from './dimensions'
export { MAX_BYTES, MAX_PIXELS, MAX_WORKING_BYTES, TOO_LARGE, pixelCount, sizeProblem, workingBytes } from './guard'
export { structureProblem } from './structure'
export { crc32 } from './png-structure'
export { gunzip } from './gzip'

export type Detection =
  | { kind: 'known'; format: Format; ext: string; mime: string; dimensions: Dimensions | null }
  | { kind: 'unregistered'; ext: string; mime: string }
  | { kind: 'unknown' }

/**
 * Identify a file by its magic bytes, never by its name, and read its dimensions from the header.
 * Never throws: anything unreadable is `unknown`.
 */
export async function detect(blob: Blob, formats: Format[]): Promise<Detection> {
  try {
    const head = new Uint8Array(await blob.slice(0, HEADER_BYTES).arrayBuffer())
    let found: { ext: string; mime: string } | undefined = await fileTypeFromBuffer(head)
    // SVG is text and has no magic bytes: the most the library can say is "XML", or nothing.
    const root = !found || found.ext === 'xml' ? svgRoot(head) : null
    if (root) found = { ext: 'svg', mime: 'image/svg+xml' }
    let dimensions: Dimensions | null | undefined
    // Formats the library does not know, each by its own signature.
    // A TGA begins with the same bytes as an icon or cursor. An icon file says how many pictures
    // it holds, and that is never none; where it says none, the file is not an icon.
    const emptyIcon = (found?.ext === 'ico' || found?.ext === 'cur') && head[4] === 0 && head[5] === 0
    if (emptyIcon) found = undefined
    const sniffed = found ? null : sniff(head)
    if (sniffed) {
      found = sniffed
      dimensions = sniffed.dimensions
    }
    // A gzip file that opens into an SVG is an SVGZ. Only its first kilobytes are inflated.
    if (found?.ext === 'gz') {
      const inner = svgRoot((await gunzip(blob.slice(0, HEADER_BYTES), 64 * 1024)).bytes)
      if (inner) {
        found = { ext: 'svgz', mime: 'image/svg+xml' }
        dimensions = svgDimensions(inner)
      }
    }
    if (!found) return { kind: 'unknown' }
    const format = formats.find((f) => f.detect.includes(found.ext))
    if (!format) return { kind: 'unregistered', ext: found.ext, mime: found.mime }
    return {
      kind: 'known',
      format,
      ext: found.ext,
      mime: found.mime,
      dimensions: dimensions !== undefined ? dimensions : root ? svgDimensions(root) : readDimensions(found.ext, head),
    }
  } catch {
    return { kind: 'unknown' }
  }
}

/** True when the file's name claims a different format than its contents. */
export function nameDisagrees(fileName: string, format: Format): boolean {
  const dot = fileName.lastIndexOf('.')
  if (dot < 0) return false
  return !format.extensions.includes(fileName.slice(dot + 1).toLowerCase())
}
