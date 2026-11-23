import { Refusal } from '../util'

// Address books (vCard) and calendars (iCalendar). Both are lines of `NAME;PARAMETER=x:value`
// between BEGIN and END. Reading one gives rows, a contact or an event to a row, with plain
// column names; writing one starts from rows and looks for those columns under the names
// people and programs use for them.
//
// A value is never trusted to stay a value: on the way out every line break, comma and
// semicolon in it is escaped, so nothing in a cell can end one contact and begin another.

type Row = Record<string, string | boolean>

interface Line {
  /** Upper case, without any group in front: "item1.EMAIL" is EMAIL. */
  name: string
  params: Record<string, string>
  value: string
}

/** More of one thing than this is not kept: nobody has ten email addresses worth a column each. */
const MAX_REPEATS = 9
/** BEGIN inside BEGIN inside BEGIN: a calendar goes three deep at most. */
const MAX_DEPTH = 8

const invalid = (name: string) => new Refusal(`This file is not valid ${name}`)

/** `=C3=A9` and its kind, from the oldest vCards, read as UTF-8. */
function quotedPrintable(value: string): string {
  // Worked on as bytes, all at once: taken a character at a time, a long note took seconds.
  const source = new TextEncoder().encode(value)
  const out = new Uint8Array(source.length)
  const digit = (byte: number | undefined) =>
    byte === undefined ? -1 : byte >= 0x30 && byte <= 0x39 ? byte - 0x30 : (byte | 0x20) >= 0x61 && (byte | 0x20) <= 0x66 ? (byte | 0x20) - 0x57 : -1
  let length = 0
  for (let i = 0; i < source.length; i++) {
    const high = source[i] === 0x3D ? digit(source[i + 1]) : -1
    const low = high < 0 ? -1 : digit(source[i + 2])
    if (low >= 0) {
      out[length++] = high * 16 + low
      i += 2
    } else out[length++] = source[i]!
  }
  return new TextDecoder('utf-8').decode(out.subarray(0, length))
}

/** The lines of the file, with folded ones joined, each split into its three parts. */
function contentLines(text: string, name: string): Line[] {
  const raw = text.split(/\r\n|\r|\n/)
  const lines: Line[] = []
  for (let i = 0; i < raw.length; i++) {
    let whole = raw[i]!
    // A line that begins with a space or a tab is the rest of the line above.
    while (i + 1 < raw.length && /^[ \t]/.test(raw[i + 1]!)) whole += raw[++i]!.slice(1)
    if (whole.trim() === '') continue

    // The name and its parameters end at the first colon that is not inside quotes.
    let colon = -1
    let quoted = false
    for (let c = 0; c < whole.length; c++) {
      if (whole[c] === '"') quoted = !quoted
      else if (whole[c] === ':' && !quoted) {
        colon = c
        break
      }
    }
    if (colon <= 0) throw invalid(name)
    const [first, ...rest] = splitOutsideQuotes(whole.slice(0, colon), ';')
    const params: Record<string, string> = {}
    for (const param of rest) {
      const equals = param.indexOf('=')
      // The oldest files write a bare word, HOME or QUOTED-PRINTABLE, with no name before it.
      if (equals < 0) params[param.toUpperCase()] = ''
      else params[param.slice(0, equals).toUpperCase()] = param.slice(equals + 1).replace(/^"|"$/g, '')
    }
    let value = whole.slice(colon + 1)
    if ((params.ENCODING ?? '').toUpperCase() === 'QUOTED-PRINTABLE' || 'QUOTED-PRINTABLE' in params) {
      // Encoded this way, a line that ends in "=" goes on to the next.
      // Gathered and joined once: a value continued over eighty thousand lines is not copied for each.
      const parts = [value]
      while (parts.at(-1)!.endsWith('=') && i + 1 < raw.length) {
        parts[parts.length - 1] = parts.at(-1)!.slice(0, -1)
        parts.push(raw[++i]!)
      }
      value = parts.join('')
      value = quotedPrintable(value)
    }
    const dot = first!.lastIndexOf('.')
    lines.push({ name: first!.slice(dot + 1).toUpperCase(), params, value })
  }
  return lines
}

