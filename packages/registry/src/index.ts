import { capabilities } from './capabilities'
import { formats } from './formats'
import { overrides } from './overrides'
import { traitWarnings } from './trait-warnings'
import { applySwitches, switches } from './switches'
import type { Format, Registry } from './types'

export * from './types'
export { createRouter, MAX_HOPS } from './router'
export { deriveEdges } from './derive'
export { canBecome, isReadable, sameKind } from './kinds'
export { lossyToLossy, traitWarnings } from './trait-warnings'

export { applySwitches, switches, type Switch } from './switches'

/** Everything Omsett can ship, before any off switch is applied. */
export const everything: Registry = { formats, capabilities, overrides, traitWarnings }

/** The real registry: every format and capability Omsett offers, with off switches applied. */
export const registry: Registry = applySwitches(everything, switches)

/** Why a detected file is not handled, if its format is switched off; otherwise undefined. */
export function switchedOffReason(ext: string): string | undefined {
  const format = everything.formats.find((f) => f.detect.includes(ext))
  const entry = format && switches[format.id]
  return entry && !entry.on ? entry.whenOff : undefined
}

export function formatById(reg: Registry, id: string): Format | undefined {
  return reg.formats.find((f) => f.id === id)
}

/** The registered format a `file-type` ext value resolves to, if any. */
export function formatForDetected(reg: Registry, ext: string): Format | undefined {
  return reg.formats.find((f) => f.detect.includes(ext))
}

/** Value for <input type="file" accept>: every registered MIME type and extension. */
export function acceptAttribute(reg: Registry): string {
  const parts = new Set<string>()
  for (const format of reg.formats) {
    for (const mime of format.mime) parts.add(mime)
    for (const ext of format.extensions) parts.add(`.${ext}`)
  }
  return [...parts].join(',')
}

/**
 * Why a picture of this size cannot be written as this format, or null if it can.
 * Some encoders quietly shrink or crop an oversized picture instead of failing; asking here
 * first means the user is told, not handed a different picture.
 */
export function dimensionProblem(to: Format, width: number, height: number): string | null {
  if (to.maxDimension === undefined) return null
  if (width <= to.maxDimension && height <= to.maxDimension) return null
  return `Too large for ${to.name}, which holds ${to.maxDimension} pixels a side at most`
}

/** The smallest size an icon is written at from a larger picture, and the largest any icon holds. */
const ICON_SIDES = { least: 16, most: 1024 }

/**
 * The sizes an icon is to be written at, where a conversion's options ask for an icon: largest
 * first. Null for every conversion that does not.
 */
export function iconSizes(options: Record<string, unknown>): number[] | null {
  const sizes = options.iconSizes
  if (!Array.isArray(sizes)) return null
  const whole = sizes.filter((size): size is number => Number.isInteger(size) && size >= ICON_SIDES.least && size <= ICON_SIDES.most)
  return whole.length ? [...new Set(whole)].sort((a, b) => b - a) : null
}

/**
 * The sizes one picture is held at as an icon, largest first.
 *
 * Where the format takes any size: the picture's own longest side, or the largest size asked
 * for if that is smaller, and each size asked for below that. A picture is never made larger,
 * and one too small for the smallest size is kept as it is.
 *
 * Where the format holds only the sizes it names (`iconExact`): each of them the picture is at
 * least as large as. A picture smaller than all of them is made the smallest, there being
 * nowhere else to put it.
 */
export function iconSidesFor(sizes: number[], width: number, height: number, exact = false): number[] {
  const longest = Math.max(width, height)
  if (exact) {
    const fits = sizes.filter((size) => size <= longest)
    return fits.length ? fits : [sizes.at(-1)!]
  }
  const side = Math.min(longest, sizes[0]!)
  return side < ICON_SIDES.least ? [side] : [side, ...sizes.filter((size) => size < side)]
}

/**
 * The size a picture comes out at. Every conversion keeps the size it was given but two: one
 * that makes an icon, which is square and no larger than that icon can be, and one that sets
 * the picture on a page, which is no longer a picture with a size.
 */
export function writtenSize(options: Record<string, unknown>, size: { width: number; height: number } | null): { width: number; height: number } | null {
  // A picture set on a page of a PDF is a document, and a document states no size.
  if (options.onPage === true) return null
  const sizes = iconSizes(options)
  if (!size || !sizes) return size
  const side = iconSidesFor(sizes, size.width, size.height, options.iconExact === true)[0]!
  return { width: side, height: side }
}

/** Every engine id named by a capability. */
export function engineIds(reg: Registry): string[] {
  return [...new Set(reg.capabilities.map((c) => c.engine))]
}
