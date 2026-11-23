import { lookup, Refusal } from '../util'

// Subtitle files → cues: a start, an end, and the words. Every reader here is Omsett's own, and
// each is written to be handed a file made to break it: nothing loops more than once over the
// text, nothing a file says can multiply what is held in memory, and a time that does not read
// as a time is a reason to refuse the file, not something to guess at.

export interface Cue {
  /** Milliseconds from the start. */
  start: number
  end: number
  /** Plain words, lines separated by a line feed. */
  text: string
}

/** A line with a start, whose end is whatever comes next. */
interface Entry {
  start: number
  end?: number
  text: string
}

/** More cues than this is not a subtitle file anyone made, and is how a small file becomes a large one. */
const MAX_CUES = 200_000
/** The most text, in characters, all the cues together may hold. */
const MAX_TEXT = 32 * 1024 * 1024
/** How long a line with no stated end, and nothing after it, is shown for. */
const LAST_LINE_MS = 5000
const MAX_DEPTH = 256

export const invalid = (name: string) => new Refusal(`This file is not valid ${name}`)
const tooMany = () => new Refusal('This file holds more subtitles than Omsett will convert')

const allLines = (text: string) => text.split(/\r\n|\r|\n/)

/** Runs of lines with no blank line between them. */
function blocks(text: string): string[][] {
  const found: string[][] = []
  let current: string[] = []
  for (const line of allLines(text)) {
    if (line.trim() === '') {
      if (current.length > 0) found.push(current)
      current = []
    } else current.push(line)
  }
  if (current.length > 0) found.push(current)
  return found
}

/** "5" is half a second, "50" is half a second, "500" is half a second. */
const fraction = (digits: string | undefined) => Number((digits ?? '').padEnd(3, '0').slice(0, 3))
const clock = (h: string | undefined, m: string, s: string, f?: string) =>
  ((Number(h ?? 0) * 60 + Number(m)) * 60 + Number(s)) * 1000 + fraction(f)

const ENTITIES = lookup<string>({
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  lrm: '',
  rlm: '',
})

/** Named and numbered entities, each read once: "&amp;lt;" is "&lt;", not "<". */
function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,6});/gi, (whole, name: string) => {
    if (name.startsWith('#')) {
      const code = /^#x/i.test(name) ? Number.parseInt(name.slice(2), 16) : Number(name.slice(1))
      const usable = code > 0 && code <= 0x10FFFF && !(code >= 0xD800 && code <= 0xDFFF)
      return usable ? String.fromCodePoint(code) : ''
    }
    return ENTITIES[name.toLowerCase()] ?? whole
  })
}

const TAG = /<\/?[a-z0-9.:][^<>]*>/gi
/**
 * <i>, </font>, <v Speaker>, <00:01.000>: anything shaped like a tag. "a < b" is left alone.
 * Taking a tag out can leave another behind ("<<b>script>" becomes "<script>"), so it is
 * done again until nothing is left to take. A few times is enough for anything honest; text
 * still making tags after that is doing it on purpose, and loses its angle brackets.
 */
function withoutTags(text: string): string {
  for (let pass = 0; pass < 4; pass++) {
    const less = text.replace(TAG, '')
    if (less === text) return text
    text = less
  }
  return text.replace(/[<>]/g, '')
}

/** Everything between <!-- and -->. Written as a loop so that a thousand unclosed ones cost nothing. */
function withoutComments(text: string): string {
  let out = ''
  let from = 0
  for (;;) {
    const open = text.indexOf('<!--', from)
    if (open < 0) return out + text.slice(from)
    const close = text.indexOf('-->', open + 4)
    if (close < 0) return out + text.slice(from, open)
    out += text.slice(from, open)
    from = close + 3
  }
}

/** Control codes out, each line trimmed, empty lines dropped. */
function tidy(text: string): string {
  let kept = ''
  for (const char of text) {
    const code = char.codePointAt(0)!
    if (char === '\n' || char === '\t' || (code >= 0x20 && code !== 0x7F)) kept += char === '\t' ? ' ' : char
  }
  return kept
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .join('\n')
}

/** Collects cues, and refuses a file that turns out to hold far more than it should. */
class Collector {
  readonly cues: Cue[] = []
  private characters = 0

