import type { Format } from '@omsett/registry'

/** 'photo.final.png' + WebP → 'photo.final.webp' */
export function outputName(inputName: string, to: Format): string {
  const dot = inputName.lastIndexOf('.')
  const base = dot > 0 ? inputName.slice(0, dot) : inputName
  return `${base || 'converted'}.${to.extensions[0]}`
}

/** A 0–100 quality option, clamped, with a fallback. */
export function qualityOption(options: Record<string, unknown>, fallback = 80): number {
  const value = typeof options.quality === 'number' ? options.quality : fallback
  return Math.min(100, Math.max(1, Math.round(value)))
}

export function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException('Conversion cancelled', 'AbortError')
}
