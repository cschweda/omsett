// What a converted file is called. By itself, the name it had with its new ending:
// "report.docx" becomes "report.html". A person may ask for words before the name, after it, or
// both ("converted-report.html", "report-final.html"), in Settings. The words are theirs and
// are kept on their device.

/** Where the choice is kept on the visitor's device. */
export const NAMING_SETTING = 'omsett:file-names'
/** The most characters of each. A name has to fit in a file system. */
export const MAX_AFFIX = 40

export interface Naming {
  prefix: string
  suffix: string
}
export const NO_NAMING: Naming = { prefix: '', suffix: '' }

/** Characters a file name cannot hold: folders and what a file system refuses. */
const REFUSED = new Set([...'\\/<>:"|?*'].map((char) => char.codePointAt(0)!))
/** Whether a character has no place in a name: one of those, a control code, or an invisible mark. */
const unfit = (code: number) =>
  REFUSED.has(code) ||
  code < 0x20 ||
  code === 0x7F ||
  code === 0x061C ||
  (code >= 0x200B && code <= 0x200F) ||
  (code >= 0x202A && code <= 0x202E) ||
  (code >= 0x2066 && code <= 0x2069)

/**
 * Words made fit to be part of a file's name: no folders, no characters a file system refuses,
 * nothing invisible, and not too long. What is left may be nothing.
 */
export function cleanAffix(text: string): string {
  const kept = [...text.normalize('NFC')]
    .filter((char) => !unfit(char.codePointAt(0)!))
    .slice(0, MAX_AFFIX)
    .join('')
  // A name may not begin with a dot (it would be hidden) or lead out of its folder.
  return kept.replace(/^\.+/, '')
}

/** What was stored, read back as a choice. Anything that is not one is no choice. */
export function readNaming(stored: string | null): Naming {
  try {
    const value = JSON.parse(stored ?? 'null') as { prefix?: unknown; suffix?: unknown } | null
    return {
      prefix: typeof value?.prefix === 'string' ? cleanAffix(value.prefix) : '',
      suffix: typeof value?.suffix === 'string' ? cleanAffix(value.suffix) : '',
    }
  } catch {
    return { ...NO_NAMING }
  }
}

/** A converted file's name with the person's words before it and after it, ahead of the ending. */
export function namedAs(name: string, naming: Naming): string {
  const prefix = cleanAffix(naming.prefix)
  const suffix = cleanAffix(naming.suffix)
  if (prefix === '' && suffix === '') return name
  // "notes.tar.gz" is "notes" with one ending, not "notes.tar" with another.
  const compound = /\.tar\.(?:gz|bz2|xz|zst)$/i.exec(name)
  const dot = compound ? compound.index : name.lastIndexOf('.')
  const [base, ending] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, '']
  return `${prefix}${base}${suffix.replace(/[. ]+$/, '')}${ending}`
}