  add(start: number, end: number, raw: string): void {
    // Whatever format the words came from, anything shaped like a tag is taken out of them
    // here, after every escape has been undone. Some players put a subtitle's text into a web
    // page as it stands, and a tag that reached one would be markup there.
    const text = tidy(withoutTags(raw))
    if (text === '') return
    if (end < start) throw new Refusal('A subtitle in this file ends before it starts')
    this.characters += text.length
    if (this.cues.length >= MAX_CUES || this.characters > MAX_TEXT) throw tooMany()
    this.cues.push({ start, end, text })
  }

  /** More words for a subtitle already collected. Cleaned and counted like any others. */
  extend(cue: Cue, raw: string): void {
    const text = tidy(withoutTags(raw))
    if (text === '') return
    this.characters += text.length
    if (this.characters > MAX_TEXT) throw tooMany()
    cue.text = `${cue.text}\n${text}`
  }

  /** Lines that say only when they start: each lasts until the next one. */
  addEntries(entries: Entry[]): void {
    if (entries.length > MAX_CUES) throw tooMany()
    entries.sort((a, b) => a.start - b.start)
    // For each line, the start of the next line that begins later: one pass, from the end.
    const next: number[] = []
    let later = Number.NaN
    let group = Number.NaN
    for (let i = entries.length - 1; i >= 0; i--) {
      const start = entries[i]!.start
      if (start !== group) {
        if (!Number.isNaN(group)) later = group
        group = start
      }
      next[i] = later
    }
    entries.forEach((entry, i) => {
      const end = entry.end ?? (Number.isNaN(next[i]!) ? entry.start + LAST_LINE_MS : next[i]!)
      this.add(entry.start, end, entry.text)
    })
  }

  done(): Cue[] {
    if (this.cues.length === 0) throw new Refusal('This file has no subtitles in it')
    return this.cues.sort((a, b) => a.start - b.start)
  }
}

// --- SubRip ------------------------------------------------------------------------------------

const SRT_TIME =
  /^(\d{1,4}):([0-5]\d):([0-5]\d)[,.](\d{1,3})\s*-->\s*(\d{1,4}):([0-5]\d):([0-5]\d)[,.](\d{1,3})(?:\s.*)?$/
/** Positions and effects written the ASS way, which SRT files borrow: {\an8}. */
const withoutOverrides = (text: string) => text.replace(/\{\\[^{}]*\}/g, '')

function readSrt(text: string): Cue[] {
  const found = new Collector()
  let last: Cue | null = null
  for (const block of blocks(text)) {
    const at = block.findIndex((line) => line.includes('-->'))
    // A blank line inside a subtitle's text splits it in two. The second half has no time of
    // its own and belongs to the subtitle above; before the first subtitle there is no "above".
    if (at < 0 || at > 1) {
      if (!last || at > 1) throw invalid('SRT')
      found.extend(last, withoutOverrides(withoutTags(block.join('\n'))))
      continue
    }
    if (at === 1 && !/^\d+$/.test(block[0]!.trim())) throw invalid('SRT')
    const m = SRT_TIME.exec(block[at]!.trim())
    if (!m) throw invalid('SRT')
    const words = tidy(withoutOverrides(withoutTags(block.slice(at + 1).join('\n'))))
    const before = found.cues.length
    found.add(clock(m[1], m[2]!, m[3]!, m[4]), clock(m[5], m[6]!, m[7]!, m[8]), words)
    last = found.cues.length > before ? found.cues.at(-1)! : null
  }
  return found.done()
}

// --- WebVTT ------------------------------------------------------------------------------------

const VTT_TIME =
  /^(?:(\d{1,4}):)?([0-5]\d):([0-5]\d)\.(\d{3})[ \t]+-->[ \t]+(?:(\d{1,4}):)?([0-5]\d):([0-5]\d)\.(\d{3})(?:[ \t].*)?$/

function readVtt(text: string): Cue[] {
  const [header, ...rest] = blocks(text)
  if (!header || !/^WEBVTT(?:[ \t].*)?$/.test(header[0]!)) throw invalid('WebVTT')
  const found = new Collector()
  for (const block of rest) {
    if (/^(?:NOTE|STYLE|REGION)(?:[ \t]|$)/.test(block[0]!)) continue
    const at = block.findIndex((line) => line.includes('-->'))
    if (at < 0 || at > 1) throw invalid('WebVTT')
    const m = VTT_TIME.exec(block[at]!.trim())
    if (!m) throw invalid('WebVTT')
    const words = tidy(decodeEntities(withoutTags(block.slice(at + 1).join('\n'))))
    found.add(clock(m[1], m[2]!, m[3]!, m[4]), clock(m[5], m[6]!, m[7]!, m[8]), words)
  }
  return found.done()
}

