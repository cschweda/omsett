import { dataInfo } from '../info'
import type { ConvertInput, ConvertOutput, Engine } from '../types'
import { outputName, Refusal, throwIfAborted } from '../util'
import { readContacts, readEvents, writeContacts, writeEvents } from './cards'
import { readTable, rowsOf, writeTable } from './table'
import { writeXml } from './xml'

// Data formats: JSON, JSON Lines, YAML, TOML, XML, CSV and TSV, and two kinds of record that
// are tables at heart: address books (vCard) and calendars (iCalendar). Each is read into the same plain
// values (lists, named values, text, numbers, true/false, nothing) and written out from them.
// Nothing here runs anything a file says: no tags that build objects, no entities fetched.

/** Larger than this is not read as data. Parsing holds several copies of the file at once. */
const MAX_DATA_BYTES = 32 * 1024 * 1024
/** Deeper than this is not data anyone wrote by hand, and is how a file exhausts the stack. */
const MAX_DEPTH = 256

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Whatever a parser returned → plain values only. Dates become text, a number too large to hold
 * becomes text, and every group is rebuilt so that no name in the file (`__proto__`, say) is
 * anything but a name.
 */
function plain(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) throw new Refusal('The values in this file are nested too deeply')
  if (value === null || value === undefined) return null
  if (typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') return value
  if (typeof value === 'bigint') return Number.isSafeInteger(Number(value)) ? Number(value) : String(value)
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString()
  if (Array.isArray(value)) return value.map((entry) => plain(entry, depth + 1))
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, plain(entry, depth + 1)]))
  }
  return String(value)
}

const invalid = (name: string) => new Refusal(`This file is not valid ${name}`)

async function read(format: string, text: string): Promise<unknown> {
  switch (format) {
    case 'json':
      return JSON.parse(text)
    case 'jsonl':
      return text
        .split(/\r?\n/)
        .filter((line) => line.trim() !== '')
        .map((line) => JSON.parse(line) as unknown)
    case 'yaml': {
      const { parseAllDocuments } = await import('yaml')
      // The core schema knows text, numbers, true/false and null, and no tag builds anything
      // else. A file whose aliases multiply past the limit is refused (the "billion laughs").
      const documents = parseAllDocuments(text, { schema: 'core', merge: true, logLevel: 'silent' })
      if (!Array.isArray(documents) || documents.some((document) => document.errors.length > 0)) {
        throw invalid('YAML')
      }
      const values = documents.map((document) => document.toJS({ maxAliasCount: 100 }) as unknown)
      // Several documents in one file are a list of them.
      return values.length === 1 ? values[0] : values
    }
    case 'toml': {
      const { parse } = await import('smol-toml')
      return parse(text)
    }
    case 'xml': {
      const { XMLParser, XMLValidator } = await import('fast-xml-parser')
      if (XMLValidator.validate(text) !== true) throw invalid('XML')
      // The parser refuses a file that names anything outside itself, and stops expanding a
      // file's own entities long before they can multiply into something large.
      const parsed = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '@',
        ignoreDeclaration: true,
        ignorePiTags: true,
        htmlEntities: true,
        numberParseOptions: { leadingZeros: false, hex: false, eNotation: false },
      }).parse(text) as Record<string, unknown>
      if (Object.keys(parsed).length !== 1) throw invalid('XML')
      return parsed
    }
    case 'csv':
      return readTable(text, false)
    case 'tsv':
      return readTable(text, true)
    case 'vcf':
      return readContacts(text)
    case 'ics':
      return readEvents(text)
  }
  throw new Error(`The data engine does not read ${format}`)
}

/** TOML has no null. A named value that is empty is left out; inside a list there is no way. */
function withoutNulls(value: unknown): unknown {
  if (Array.isArray(value)) {
    if (value.includes(null)) throw new Refusal('TOML cannot hold an empty value inside a list')
    return value.map(withoutNulls)
  }
  if (!isRecord(value)) return value
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== null)
      .map(([key, entry]) => [key, withoutNulls(entry)]),
  )
}

async function write(format: string, value: unknown): Promise<string> {
  switch (format) {
    case 'json':
      return `${JSON.stringify(value, null, 2)}\n`
    case 'jsonl':
      return `${rowsOf(value)
        .map((row) => JSON.stringify(row))
        .join('\n')}\n`
    case 'yaml': {
      const { stringify } = await import('yaml')
      return stringify(value, { schema: 'core', aliasDuplicateObjects: false })
    }
    case 'toml': {
      const { stringify } = await import('smol-toml')
      // Everything in TOML has a name. A list gets one; so does a lone value.
      const named = isRecord(value) ? value : Array.isArray(value) ? { item: value } : { value }
      // The library writes one line per value and never a raw line break inside one, so a line
      // that starts with "[" is always a section heading. Each gets a blank line above it.
      const written = stringify(withoutNulls(named) as Record<string, unknown>).trimEnd()
      return `${written.replace(/\n+(?=\[)/g, '\n\n')}\n`
    }
    case 'xml':
      return writeXml(value)
    case 'csv':
      return writeTable(value, false)
    case 'tsv':
      return writeTable(value, true)
    case 'vcf':
      return writeContacts(rowsOf(value))
    case 'ics':
      return writeEvents(rowsOf(value))
  }
  throw new Error(`The data engine does not write ${format}`)
}

export function createDataEngine(): Engine {
  return {
    ...dataInfo,
    available: async () => true,
    // The parsers are small scripts that arrive with the first file that needs them.
    load: async () => {},
    async convert(input: ConvertInput): Promise<ConvertOutput[]> {
      throwIfAborted(input.signal)
      if (input.blob.size > MAX_DATA_BYTES) throw new Refusal('This file is too large to convert as data')
      let text: string
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(await input.blob.arrayBuffer())
      } catch {
        throw new Refusal('This file is not text in UTF-8, the encoding these formats use')
      }
      input.onProgress(0.2)

      let value: unknown
      try {
        value = plain(await read(input.from.id, text))
      } catch (error) {
        // A parser's own complaint is written for programmers. The file's format is what to say.
        throw error instanceof Refusal ? error : invalid(input.from.name)
      }
      throwIfAborted(input.signal)
      input.onProgress(0.6)

      const written = await write(input.to.id, value)
      input.onProgress(1)
      return [
        {
          name: outputName(input.name, input.to),
          format: input.to.id,
          blob: new Blob([written], { type: input.to.mime[0] }),
        },
      ]
    },
  }
}
