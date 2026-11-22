import type { Format } from '@omsett/registry'

/** Longest base name an output is given, in characters. */
const MAX_BASE = 120

// Characters that have no business in a file name: control codes, and the invisible marks that
// change the direction text is displayed in (used to make "gnp.exe" read as "exe.png").
// eslint-disable-next-line no-control-regex -- control characters are exactly what this removes
const UNSAFE = /[\u0000-\u001F\u007F\u200E\u200F\u202A-\u202E\u2066-\u2069]/g

/**
 * The base of a name a stranger supplied, made safe to offer back as a download: no folders,
 * no control or direction-changing characters, no leading dots, and not absurdly long.
 */
export function safeBaseName(inputName: string): string {
  const leaf = inputName.split(/[\\/]/).pop() ?? ''
  const dot = leaf.lastIndexOf('.')
  const base = (dot > 0 ? leaf.slice(0, dot) : leaf)
    .replace(/\s+/g, ' ') // line breaks and tabs become spaces before control codes are dropped
    .replace(UNSAFE, '')
    .replace(/[<>:"|?*]/g, '_')
    .replace(/^[.\s]+/, '')
    .trim()
  return [...base].slice(0, MAX_BASE).join('').trim() || 'converted'
}

/** 'photo.final.png' + WebP → 'photo.final.webp' */
export function outputName(inputName: string, to: Format): string {
  return `${safeBaseName(inputName)}.${to.extensions[0]}`
}

/** A 0–100 quality option, clamped, with a fallback. */
export function qualityOption(options: Record<string, unknown>, fallback = 80): number {
  const value = typeof options.quality === 'number' ? options.quality : fallback
  return Math.min(100, Math.max(1, Math.round(value)))
}

export function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException('Conversion cancelled', 'AbortError')
}