function splitOutsideQuotes(text: string, separator: string): string[] {
  const parts: string[] = []
  let current = ''
  let quoted = false
  for (const char of text) {
    if (char === '"') quoted = !quoted
    if (char === separator && !quoted) {
      parts.push(current)
      current = ''
    } else current += char
  }
  parts.push(current)
  return parts
}

/** A value split where a separator is not escaped, each part with its escapes undone. */
function parts(value: string, separator: string): string[] {
  const found: string[] = []
  let current = ''
  for (let i = 0; i < value.length; i++) {
    const char = value[i]!
    if (char === '\\' && i + 1 < value.length) {
      const next = value[++i]!
      current += next === 'n' || next === 'N' ? '\n' : next
    } else if (char === separator) {
      found.push(current)
      current = ''
    } else current += char
  }
  found.push(current)
  return found.map((part) => part.trim())
}
const plain = (value: string) => parts(value, '\u0000').join('')

/**
 * The lines between each BEGIN:KIND and its END, for the outermost components of that kind.
 * What is nested inside one (an alarm inside an event) is passed over.
 */
function components(lines: Line[], kind: string, name: string, inside?: string): Line[][] {
  const found: Line[][] = []
  const open: string[] = []
  let current: Line[] | null = null
  let currentDepth = 0
  for (const line of lines) {
    if (line.name === 'BEGIN') {
      const what = line.value.trim().toUpperCase()
      if (open.length >= MAX_DEPTH) throw invalid(name)
      // One of these inside another of these is not a thing either format has.
      if (what === kind && current) throw invalid(name)
      open.push(what)
      if (what === kind && (!inside || open.includes(inside))) {
        current = []
        currentDepth = open.length
      }
      continue
    }
    if (line.name === 'END') {
      if (open.pop() !== line.value.trim().toUpperCase()) throw invalid(name)
      if (current && open.length < currentDepth) {
        found.push(current)
        current = null
      }
      continue
    }
    if (open.length === 0) throw invalid(name)
    if (current && open.length === currentDepth) current.push(line)
  }
  // Still open at the end: the file stops before it finishes.
  if (open.length > 0) throw invalid(name)
  return found
}

/** email, email_2, email_3 … */
function numbered(row: Row, key: string, values: string[]): void {
  values
    .filter((value) => value !== '')
    .slice(0, MAX_REPEATS)
    .forEach((value, i) => (row[i === 0 ? key : `${key}_${i + 1}`] = value))
}

// --- vCard -------------------------------------------------------------------------------------

const CONTACT_COLUMNS = ['name', 'given_name', 'family_name', 'nickname', 'organization', 'department', 'title']

export function readContacts(text: string): Row[] {
  const lines = contentLines(text, 'vCard')
  const cards = components(lines, 'VCARD', 'vCard')
  if (cards.length === 0) throw new Refusal('This file has no contacts in it')
  return cards.map((card) => {
    const all = (name: string) => card.filter((line) => line.name === name).map((line) => line.value)
    const first = (name: string) => all(name)[0] ?? ''
    const [family = '', given = ''] = parts(first('N'), ';')
    const [organization = '', department = ''] = parts(first('ORG'), ';')
    const written = plain(first('FN'))
    const row: Row = {
      // A card with no display name is named for its person, or failing that its company.
      name: written || [given, family].filter(Boolean).join(' ') || organization,
      given_name: given,
      family_name: family,
      nickname: plain(first('NICKNAME')),
      organization,
      department,
      title: plain(first('TITLE')),
    }
    numbered(row, 'email', all('EMAIL').map(plain))
    numbered(row, 'phone', all('TEL').map((value) => plain(value).replace(/^tel:/i, '')))
    // An address is seven parts, most of them usually empty. Written as one line.
    numbered(row, 'address', all('ADR').map((value) => parts(value, ';').filter(Boolean).join(', ')))
    numbered(row, 'url', all('URL').map(plain))
    const born = plain(first('BDAY'))
    row.birthday = /^\d{8}$/.test(born) ? `${born.slice(0, 4)}-${born.slice(4, 6)}-${born.slice(6)}` : born
    row.note = plain(first('NOTE'))
    return Object.fromEntries(Object.entries(row).filter(([key, value]) => CONTACT_COLUMNS.includes(key) || value !== ''))
  })
}

/** "E-mail 1 - Value" and "email_1_value" are the same column. */
const normal = (key: string) =>
  key
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

