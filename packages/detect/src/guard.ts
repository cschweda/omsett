import type { Dimensions } from './dimensions'

/** Files larger than this are never read in a browser. */
export const MAX_BYTES = 500 * 1024 * 1024
/** Largest estimated working set a browser tab should be asked to hold. */
export const MAX_WORKING_BYTES = 1.5 * 1024 * 1024 * 1024

export const TOO_LARGE = 'This image is too large to convert in a browser'

/** The most pixels any picture may have: the working-set limit, counted in pixels. */
export const MAX_PIXELS = Math.floor(MAX_WORKING_BYTES / 8)

export function pixelCount(dimensions: Dimensions | null): number {
  return dimensions ? dimensions.width * dimensions.height : 0
}

/** Decoded RGBA, doubled for working space. */
export function workingBytes(dimensions: Dimensions | null): number {
  return pixelCount(dimensions) * 4 * 2
}

/**
 * Decide from the byte size and the header's declared dimensions whether a file may be decoded.
 * A small file can declare an enormous image, so byte size alone protects nothing.
 */
export function sizeProblem(bytes: number, dimensions: Dimensions | null): string | null {
  if (bytes > MAX_BYTES) return TOO_LARGE
  if (workingBytes(dimensions) > MAX_WORKING_BYTES) return TOO_LARGE
  return null
}
