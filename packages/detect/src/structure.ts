import type { Format } from '@omsett/registry'
import { MAX_PIXELS } from './guard'
import { pngStructureProblem } from './png-structure'

type Checker = (blob: Blob, maxPixels: number) => Promise<string | null>

/** Keyed by `file-type` ext value, like the dimension readers. */
const checkers: Record<string, Checker> = { png: pngStructureProblem, apng: pngStructureProblem }

/** Whether the app can vouch for this format's files itself, without trusting a decoder. */
export function canVerifyStructure(format: Format): boolean {
  return format.detect.some((ext) => ext in checkers)
}

/**
 * Why a file is not structurally sound, or null if it is. A format the app has no checker for
 * returns "unverified": the caller must not treat that as sound.
 */
export async function structureProblem(format: Format, blob: Blob): Promise<string | null> {
  const checker = format.detect.map((ext) => checkers[ext]).find(Boolean)
  if (!checker) return 'unverified'
  return checker(blob, MAX_PIXELS)
}
