// Formats that are plain text: the data formats (JSON, JSON Lines, XML, TOML, YAML, CSV, TSV),
// the subtitle formats, HTML and Markdown, and address books and calendars. None has a signature. Subtitles, JSON and XML can be told from how
// they begin. The others cannot always be told apart from each other or from a note someone
// typed, so for those, and only those, the file's name is allowed to settle it.

type Found = { ext: string; mime: string }

const found = (ext: string, mime: string): Found => ({ ext, mime })
const JSON_ = found('json', 'application/json')
const JSONL = found('jsonl', 'application/jsonl')
const XML = found('xml', 'application/xml')
const TOML = found('toml', 'application/toml')
const YAML = found('yaml', 'application/yaml')
const CSV = found('csv', 'text/csv')
const TSV = found('tsv', 'text/tab-separated-values')

const SRT = found('srt', 'application/x-subrip')
const VTT = found('vtt', 'text/vtt')
const ASS = found('ass', 'text/x-ass')
const SSA = found('ssa', 'text/x-ssa')
const SBV = found('sbv', 'text/x-sbv')
const LRC = found('lrc', 'application/x-lrc')
const TTML = found('ttml', 'application/ttml+xml')
const SMI = found('smi', 'application/x-sami')
const MICRODVD = found('microdvd', 'text/x-microdvd')
const VCARD = found('vcf', 'text/vcard')
const CALENDAR = found('ics', 'text/calendar')
const FOUNTAIN = found('fountain', 'text/x-fountain')
const FDX = found('fdx', 'application/xml')
const HTML = found('html', 'text/html')
const MARKDOWN = found('md', 'text/markdown')
const PLAIN = found('txt', 'text/plain')

/** What a name's ending claims, for the formats whose contents cannot say. */
const NAMED: Record<string, Found> = {
  toml: TOML,
  yaml: YAML,
  yml: YAML,
  csv: CSV,
  tsv: TSV,
  tab: TSV,
  jsonl: JSONL,
  ndjson: JSONL,
}

// Bytes no text file holds: control codes other than tab, line feed and carriage return.
// eslint-disable-next-line no-control-regex -- control characters are exactly what this finds
const BINARY = /[\u0000-\u0008\v\f\u000E-\u001F]/

/** The bytes as text, or null if they are not UTF-8 text. */
function decode(head: Uint8Array): string | null {
  try {
    // Streaming, so a character cut in half by the end of the sample is not an error.
    const text = new TextDecoder('utf-8', { fatal: true }).decode(head, { stream: true })
    return BINARY.test(text) ? null : text.replace(/^\uFEFF/, '')
  } catch {
    return null
  }
}

function parses(text: string): boolean {
  try {
    JSON.parse(text)
    return true
  } catch {
    return false
  }
}