// --- SBV (YouTube) -----------------------------------------------------------------------------

const SBV_TIME = /^(\d{1,4}):([0-5]\d):([0-5]\d)\.(\d{1,3}),(\d{1,4}):([0-5]\d):([0-5]\d)\.(\d{1,3})$/

function readSbv(text: string): Cue[] {
  const found = new Collector()
  for (const block of blocks(text)) {
    const m = SBV_TIME.exec(block[0]!.trim())
    if (!m) throw invalid('SBV')
    const words = tidy(block.slice(1).join('\n').replaceAll('[br]', '\n'))
    found.add(clock(m[1], m[2]!, m[3]!, m[4]), clock(m[5], m[6]!, m[7]!, m[8]), words)
  }
  return found.done()
}

// --- ASS and SSA -------------------------------------------------------------------------------

const ASS_TIME = /^(\d{1,4}):([0-5]\d):([0-5]\d)[.:](\d{1,3})$/
const SSA_FIELDS = ['marked', 'start', 'end', 'style', 'name', 'marginl', 'marginr', 'marginv', 'effect', 'text']

/**
 * The words of one line: \N is a line break, {…} is an instruction about how the words look,
 * and what follows {\p1} is a drawing, not words. One pass, whatever the line holds.
 */
function assWords(raw: string): string {
  let out = ''
  let drawing = false
  let unclosed = false
  for (let i = 0; i < raw.length; i++) {
    const char = raw[i]!
    if (char === '\\') {
      const next = raw[i + 1]
      if (next === 'N' || next === 'n' || next === 'h' || next === '{' || next === '}') {
        if (!drawing) out += next === 'h' ? ' ' : next === 'N' || next === 'n' ? '\n' : next
        i++
        continue
      }
    } else if (char === '{' && !unclosed) {
      const close = raw.indexOf('}', i)
      if (close < 0) unclosed = true
      else {
        const block = raw.slice(i, close)
        if (/\\p[1-9]/.test(block)) drawing = true
        else if (block.includes('\\p0')) drawing = false
        i = close
        continue
      }
    }
    if (!drawing) out += char
  }
  return out
}

function readAss(text: string, name: string): Cue[] {
  const found = new Collector()
  let section = ''
  let events = false
  let fields: string[] | null = null
  for (const line of allLines(text)) {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith(';')) continue
    if (/^\[[^\]]*\]$/.test(trimmed)) {
      section = trimmed.toLowerCase()
      events ||= section === '[events]'
      continue
    }
    if (section !== '[events]') continue
    const colon = trimmed.indexOf(':')
    if (colon < 0) throw invalid(name)
    const key = trimmed.slice(0, colon).trim().toLowerCase()
    const rest = trimmed.slice(colon + 1).trimStart()
    if (key === 'format') fields = rest.split(',').map((field) => field.trim().toLowerCase())
    if (key !== 'dialogue') continue

    const columns = fields ?? SSA_FIELDS
    const [startAt, endAt] = [columns.indexOf('start'), columns.indexOf('end')]
    // The words are the last column, because they are the one that may hold commas.
    if (startAt < 0 || endAt < 0 || columns.at(-1) !== 'text' || columns.length > 64) throw invalid(name)
    const cells: string[] = []
    let from = 0
    for (let i = 0; i < columns.length - 1; i++) {
      const comma = rest.indexOf(',', from)
      if (comma < 0) throw invalid(name)
      cells.push(rest.slice(from, comma))
      from = comma + 1
    }
    const start = ASS_TIME.exec(cells[startAt]!.trim())
    const end = ASS_TIME.exec(cells[endAt]!.trim())
    if (!start || !end) throw invalid(name)
    found.add(
      clock(start[1], start[2]!, start[3]!, start[4]),
      clock(end[1], end[2]!, end[3]!, end[4]),
      tidy(assWords(rest.slice(from))),
    )
  }
  if (!events) throw invalid(name)
  return found.done()
}

// --- LRC (lyrics) ------------------------------------------------------------------------------

