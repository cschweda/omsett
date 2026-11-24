// What a converted file is called: the name it had, "-converted", and its new ending, so that
// "report.docx" becomes "report-converted.html" and is never mistaken for the file it was made
// from (a JPEG made smaller is still a JPEG, and would otherwise have the very same name). A
// person may ask for other words before the name, after it, or both, or for none, in Settings.
// The words are theirs and are kept on their device.

/** Where the choice is kept on the visitor's device. */
export const NAMING_SETTING = 'omsett:file-names'
/** The most characters of each. A name has to fit in a file system. */
export const MAX_AFFIX = 40

export interface Naming {
  prefix: string
  suffix: string
}
export const NO_NAMING: Naming = { prefix: '', suffix: '' }
/** What a converted file is called until a person says otherwise. */
export const DEFAULT_NAMING: Naming = { prefix: '', suffix: '-converted' }

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

/**
 * What was stored, read back as a choice. Nothing stored, or anything that is not a choice, is
 * the default. A choice of no words at all is a choice, and is stored as one.
 */
export function readNaming(stored: string | null): Naming {
  try {
    const value = JSON.parse(stored ?? 'null') as { prefix?: unknown; suffix?: unknown } | null
    if (value === null || typeof value !== 'object' || Array.isArray(value) || !(Object.hasOwn(value, 'prefix') || Object.hasOwn(value, 'suffix'))) return { ...DEFAULT_NAMING }
    return {
      prefix: typeof value?.prefix === 'string' ? cleanAffix(value.prefix) : '',
      suffix: typeof value?.suffix === 'string' ? cleanAffix(value.suffix) : '',
    }
  } catch {
    return { ...DEFAULT_NAMING }
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
