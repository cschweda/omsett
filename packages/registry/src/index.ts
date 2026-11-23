import { capabilities } from './capabilities'
import { formats } from './formats'
import { overrides } from './overrides'
import { traitWarnings } from './trait-warnings'
import { applySwitches, switches } from './switches'
import type { Format, Registry } from './types'

export * from './types'
export { createRouter, MAX_HOPS } from './router'
export { deriveEdges } from './derive'
export { isReadable, sameKind } from './kinds'
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

/** Every engine id named by a capability. */
export function engineIds(reg: Registry): string[] {
  return [...new Set(reg.capabilities.map((c) => c.engine))]
}