const CONTACT_KEYS: Record<string, RegExp> = {
  name: /^(?:name|full name|display name|fn)$/,
  given: /^(?:given name|first name|given|first)$/,
  family: /^(?:family name|last name|surname|family|last)$/,
  nickname: /^nickname$/,
  organization: /^(?:organi[sz]ation|company|org)(?: \d+)?(?: name)?$/,
  department: /^(?:department|organi[sz]ation(?: \d+)? department)$/,
  title: /^(?:title|job title|organi[sz]ation(?: \d+)? title)$/,
  email: /^e ?mail(?: address)?(?: \d+)?(?: value)?$/,
  phone: /^(?:(?:mobile|home|work|business|cell|other|primary) )?(?:phone|tel|telephone|mobile|cell)(?: number)?(?: \d+)?(?: value)?$/,
  address: /^(?:(?:home|work|business) )?address(?: \d+)?(?: formatted)?$/,
  url: /^(?:url|website|web page|web site)(?: \d+)?(?: value)?$/,
  birthday: /^(?:birthday|bday|date of birth)$/,
  note: /^notes?$/,
}

/** What a row holds under each kind of column, in the order the columns come. */
function gather(row: unknown, keys: Record<string, RegExp>): Record<string, string[]> {
  const found: Record<string, string[]> = Object.fromEntries(Object.keys(keys).map((key) => [key, []]))
  if (typeof row !== 'object' || row === null || Array.isArray(row)) return found
  for (const [column, cell] of Object.entries(row)) {
    const kind = Object.keys(keys).find((key) => keys[key]!.test(normal(column)))
    if (!kind) continue
    // A list of plain values (several emails, in JSON) counts as that many.
    for (const value of Array.isArray(cell) ? cell : [cell]) {
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        const words = String(value).trim()
        if (words !== '') found[kind]!.push(words)
      }
    }
  }
  return found
}

/** Text made safe to be one value: nothing in it can end the line or the property. */
function escaped(value: string, list = false): string {
  let out = ''
  for (const char of value.replace(/\r\n|\r/g, '\n')) {
    const code = char.codePointAt(0)!
    if (char === '\n') out += '\\n'
    else if (char === '\\' || char === ';' || (char === ',' && !list)) out += `\\${char}`
    // Three characters beyond the usual two end a line for some readers of these files.
    else if (code === 0x85 || code === 0x2028 || code === 0x2029) out += ' '
    else if (code >= 0x20 && code !== 0x7F) out += char
    else if (char === '\t') out += ' '
  }
  return out
}

/** One property, folded so that no line is longer than 75 bytes, as both formats ask. */
function property(name: string, value: string): string {
  const line = `${name}:${value}`
  const encoder = new TextEncoder()
  const out: string[] = []
  let current = ''
  let bytes = 0
  for (const char of line) {
    const size = encoder.encode(char).length
    if (bytes + size > (out.length === 0 ? 75 : 74)) {
      out.push(current)
      current = ''
      bytes = 0
    }
    current += char
    bytes += size
  }
  out.push(current)
  return out.join('\r\n ')
}

export function writeContacts(rows: unknown[]): string {
  const cards: string[] = []
  for (const row of rows) {
    const has = gather(row, CONTACT_KEYS)
    const one = (key: string) => has[key]![0] ?? ''
    const person = [one('given'), one('family')].filter(Boolean).join(' ')
    const name = one('name') || person || one('organization') || one('email') || one('phone')
    // A row with nobody in it is not a contact.
    if (name === '') continue
    const lines = ['BEGIN:VCARD', 'VERSION:3.0', property('FN', escaped(name))]
    // With no given and family name to go on, the whole name is the best there is.
    lines.push(property('N', `${escaped(one('family'))};${escaped(one('given') || (one('family') ? '' : name))};;;`))
    if (one('nickname')) lines.push(property('NICKNAME', escaped(one('nickname'))))
    if (one('organization')) {
      lines.push(property('ORG', [one('organization'), one('department')].filter(Boolean).map((part) => escaped(part)).join(';')))
    }
    if (one('title')) lines.push(property('TITLE', escaped(one('title'))))
    for (const email of has.email!.slice(0, MAX_REPEATS)) lines.push(property('EMAIL;TYPE=INTERNET', escaped(email)))
    for (const phone of has.phone!.slice(0, MAX_REPEATS)) lines.push(property('TEL', escaped(phone)))
    // The whole address goes where the street goes: one line cannot be taken apart reliably.
    for (const address of has.address!.slice(0, MAX_REPEATS)) lines.push(property('ADR', `;;${escaped(address)};;;;`))
    for (const url of has.url!.slice(0, MAX_REPEATS)) lines.push(property('URL', escaped(url)))
    if (/^\d{4}-\d{2}-\d{2}$/.test(one('birthday'))) lines.push(property('BDAY', one('birthday')))
    if (one('note')) lines.push(property('NOTE', escaped(has.note!.join('\n'))))
    lines.push('END:VCARD')
    cards.push(lines.join('\r\n'))
  }
  if (cards.length === 0) {
    throw new Refusal('No contacts found. A contact needs a column called name, email or phone')
  }
  return `${cards.join('\r\n')}\r\n`
}