const TOML_HEADING = /^\[{1,2}([^\][]+)\]{1,2}\s*(?:#.*)?$/
/** "[package]" or "[[person]]": brackets around a name, and nothing else on the line. */
const isTomlTable = (line: string) => /^[\w."' -]+$/.test(TOML_HEADING.exec(line)?.[1] ?? '')
const TOML_PAIR = /^(?:[\w-]+(?:\.[\w-]+)*|"[^"]*"|'[^']*')\s*=\s*\S/
const YAML_START = /^(?:---|%YAML\b|-(?:\s|$)|[^\s#,[\]{}"'][^:,]*:(?:\s|$)|"[^"]*":(?:\s|$))/

const looksToml = (line: string) => isTomlTable(line) || TOML_PAIR.test(line)
const looksYaml = (line: string) => YAML_START.test(line)
/**
 * How many times `delimiter` separates cells in each of the first two rows. A row is not always
 * a line: a quoted cell may hold line breaks, and the row goes on until the quote closes.
 */
function firstRows(text: string, delimiter: string): number[] {
  const counts: number[] = []
  let count = 0
  let quoted = false
  let empty = true
  for (let i = 0; i < text.length && counts.length < 2; i++) {
    const char = text[i]!
    if (char === '"') quoted = !quoted
    else if (!quoted && char === delimiter) count++
    else if (!quoted && (char === '\n' || char === '\r')) {
      // A line with nothing on it is not a row.
      if (!empty) counts.push(count)
      count = 0
      empty = true
      continue
    }
    empty = false
  }
  return counts
}

/** A table: the first row has columns, and the next has the same number. */
const looksTable = (text: string, delimiter: string) => {
  const [first, second] = firstRows(`${text}\n`, delimiter)
  return first !== undefined && first > 0 && second === first
}

// Subtitles. Each begins in a way nothing else does: a time with an arrow, a pair of frame
// numbers in braces, a heading, a time in square brackets.
const SRT_TIME = /^\d{1,4}:[0-5]\d:[0-5]\d[,.]\d{1,3}\s*-->\s*\d{1,4}:[0-5]\d:[0-5]\d[,.]\d{1,3}(?:\s|$)/
const SBV_TIME = /^\d{1,4}:[0-5]\d:[0-5]\d\.\d{1,3},\d{1,4}:[0-5]\d:[0-5]\d\.\d{1,3}$/
const FRAMES = /^\{\d{1,9}\}\{\d{0,9}\}/
const LRC_TIME = /^\[\d{1,3}:[0-5]\d(?:[.:]\d{1,3})?\]/
const LRC_NOTE = /^\[(?:ti|ar|al|au|by|re|ve|la|length|offset|#):[^\]]*\]$/i

function sniffSubtitle(decoded: string, lines: string[]): Found | null {
  const first = lines[0]!.trim()
  if (/^WEBVTT(?:[ \t]|$)/.test(first)) return VTT
  if (/^\[script info\]$/i.test(first)) {
    // The older form names its styles "V4"; the newer, "V4+".
    const old = /^\[v4 styles\]\s*$/im.test(decoded) || /^scripttype:\s*v4\.00\s*$/im.test(decoded)
    return old ? SSA : ASS
  }
  if (SRT_TIME.test(first)) return SRT
  if (/^\d+$/.test(first) && lines[1] !== undefined && SRT_TIME.test(lines[1].trim())) return SRT
  if (SBV_TIME.test(first)) return SBV
  if (FRAMES.test(first)) return MICRODVD
  // Lyrics may open with the song's title and artist; somewhere near the top there is a time.
  if (LRC_TIME.test(first)) return LRC
  if (LRC_NOTE.test(first) && lines.slice(1, 20).some((line) => LRC_TIME.test(line.trim()))) return LRC
  return null
}

/** Where the thing that opens `rest` ends: a declaration, a comment, or a doctype. -1 if it is none. */
function prologEnd(rest: string): number {
  const after = (close: string, from = 0) => {
    const at = rest.indexOf(close, from)
    return at < 0 ? -1 : at + close.length
  }
  if (rest.startsWith('<?')) return after('?>')
  if (rest.startsWith('<!--')) return after('-->')
  if (!/^<!doctype\s/i.test(rest)) return -1
  // A doctype may hold declarations of its own in square brackets, with ">" inside them.
  const bracket = rest.indexOf('[')
  const close = rest.indexOf('>')
  if (bracket < 0 || close < bracket) return after('>')
  const end = rest.indexOf(']', bracket)
  return end < 0 ? -1 : after('>', end)
}

/** The name of the outermost tag, without its prefix: "tt" for <tt:tt …>. */
function rootTag(start: string): string | null {
  let rest = start.trimStart()
  for (let i = 0; i < 64; i++) {
    const end = prologEnd(rest)
    if (end < 0) break
    rest = rest.slice(end).trimStart()
  }
  return /^<(?:[a-z_][\w.-]*:)?([a-z_][\w.-]*)/i.exec(rest)?.[1] ?? null
}

/**
 * @param head     the start of the file
 * @param complete whether `head` is the whole file
 * @param name     the file's name, if it has one
 */
export function sniffText(head: Uint8Array, complete: boolean, name?: string): Found | null {
  const decoded = decode(head)
  if (decoded === null) return null
  const all = decoded.split(/\r\n|\r|\n/)
  // The last line of a sample may be cut short, so it is not evidence of anything; unless it
  // is the only line, as in JSON written without line breaks, where its start is all there is.
  if (!complete && all.length > 1) all.pop()
  const lines = all.filter((line) => line.trim() !== '')
  const first = lines[0]?.trimStart()
  if (first === undefined) return null

  const dot = name ? name.lastIndexOf('.') : -1
  const ending = name && dot > 0 ? name.slice(dot + 1).toLowerCase() : null

  // Markdown is any text at all, with or without its marks, so nothing in a file can say that
  // it is Markdown. Its name is the only thing that can.
  if (ending !== null && ['md', 'markdown', 'mdown'].includes(ending)) return MARKDOWN
  // The same goes for a screenplay in Fountain: it is plain text with no mark of its own.
  if (ending !== null && ['fountain', 'spmd'].includes(ending)) return FOUNTAIN

  // An address book and a calendar each open with a line that says so.
  if (/^BEGIN:VCARD\s*$/i.test(first)) return VCARD
  if (/^BEGIN:VCALENDAR\s*$/i.test(first)) return CALENDAR

  // A tag at the very start: a web page, subtitles written as tags, or XML.
  if (first.startsWith('<')) {
    const start = decoded.trimStart().slice(0, 4096)
    // SAMI is written like a web page and is not XML. TTML is XML, and is subtitles.
    if (/^<sami[\s>]/i.test(start)) return SMI
    const root = rootTag(start)
    if (root === 'tt') return TTML
    // Final Draft's scripts are XML with a tag of their own at the top.
    if (root === 'FinalDraft') return FDX
    if (/^<!doctype\s+html/i.test(start) || root?.toLowerCase() === 'html') return HTML
    // A piece of a page, with no <html> around it, reads like XML. Its name says which it is.
    if (ending === 'html' || ending === 'htm') return root ? HTML : null
    return /^<(?:\?xml|!--|!DOCTYPE|[A-Za-z_])/.test(start) ? XML : null
  }

  const subtitle = sniffSubtitle(decoded, lines)
  if (subtitle) return subtitle

  const claimed = ending ? NAMED[ending] : undefined

  if (first.startsWith('{') || first.startsWith('[')) {
    // "[package]" opens a TOML file, and is not JSON.
    if (isTomlTable(first) && !parses(first)) return TOML
    // Each line a whole value, more than once: JSON Lines. One such line is that only by name.
    const whole = lines.slice(0, 3).every((line) => /^[{[]/.test(line.trimStart()) && parses(line))
    if (whole && (lines.length > 1 || claimed === JSONL)) return JSONL
    // A bracket opens plenty of things that are not JSON ("[x] buy milk"). Where the whole
    // file is in hand it must read as JSON, unless its name says that is what it set out to be.
    if (complete && ending !== 'json' && !parses(decoded)) return ending === 'txt' || ending === 'text' ? PLAIN : null
    return JSON_
  }

  // From here the contents alone cannot be sure. A name that says what the file is settles it,
  // if the contents could be that. A name that says something else (.txt, .png) means it is
  // not offered as data at all.
  const content = lines.filter((line) => !line.trimStart().startsWith('#'))
  const line = content[0]?.trim()
  if (claimed === TOML) return line === undefined || looksToml(line) ? TOML : null
  if (claimed === YAML || claimed === CSV || claimed === TSV) return claimed
  // Plain text is any text at all, like Markdown: only its name says that this is what it is.
  // It is asked last, so that a file named .txt that is a table, JSON or subtitles is that.
  if (ending === 'txt' || ending === 'text') return PLAIN
  if (ending !== null && claimed === undefined && !['json', 'xml'].includes(ending)) return null
  if (line === undefined) return null
  if (looksToml(line)) return TOML
  if (looksYaml(line)) return YAML
  // What is in hand, less a last line that the end of the sample may have cut short.
  const table = complete ? decoded : decoded.slice(0, Math.max(0, decoded.lastIndexOf('\n')))
  if (looksTable(table, '\t')) return TSV
  if (looksTable(table, ',') || looksTable(table, ';')) return CSV
  return null
}
