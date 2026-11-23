// Formats that are plain text: JSON, JSON Lines, XML, TOML, YAML, CSV, TSV. None has a
// signature. JSON and XML can be told from their first characters. The others cannot always be
// told apart from each other or from a note someone typed, so for those, and only those, the
// file's name is allowed to settle it.

type Found = { ext: string; mime: string }

const found = (ext: string, mime: string): Found => ({ ext, mime })
const JSON_ = found('json', 'application/json')
const JSONL = found('jsonl', 'application/jsonl')
const XML = found('xml', 'application/xml')
const TOML = found('toml', 'application/toml')
const YAML = found('yaml', 'application/yaml')
const CSV = found('csv', 'text/csv')
const TSV = found('tsv', 'text/tab-separated-values')

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

/** Number of `delimiter` outside quotes. */
function count(line: string, delimiter: string): number {
  let total = 0
  let quoted = false
  for (const char of line) {
    if (char === '"') quoted = !quoted
    else if (!quoted && char === delimiter) total++
  }
  return total
}

const TOML_HEADING = /^\[{1,2}([^\][]+)\]{1,2}\s*(?:#.*)?$/
/** "[package]" or "[[person]]": brackets around a name, and nothing else on the line. */
const isTomlTable = (line: string) => /^[\w."' -]+$/.test(TOML_HEADING.exec(line)?.[1] ?? '')
const TOML_PAIR = /^(?:[\w-]+(?:\.[\w-]+)*|"[^"]*"|'[^']*')\s*=\s*\S/
const YAML_START = /^(?:---|%YAML\b|-(?:\s|$)|[^\s#,[\]{}"'][^:,]*:(?:\s|$)|"[^"]*":(?:\s|$))/

const looksToml = (line: string) => isTomlTable(line) || TOML_PAIR.test(line)
const looksYaml = (line: string) => YAML_START.test(line)
/** A table: the first line has columns, and the next has the same number. */
const looksTable = (lines: string[], delimiter: string) => {
  const columns = count(lines[0]!, delimiter)
  return columns > 0 && lines.length > 1 && count(lines[1]!, delimiter) === columns
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
  // The last line of a sample may be cut short, so it is not evidence of anything.
  if (!complete) all.pop()
  const lines = all.filter((line) => line.trim() !== '')
  const first = lines[0]?.trimStart()
  if (first === undefined) return null

  // XML: a tag at the very start. A web page begins the same way and is not data.
  if (first.startsWith('<')) {
    const start = decoded.trimStart().slice(0, 4096)
    if (/^<!doctype\s+html|^<html[\s>]/i.test(start)) return null
    return /^<(?:\?xml|!--|!DOCTYPE|[A-Za-z_])/.test(start) ? XML : null
  }

  const dot = name ? name.lastIndexOf('.') : -1
  const ending = name && dot > 0 ? name.slice(dot + 1).toLowerCase() : null
  const claimed = ending ? NAMED[ending] : undefined

  if (first.startsWith('{') || first.startsWith('[')) {
    // "[package]" opens a TOML file, and is not JSON.
    if (isTomlTable(first) && !parses(first)) return TOML
    // Each line a whole value, more than once: JSON Lines. One such line is that only by name.
    const whole = lines.slice(0, 3).every((line) => /^[{[]/.test(line.trimStart()) && parses(line))
    if (whole && (lines.length > 1 || claimed === JSONL)) return JSONL
    // A bracket opens plenty of things that are not JSON ("[x] buy milk"). Where the whole
    // file is in hand it must read as JSON, unless its name says that is what it set out to be.
    if (complete && ending !== 'json' && !parses(decoded)) return null
    return JSON_
  }

  // From here the contents alone cannot be sure. A name that says what the file is settles it,
  // if the contents could be that. A name that says something else (.txt, .png) means it is
  // not offered as data at all.
  const content = lines.filter((line) => !line.trimStart().startsWith('#'))
  const line = content[0]?.trim()
  if (claimed === TOML) return line === undefined || looksToml(line) ? TOML : null
  if (claimed === YAML || claimed === CSV || claimed === TSV) return claimed
  if (ending !== null && claimed === undefined && !['json', 'xml'].includes(ending)) return null
  if (line === undefined) return null
  if (looksToml(line)) return TOML
  if (looksYaml(line)) return YAML
  if (looksTable(lines, '\t')) return TSV
  if (looksTable(lines, ',') || looksTable(lines, ';')) return CSV
  return null
}
