import type { Format } from '@omsett/registry'

/** Longest base name an output is given, in characters. */
const MAX_BASE = 120

// Characters that have no business in a file name: control codes, and the invisible marks that
// change the direction text is displayed in (used to make "gnp.exe" read as "exe.png").
// eslint-disable-next-line no-control-regex -- control characters are exactly what this removes
export const UNSAFE = /[\u0000-\u001F\u007F\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/g

/**
 * Whether Windows keeps this name for a device. It does so whatever ending follows the name
 * and whatever spaces come before the ending: "NUL.txt", "com1.log" and "aux .h" are all the
 * device, cannot be made as files there, and writing to one writes to the device.
 */
export function isDeviceName(name: string): boolean {
  const stem = name.split('.')[0]!.replace(/ +$/, '')
  return /^(?:con|prn|aux|nul|conin\$|conout\$|clock\$|com[0-9\u00B9\u00B2\u00B3]|lpt[0-9\u00B9\u00B2\u00B3])$/i.test(stem)
}

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
  const kept = [...base].slice(0, MAX_BASE).join('').trim() || 'converted'
  return isDeviceName(kept) ? `_${kept}` : kept
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

/**
 * The most tags one XML part of a file may hold. A parser builds something for every tag, and
 * what it builds is hundreds of times the size of "<row/>": ten million empty tags are 60 MB
 * of text, 88 KB once squeezed into an office file, and three gigabytes once read. So tags are
 * counted in the text, before any of it is parsed.
 */
export const MAX_TAGS = 1_500_000

/** Whether a piece of XML holds no more tags than `most`. One pass, and it stops at the limit. */
export function withinTags(source: string, most = MAX_TAGS): boolean {
  let count = 0
  for (let at = source.indexOf('<'); at >= 0; at = source.indexOf('<', at + 1)) if (++count > most) return false
  return true
}

/**
 * The most cells a table may be written with. A table is as wide as every column any of its
 * rows has, all the way down: eight thousand rows that each name a column of their own are
 * sixty-four million cells, from a file of 95 KB.
 */
export const MAX_TABLE_CELLS = 5_000_000
export const tableTooLarge = () => new Refusal('This would make a table too large to convert in a browser: every row would be given every column')

/** A row's own value for a column, and never one that every object is born with ("constructor"). */
export const cellOf = (row: Record<string, unknown>, column: string): unknown => (Object.hasOwn(row, column) ? row[column] : undefined)

/**
 * A lookup table that holds only what is put in it. An ordinary object also answers to
 * "constructor" and "__proto__", and a file can ask for those by name.
 */
export const lookup = <T>(entries: Record<string, T>): Record<string, T> => Object.assign(Object.create(null) as Record<string, T>, entries)

/** Text with everything from each "(" to the next ")" taken out. One pass, whatever the text. */
export function withoutBrackets(text: string): string {
  let out = ''
  let from = 0
  for (;;) {
    const open = text.indexOf('(', from)
    const close = open < 0 ? -1 : text.indexOf(')', open + 1)
    if (close < 0) return out + text.slice(from)
    out += text.slice(from, open)
    from = close + 1
  }
}
