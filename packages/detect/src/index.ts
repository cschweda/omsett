import type { Format } from '@omsett/registry'
import { fileTypeFromBuffer } from 'file-type'
import { HEADER_BYTES, readDimensions, type Dimensions } from './dimensions'

export { readDimensions, type Dimensions } from './dimensions'
export { MAX_BYTES, MAX_WORKING_BYTES, TOO_LARGE, pixelCount, sizeProblem, workingBytes } from './guard'

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
    const found = await fileTypeFromBuffer(head)
    if (!found) return { kind: 'unknown' }
    const format = formats.find((f) => f.detect.includes(found.ext))
    if (!format) return { kind: 'unregistered', ext: found.ext, mime: found.mime }
    return {
      kind: 'known',
      format,
      ext: found.ext,
      mime: found.mime,
      dimensions: readDimensions(found.ext, head),
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
