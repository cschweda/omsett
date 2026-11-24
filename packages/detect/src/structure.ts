import type { Format } from '@omsett/registry'
import { dicomPicture, dicomProblem } from './dicom'
import { MAX_PIXELS } from './guard'
import { photoshopProblem } from './photoshop'
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

/**
 * Checks of a file's own arithmetic, for formats a decoder is known to read too kindly. Unlike
 * a structure check this vouches for nothing: it only refuses what plainly does not add up,
 * before a decoder is asked. Keyed by `file-type` ext value.
 */
const layouts: Record<string, (bytes: Uint8Array) => string | null> = { psd: photoshopProblem, psb: photoshopProblem, dcm: dicomProblem }

/** Why a file's parts do not fit inside it, or null where they do or nothing here can say. */
export function layoutProblem(format: Format, bytes: Uint8Array): string | null {
  return format.detect.map((ext) => layouts[ext]).find(Boolean)?.(bytes) ?? null
}

/**
 * Formats that carry a great deal beside their picture, and what of such a file a decoder
 * needs. Keyed by `file-type` ext value.
 */
const pictures: Record<string, (bytes: Uint8Array) => Uint8Array | null> = { dcm: dicomPicture }

/**
 * The file with everything but its picture left out, for a format whose files hold much else;
 * the file as it is for every other. A decoder is shown no more than it needs.
 */
export function pictureOnly(format: Format, bytes: Uint8Array): Uint8Array {
  return format.detect.map((ext) => pictures[ext]).find(Boolean)?.(bytes) ?? bytes
}
