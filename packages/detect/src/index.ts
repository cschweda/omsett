import type { Format } from '@omsett/registry'
import { fileTypeFromBuffer } from 'file-type'
import { HEADER_BYTES, readDimensions, type Dimensions } from './dimensions'
import { gunzip } from './gzip'
import { sniff } from './signatures'
import { svgDimensions, svgRoot } from './svg'
import { isTarHeader } from './tar'
import { sniffText } from './text'

export { readDimensions, type Dimensions } from './dimensions'
export { MAX_BYTES, MAX_PIXELS, MAX_WORKING_BYTES, TOO_LARGE, pixelCount, sizeProblem, workingBytes } from './guard'
export { structureProblem } from './structure'
export { crc32 } from './png-structure'
export { gunzip } from './gzip'
export { isTarHeader } from './tar'

const DRAFTER = 'application/vnd.drafter.package+zip'
/** Whether a ZIP's first entry is `mimetype`, stored, holding the Drafter media type. */
function isDrafter(head: Uint8Array): boolean {
  const expected = `mimetype${DRAFTER}`
  if (head.length < 30 + expected.length || head[8] !== 0 || head[26] !== 8 || head[28] !== 0) return false
  for (let i = 0; i < expected.length; i++) if (head[30 + i] !== expected.codePointAt(i)) return false
  return true
}

export type Detection =
  | { kind: 'known'; format: Format; ext: string; mime: string; dimensions: Dimensions | null }
  | { kind: 'unregistered'; ext: string; mime: string }
  | { kind: 'unknown' }

/**
 * Identify a file by its contents and read its dimensions from the header. The name is used for
 * one thing only: to tell apart the plain-text data formats (YAML, TOML, CSV, TSV) whose
 * contents cannot say which they are. Never throws: anything unreadable is `unknown`.
 */
export async function detect(blob: Blob, formats: Format[], name?: string): Promise<Detection> {
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
    // And one that opens into a TAR is a TAR.GZ.
    if (found?.ext === 'gz') {
      const opened = (await gunzip(blob.slice(0, HEADER_BYTES), 64 * 1024)).bytes
      const inner = svgRoot(opened)
      if (inner) {
        found = { ext: 'svgz', mime: 'image/svg+xml' }
        dimensions = svgDimensions(inner)
      } else if (isTarHeader(opened)) {
        found = { ext: 'tgz', mime: 'application/gzip' }
        dimensions = null
      }
    }
    // A Drafter package is a ZIP that says what it is in its first entry, as an EPUB does:
    // a file called "mimetype", stored as it is, holding the package's media type.
    if (found?.ext === 'zip' && isDrafter(head)) found = { ext: 'drafter', mime: DRAFTER }
    // The library says "tar.gz" for some of these by itself.
    if (found?.ext === 'tar.gz') found = { ext: 'tgz', mime: 'application/gzip' }
    // Plain text has no signature at all. What it holds is worked out from how it reads.
    // The library takes anything that opens with BEGIN:VCARD or BEGIN:VCALENDAR for one, text or
    // not, UTF-8 or not, and whatever follows on that line. Omsett's own reading of the text
    // decides those.
    if (found?.ext === 'vcf' || found?.ext === 'ics') found = undefined
    // The library calls anything that opens with an XML declaration "XML", which is as far as
    // it looks; some of those are subtitles.
    if (!found || found.ext === 'xml') {
      const text = sniffText(head, blob.size <= HEADER_BYTES, name)
      if (text) {
        found = text
        dimensions = null
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
