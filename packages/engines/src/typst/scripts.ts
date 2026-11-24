// The typefaces a PDF falls back on for the scripts Omsett's own typeface does not draw. Each
// is one of Google's Noto faces, from @fontsource, which cuts it into pieces by the letters a
// piece draws: a hundred or so for Chinese, three for Thai. A document is given only the pieces
// that draw letters it has, so a page of Japanese fetches a few hundred kilobytes, not the
// ten megabytes the whole face weighs.

export interface Script {
  /** The package the face comes in: '@fontsource/noto-sans-jp'. */
  pack: string
  /** The name the face gives itself, which is how Typst is told to use it. */
  family: string
  /** The start of each file's name. */
  stem: string
}

const face = (id: string, family: string): Script => ({ pack: `@fontsource/noto-sans-${id}`, family, stem: `noto-sans-${id}` })
export const SCRIPTS = {
  sc: face('sc', 'Noto Sans SC'),
  tc: face('tc', 'Noto Sans TC'),
  jp: face('jp', 'Noto Sans JP'),
  kr: face('kr', 'Noto Sans KR'),
  arabic: face('arabic', 'Noto Sans Arabic'),
  hebrew: face('hebrew', 'Noto Sans Hebrew'),
  devanagari: face('devanagari', 'Noto Sans Devanagari'),
  thai: face('thai', 'Noto Sans Thai'),
} satisfies Record<string, Script>
export type ScriptId = keyof typeof SCRIPTS

/** Pieces that draw what Omsett's own typeface already draws. They are never fetched. */
const DRAWN_ALREADY = new Set(['latin', 'latin-ext', 'cyrillic', 'cyrillic-ext', 'greek', 'greek-ext', 'vietnamese', 'math', 'symbols'])
/** The most pieces one document is given. A book in Chinese uses most of a face: about a hundred. */
export const MAX_PIECES = 320

/**
 * Chinese, Japanese and Korean share thousands of characters and draw many of them a little
 * differently. Which face comes first is settled by the language the document says it is in.
 */
export function order(language: string): ScriptId[] {
  const tag = language.toLowerCase()
  const han: ScriptId[] = tag.startsWith('ja') ? ['jp', 'sc', 'tc', 'kr'] : tag.startsWith('ko') ? ['kr', 'sc', 'tc', 'jp'] : /^zh-(?:tw|hk|mo|hant)/.test(tag) ? ['tc', 'sc', 'jp', 'kr'] : ['sc', 'tc', 'jp', 'kr']
  return [...han, 'arabic', 'hebrew', 'devanagari', 'thai']
}

/** Which faces could possibly draw a letter, by where it sits in Unicode. Saves opening a face's list for nothing. */
export function candidates(code: number, language: string): ScriptId[] {
  if (code >= 0x0590 && code <= 0x05FF) return ['hebrew']
  if ((code >= 0x0600 && code <= 0x06FF) || (code >= 0x0750 && code <= 0x077F) || (code >= 0x08A0 && code <= 0x08FF) || (code >= 0xFB50 && code <= 0xFDFF) || (code >= 0xFE70 && code <= 0xFEFF)) return ['arabic']
  if ((code >= 0x0900 && code <= 0x097F) || (code >= 0xA8E0 && code <= 0xA8FF)) return ['devanagari']
  if (code >= 0x0E00 && code <= 0x0E7F) return ['thai']
  if ((code >= 0x1100 && code <= 0x11FF) || (code >= 0x3130 && code <= 0x318F) || (code >= 0xAC00 && code <= 0xD7AF)) return ['kr']
  if (code >= 0x3040 && code <= 0x30FF) return ['jp']
  // Everything else east of there: the shared characters, their punctuation, and the wide forms of Latin letters.
  if (code >= 0x2E80) return order(language).slice(0, 4)
  // A stray symbol: any face that happens to draw it.
  return order(language)
}

export interface Piece {
  script: ScriptId
  /** The piece's name within its face: "korean", "97". */
  name: string
}

/** A face's list, as @fontsource writes it ("[97]": "U+4e00-4e05,U+4e07"), read into ranges. */
export function readRanges(list: Record<string, string>): Array<{ name: string; ranges: Array<[number, number]> }> {
  const found: Array<{ name: string; ranges: Array<[number, number]> }> = []
  for (const [key, spec] of Object.entries(list)) {
    const name = key.replace(/^\[|\]$/g, '')
    if (DRAWN_ALREADY.has(name) || !/^[a-z0-9-]{1,40}$/.test(name) || typeof spec !== 'string') continue
    const ranges: Array<[number, number]> = []
    for (const part of spec.split(',')) {
      const match = /^U\+([0-9a-f]{1,6})(?:-([0-9a-f]{1,6}))?$/i.exec(part.trim())
      if (match) ranges.push([Number.parseInt(match[1]!, 16), Number.parseInt(match[2] ?? match[1]!, 16)])
    }
    found.push({ name, ranges })
  }
  return found
}

/**
 * The pieces a document needs for the letters Omsett's own typeface cannot draw, and the
 * letters no face here draws at all. `list` gets a face's list of pieces, and is called only
 * for a face that a letter might be in.
 */
export async function piecesFor(letters: Iterable<number>, language: string, list: (script: ScriptId) => Promise<Record<string, string>>): Promise<{ pieces: Piece[]; undrawn: number[] }> {
  const opened = new Map<ScriptId, ReturnType<typeof readRanges>>()
  const open = async (script: ScriptId) => {
    if (!opened.has(script)) opened.set(script, readRanges(await list(script)))
    return opened.get(script)!
  }
  const pieces = new Map<string, Piece>()
  const undrawn: number[] = []
  for (const code of new Set(letters)) {
    let drawn = false
    for (const script of candidates(code, language)) {
      const piece = (await open(script)).find((entry) => entry.ranges.some(([from, to]) => code >= from && code <= to))
      if (!piece) continue
      pieces.set(`${script}:${piece.name}`, { script, name: piece.name })
      drawn = true
      break
    }
    if (!drawn) undrawn.push(code)
  }
  return { pieces: [...pieces.values()], undrawn }
}
