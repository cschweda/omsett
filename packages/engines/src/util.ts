import type { Format } from '@omsett/registry'

/** Longest base name an output is given, in characters. */
const MAX_BASE = 120

// Characters that have no business in a file name: control codes, and the invisible marks that
// change the direction text is displayed in (used to make "gnp.exe" read as "exe.png").
// eslint-disable-next-line no-control-regex -- control characters are exactly what this removes
export const UNSAFE = /[\u0000-\u001F\u007F\u200E\u200F\u202A-\u202E\u2066-\u2069]/g

/**
 * The base of a name a stranger supplied, made safe to offer back as a download: no folders,
 * no control or direction-changing characters, no leading dots, and not absurdly long.
 */
export function safeBaseName(inputName: string): string {
  const leaf = inputName.split(/[\\/]/).pop() ?? ''
  // "notes.tar.gz" is "notes" with one ending, not "notes.tar" with another.
  const compound = /\.tar\.(?:gz|bz2|xz|zst)$/i.exec(leaf)
  const dot = compound ? compound.index : leaf.lastIndexOf('.')
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

/**
 * A failure whose message is written for the person who dropped the file and may be shown to
 * them as it is. It keeps its name across the worker boundary, which is how the page knows.
 */
export class Refusal extends Error {
  override name = 'Refusal'
}