function readLrc(text: string): Cue[] {
  const entries: Entry[] = []
  let characters = 0
  for (const line of allLines(text)) {
    const trimmed = line.trim()
    if (trimmed === '') continue
    // One line of words may carry several times: a chorus, written once.
    const stamp = /\[(\d{1,3}):([0-5]\d)(?:[.:](\d{1,3}))?\]/y
    const starts: number[] = []
    let end = 0
    for (let m = stamp.exec(trimmed); m; m = stamp.exec(trimmed)) {
      starts.push(clock(undefined, m[1]!, m[2]!, m[3]))
      end = stamp.lastIndex
    }
    if (starts.length === 0) {
      // "[ar:Artist]" and its kind say what the song is, and are not lyrics.
      if (/^\[[a-z#]+:[^\]]*\]$/i.test(trimmed)) continue
      throw invalid('LRC')
    }
    const words = tidy(withoutTags(trimmed.slice(end)))
    characters += words.length * starts.length
    if (entries.length + starts.length > MAX_CUES || characters > MAX_TEXT) throw tooMany()
    for (const start of starts) entries.push({ start, text: words })
  }
  const found = new Collector()
  found.addEntries(entries)
  return found.done()
}

// --- MicroDVD ----------------------------------------------------------------------------------

export const DEFAULT_FPS = 23.976
const FRAMES = /^\{(\d{1,9})\}\{(\d{0,9})\}(.*)$/

function readMicroDvd(text: string): Cue[] {
  let fps = DEFAULT_FPS
  let first = true
  const entries: Entry[] = []
  for (const line of allLines(text)) {
    if (line.trim() === '') continue
    const m = FRAMES.exec(line.trim())
    if (!m) throw invalid('MicroDVD')
    // By convention a first line of {1}{1} holds the frame rate and is not a subtitle.
    if (first && m[1] === '1' && m[2] === '1' && /^\d{1,3}(?:\.\d{1,4})?$/.test(m[3]!.trim())) {
      fps = Number(m[3]!.trim())
      if (fps < 1) throw invalid('MicroDVD')
      first = false
      continue
    }
    first = false
    const words = m[3]!
      .split('|')
      // {y:i} and its kind set a style; a leading slash means italics.
      .map((part) => part.replace(/\{[a-z]:[^{}]*\}/gi, '').replace(/^\//, ''))
      .join('\n')
    const at = (frame: string) => Math.round((Number(frame) / fps) * 1000)
    if (entries.length >= MAX_CUES) throw tooMany()
    entries.push({ start: at(m[1]!), end: m[2] === '' ? undefined : at(m[2]!), text: tidy(words) })
  }
  const found = new Collector()
  found.addEntries(entries)
  return found.done()
}

// --- SAMI --------------------------------------------------------------------------------------

function readSami(text: string): Cue[] {
  if (!/<sami[\s>]/i.test(text.slice(0, 4096))) throw invalid('SAMI')
  const body = withoutComments(text)
  // Every <SYNC …> tag whose Start is a number of milliseconds; one without is not a mark.
  const marks = [...body.matchAll(/<sync\s([^<>]*)>/gi)].flatMap((tag) => {
    const start = /(?:^|\s)start\s*=\s*["']?(\d{1,10})(?=["'\s]|$)/i.exec(tag[1]!)
    return start ? [{ at: tag.index, after: tag.index + tag[0].length, start: Number(start[1]) }] : []
  })
  if (marks.length > MAX_CUES) throw tooMany()
  const entries: Entry[] = marks.map((mark, i) => {
    const inner = body.slice(mark.after, marks[i + 1]?.at ?? body.length)
    // A file may hold several languages, one paragraph each. The first is taken.
    const paragraphs = inner.split(/<p\b[^<>]*>/i)
    const first = (paragraphs[1] ?? paragraphs[0]!)
      // A tag the file ends in the middle of is not words.
      .replace(/<[a-z!/][^<>]*$/i, '')
      .replace(/<br\b[^<>]*>/gi, '\n')
    return { start: mark.start, text: tidy(decodeEntities(withoutTags(first))) }
  })
  const found = new Collector()
  found.addEntries(entries)
  return found.done()
}

// --- TTML --------------------------------------------------------------------------------------

type Node = Record<string, unknown>
const TTML_CLOCK = /^(\d{1,4}):([0-5]\d):([0-5]\d)(?:\.(\d{1,9})|:(\d{1,3}))?$/
const TTML_OFFSET = /^(\d{1,12}(?:\.\d{1,9})?)(ms|[hmsft])$/

const tagOf = (node: Node) => Object.keys(node).find((key) => key !== ':@')
const attributes = (node: Node) => (node[':@'] ?? {}) as Record<string, unknown>
const children = (node: Node, tag: string) => (Array.isArray(node[tag]) ? (node[tag] as Node[]) : [])

async function readTtml(text: string): Promise<Cue[]> {
  const { XMLParser, XMLValidator } = await import('fast-xml-parser')
  if (XMLValidator.validate(text) !== true) throw invalid('TTML')
  // The parser refuses a file that names anything outside itself, and stops expanding a file's
  // own entities long before they multiply into something large.
  const tree = new XMLParser({
    preserveOrder: true,
    ignoreAttributes: false,
    attributeNamePrefix: '@',
    removeNSPrefix: true,
    trimValues: false,
    parseTagValue: false,
    parseAttributeValue: false,
    ignoreDeclaration: true,
    ignorePiTags: true,
    htmlEntities: true,
  }).parse(text) as Node[]
  const root = tree.find((node) => tagOf(node) === 'tt')
  if (!root || tree.filter((node) => tagOf(node) !== '#text').length !== 1) throw invalid('TTML')

  const rate = (name: string, fallback: number) => {
    const stated = attributes(root)[`@${name}`]
    if (stated === undefined) return fallback
    const value = Number(stated)
    if (!(value >= 1 && value <= 100_000_000)) throw invalid('TTML')
    return value
  }
  const frameRate = rate('frameRate', 30)
  const tickRate = rate('tickRate', 1)
  const time = (stated: unknown): number | null => {
    if (stated === undefined) return null
    const value = String(stated).trim()
    const c = TTML_CLOCK.exec(value)
    if (c) {
      const part = c[4] ? Number(`0.${c[4]}`) * 1000 : c[5] ? (Number(c[5]) / frameRate) * 1000 : 0
      return clock(c[1], c[2]!, c[3]!) + Math.round(part)
    }
    const o = TTML_OFFSET.exec(value)
    if (!o) throw invalid('TTML')
    const per = { h: 3_600_000, m: 60_000, s: 1000, ms: 1, f: 1000 / frameRate, t: 1000 / tickRate }
    return Math.round(Number(o[1]) * per[o[2] as keyof typeof per])
  }

  const found = new Collector()
  const words = (nodes: Node[], depth: number): string => {
    if (depth > MAX_DEPTH) throw invalid('TTML')
    let out = ''
    for (const node of nodes) {
      const tag = tagOf(node)
      if (tag === '#text') out += String(node['#text']).replace(/\s+/g, ' ')
      else if (tag === 'br') out += '\n'
      else if (tag) out += words(children(node, tag), depth + 1)
    }
    return out
  }
  const walk = (nodes: Node[], depth: number): void => {
    if (depth > MAX_DEPTH) throw invalid('TTML')
    for (const node of nodes) {
      const tag = tagOf(node)
      if (!tag || tag === '#text' || tag === 'head') continue
      if (tag !== 'p') {
        walk(children(node, tag), depth + 1)
        continue
      }
      const stated = attributes(node)
      const start = time(stated['@begin'])
      // A paragraph with no time is not shown at any moment, so it is not a subtitle.
      if (start === null) continue
      const length = time(stated['@dur'])
      const end = time(stated['@end']) ?? (length === null ? null : start + length)
      if (end === null) throw invalid('TTML')
      found.add(start, end, tidy(words(children(node, tag), depth + 1)))
    }
  }
  walk(children(root, 'tt'), 0)
  return found.done()
}

export async function readCues(format: string, text: string): Promise<Cue[]> {
  switch (format) {
    case 'srt':
      return readSrt(text)
    case 'vtt':
      return readVtt(text)
    case 'sbv':
      return readSbv(text)
    case 'ass':
      return readAss(text, 'ASS')
    case 'ssa':
      return readAss(text, 'SSA')
    case 'lrc':
      return readLrc(text)
    case 'microdvd':
      return readMicroDvd(text)
    case 'smi':
      return readSami(text)
    case 'ttml':
      return readTtml(text)
  }
  throw new Error(`The subtitle engine does not read ${format}`)
}
