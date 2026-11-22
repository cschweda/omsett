import { capabilities } from './capabilities'
import { formats } from './formats'
import { overrides } from './overrides'
import { traitWarnings } from './trait-warnings'
import type { Format, Registry } from './types'

export * from './types'
export { createRouter, MAX_HOPS } from './router'
export { deriveEdges } from './derive'
export { lossyToLossy, traitWarnings } from './trait-warnings'

/** The real registry: every format and capability Omsett ships. */
export const registry: Registry = { formats, capabilities, overrides, traitWarnings }

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