// --- iCalendar ---------------------------------------------------------------------------------

const DATE = /^(\d{4})(\d{2})(\d{2})$/
const DATE_TIME = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/i

/** 20261123T140000Z → 2026-11-23T14:00:00Z. A date alone is a whole day. */
function readMoment(value: string): { text: string; allDay: boolean } | null {
  const trimmed = value.trim()
  const day = DATE.exec(trimmed)
  if (day) return { text: `${day[1]}-${day[2]}-${day[3]}`, allDay: true }
  const time = DATE_TIME.exec(trimmed)
  if (!time) return null
  return { text: `${time[1]}-${time[2]}-${time[3]}T${time[4]}:${time[5]}:${time[6]}${time[7] ? 'Z' : ''}`, allDay: false }
}

export function readEvents(text: string): Row[] {
  const lines = contentLines(text, 'iCalendar')
  if (lines[0]?.name !== 'BEGIN' || lines[0].value.trim().toUpperCase() !== 'VCALENDAR') throw invalid('iCalendar')
  const events = components(lines, 'VEVENT', 'iCalendar', 'VCALENDAR')
  if (events.length === 0) throw new Refusal('This file has no events in it')
  return events.map((event) => {
    const line = (name: string) => event.find((entry) => entry.name === name)
    const words = (name: string) => plain(line(name)?.value ?? '')
    const start = line('DTSTART')
    const begins = start ? readMoment(start.value) : null
    // An event with no start, or one that is not a date, is not an event that can be shown.
    if (!begins) throw invalid('iCalendar')
    const end = line('DTEND')
    const ends = end ? readMoment(end.value) : null
    if (end && !ends) throw invalid('iCalendar')
    const row: Row = {
      summary: words('SUMMARY'),
      start: begins.text,
      end: ends?.text ?? '',
      all_day: begins.allDay,
      timezone: start?.params.TZID ?? '',
      location: words('LOCATION'),
      description: words('DESCRIPTION'),
      url: words('URL'),
      status: words('STATUS'),
      organizer: words('ORGANIZER').replace(/^mailto:/i, ''),
      attendees: event
        .filter((entry) => entry.name === 'ATTENDEE')
        .slice(0, 500)
        .map((entry) => plain(entry.value).replace(/^mailto:/i, ''))
        .join('; '),
      // How long, for an event that says that and not when it ends: "PT1H".
      duration: words('DURATION'),
      // The rule a repeating event repeats by, as the file wrote it: "FREQ=WEEKLY;BYDAY=MO".
      repeats: line('RRULE')?.value.trim() ?? '',
      uid: words('UID'),
    }
    return row
  })
}

const EVENT_KEYS: Record<string, RegExp> = {
  summary: /^(?:summary|title|subject|event|event name)$/,
  start: /^(?:start|start date|starts|begins|date|dtstart|start time)$/,
  end: /^(?:end|end date|ends|finishes|dtend|end time)$/,
  timezone: /^(?:timezone|time zone|tzid)$/,
  location: /^(?:location|place|where)$/,
  description: /^(?:description|details|notes?)$/,
  url: /^(?:url|link|website)$/,
  status: /^status$/,
  organizer: /^organi[sz]er$/,
  repeats: /^(?:repeats|rrule|recurrence)$/,
  uid: /^(?:uid|id)$/,
}

const WRITTEN = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(Z)?)?$/i

/** 2026-11-23, 2026-11-23 14:30, 2026-11-23T14:30:00Z, or the calendar's own compact form. */
function writeMoment(value: string): { text: string; allDay: boolean } | null {
  const trimmed = value.trim()
  const compact = readMoment(trimmed)
  const m = WRITTEN.exec(compact ? compact.text : trimmed)
  if (!m) return null
  const [month, day, hour, minute, second] = [m[2], m[3], m[4] ?? '00', m[5] ?? '00', m[6] ?? '00'].map(Number)
  if (month! < 1 || month! > 12 || day! < 1 || day! > 31 || hour! > 23 || minute! > 59 || second! > 60) return null
  if (m[4] === undefined) return { text: `${m[1]}${m[2]}${m[3]}`, allDay: true }
  return { text: `${m[1]}${m[2]}${m[3]}T${m[4]}${m[5]}${m[6] ?? '00'}${m[7] ? 'Z' : ''}`, allDay: false }
}

const BAD_DATE = 'An event has a date Omsett cannot read. Write dates as 2026-11-23 or 2026-11-23 14:30'

/** A short, stable name for an event that came without one of its own. */
function fingerprint(text: string): string {
  let hash = 0x811C_9DC5
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x0100_0193) >>> 0
  return hash.toString(16).padStart(8, '0')
}

/**
 * @param rows the rows, each to become an event if it has what an event needs
 * @param now the moment of writing, which every event must carry. Passed in, so that the same
 *            rows can be shown to give the same file.
 */
export function writeEvents(rows: unknown[], now = new Date()): string {
  const stamp = `${now.toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`
  const events: string[] = []
  rows.forEach((row, index) => {
    const has = gather(row, EVENT_KEYS)
    const one = (key: string) => has[key]![0] ?? ''
    // A row with neither a name nor a start is not an event, and is passed over.
    if (one('summary') === '' && one('start') === '') return
    const start = writeMoment(one('start'))
    const end = one('end') === '' ? null : writeMoment(one('end'))
    if (!start || (one('end') !== '' && !end)) throw new Refusal(BAD_DATE)
    // A time zone's name goes into the file as a parameter, so it is held to what a name is.
    const zone = /^[\w+/-]{1,64}$/.test(one('timezone')) && !start.text.endsWith('Z') && !start.allDay ? `;TZID=${one('timezone')}` : ''
    const when = (moment: { text: string; allDay: boolean }) => (moment.allDay ? ';VALUE=DATE' : zone)
    const lines = [
      'BEGIN:VEVENT',
      property('UID', escaped(one('uid') || `${fingerprint(`${one('summary')}|${start.text}|${index}`)}-${index}@omsett`)),
      `DTSTAMP:${stamp}`,
      `DTSTART${when(start)}:${start.text}`,
    ]
    if (end) lines.push(`DTEND${when(end)}:${end.text}`)
    lines.push(property('SUMMARY', escaped(one('summary'))))
    if (one('location')) lines.push(property('LOCATION', escaped(one('location'))))
    if (one('description')) lines.push(property('DESCRIPTION', escaped(has.description!.join('\n'))))
    if (one('url')) lines.push(property('URL', escaped(one('url'))))
    if (/^(?:TENTATIVE|CONFIRMED|CANCELLED)$/i.test(one('status'))) lines.push(`STATUS:${one('status').toUpperCase()}`)
    if (/^[^\s,:;][^\s,:;@]*@[^\s,:;]+$/.test(one('organizer'))) lines.push(property('ORGANIZER', `mailto:${one('organizer')}`))
    // A rule for repeating is a list of NAME=VALUE; anything else is not written as one.
    if (/^[A-Z]+=[\w,+-]+(?:;[A-Z]+=[\w,+-]+)*$/.test(one('repeats'))) lines.push(property('RRULE', one('repeats')))
    lines.push('END:VEVENT')
    events.push(lines.join('\r\n'))
  })
  if (events.length === 0) {
    throw new Refusal('No events found. An event needs a column called summary (or title) and one called start')
  }
  return `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Omsett//EN\r\nCALSCALE:GREGORIAN\r\n${events.join('\r\n')}\r\nEND:VCALENDAR\r\n`
}
