import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { Refusal } from '../util'
import { readContacts, readEvents, writeContacts, writeEvents } from './cards'

const fixture = async (path: string) => readFile(new URL(`../../../../fixtures/${path}`, import.meta.url), 'utf8')
const refusal = (work: () => unknown) => {
  try {
    work()
    return null
  } catch (error) {
    return error instanceof Refusal ? error.message : `not a Refusal: ${String(error)}`
  }
}
const card = (...lines: string[]) => ['BEGIN:VCARD', 'VERSION:3.0', ...lines, 'END:VCARD', ''].join('\r\n')
const NOW = new Date('2026-11-23T12:00:00Z')

describe('address books', () => {
  it('reads contacts from three generations of vCard into plain columns', async () => {
    const [ada, grace, katherine] = readContacts(await fixture('vcf/sample.vcf'))
    expect(ada).toEqual({
      name: 'Ada Lovelace',
      given_name: 'Ada',
      family_name: 'Lovelace',
      nickname: '',
      organization: 'Analytical Engines',
      department: 'Research',
      title: 'Mathematician',
      email: 'ada@example.org',
      email_2: 'countess@example.org',
      phone: '+44 20 7946 0000',
      address: "12 St James's Square, London, SW1Y 4JH, United Kingdom",
      url: 'https://example.org/ada',
      birthday: '1815-12-10',
      note: 'Wrote the first published program, for a machine that was never built.\nSecond line; with a semicolon.',
    })
    // The oldest form: bare words for parameters, and accents written as =C3=A9 across two lines.
    expect(grace).toMatchObject({ name: 'Grace Hopper', phone: '+1 555 0100', email: 'grace@example.org', note: 'Café at noon\r\nFound the first bug' })
    // The newest: a group in front of the name, a phone written as a link, a date with no dashes.
    expect(katherine).toMatchObject({ name: '字幕 Katherine Johnson', email: 'katherine@example.org', phone: '+1-555-0101', birthday: '1918-08-26' })
    expect(JSON.stringify([ada, grace, katherine]).includes('iVBOR')).toBe(false)
  })

  it('writes contacts from the column names people and programs use', () => {
    const vcf = writeContacts([
      { 'First Name': 'Ada', 'Last Name': 'Lovelace', 'E-mail Address': 'ada@example.org', 'Mobile Phone': '+44 1', Company: 'Engines', Notes: 'a note', shoe_size: 5 },
      { Name: 'Grace Hopper', 'E-mail 1 - Value': 'g@example.org', 'E-mail 2 - Value': 'h@example.org', 'Phone 1 - Value': '555' },
      { email: ['one@example.org', 'two@example.org'] },
      { shoe_size: 9 },
    ])
    expect(vcf).toBe(
      [
        card('FN:Ada Lovelace', 'N:Lovelace;Ada;;;', 'ORG:Engines', 'EMAIL;TYPE=INTERNET:ada@example.org', 'TEL:+44 1', 'NOTE:a note'),
        card('FN:Grace Hopper', 'N:;Grace Hopper;;;', 'EMAIL;TYPE=INTERNET:g@example.org', 'EMAIL;TYPE=INTERNET:h@example.org', 'TEL:555'),
        card('FN:one@example.org', 'N:;one@example.org;;;', 'EMAIL;TYPE=INTERNET:one@example.org', 'EMAIL;TYPE=INTERNET:two@example.org'),
      ].join(''),
    )
  })

  it('reads back what it writes', async () => {
    const contacts = readContacts(await fixture('vcf/sample.vcf'))
    const again = readContacts(writeContacts(contacts))
    const shape = (row: Record<string, unknown>) => [row.name, row.email, row.phone, String(row.note ?? '').replace('\r\n', '\n')]
    expect(again.map(shape)).toEqual(contacts.map(shape))
  })

  it('lets nothing in a cell end one contact and begin another', () => {
    const vcf = writeContacts([{ name: 'Mallory\r\nEND:VCARD\r\nBEGIN:VCARD\r\nFN:Injected', email: 'm@example.org\nTEL:999', note: 'a;b,c\\d' }])
    const back = readContacts(vcf)
    expect(back).toHaveLength(1)
    expect(back[0]).toMatchObject({ name: 'Mallory\nEND:VCARD\nBEGIN:VCARD\nFN:Injected', email: 'm@example.org\nTEL:999', note: 'a;b,c\\d' })
    expect(back[0]!.phone).toBeUndefined()
  })

  it('folds long lines at 75 bytes without cutting a character in two', () => {
    const vcf = writeContacts([{ name: 'A', note: '字幕'.repeat(60) }])
    for (const line of vcf.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75)
    expect(readContacts(vcf)[0]!.note).toBe('字幕'.repeat(60))
  })

  it('refuses what is not an address book', () => {
    expect(refusal(() => readContacts('BEGIN:VCARD\r\nFN:Ada\r\n'))).toBe('This file is not valid vCard')
    expect(refusal(() => readContacts('BEGIN:VCARD\r\nBEGIN:VCARD\r\nFN:Ada\r\nEND:VCARD\r\nEND:VCARD\r\n'))).toBe('This file is not valid vCard')
    expect(refusal(() => readContacts('BEGIN:VCARD\r\nFN:Ada\r\nEND:VCALENDAR\r\n'))).toBe('This file is not valid vCard')
    expect(refusal(() => readContacts('BEGIN:VCARD\r\na line with no colon\r\nEND:VCARD\r\n'))).toBe('This file is not valid vCard')
    expect(refusal(() => readContacts('FN:Ada\r\n'))).toBe('This file is not valid vCard')
    expect(refusal(() => readContacts(`${'BEGIN:X\r\n'.repeat(20)}`))).toBe('This file is not valid vCard')
    expect(refusal(() => readContacts('BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n'))).toBe('This file has no contacts in it')
    expect(refusal(() => writeContacts([{ colour: 'red' }, 'words', null]))).toBe('No contacts found. A contact needs a column called name, email or phone')
  })

  it('keeps at most nine of anything, however many a card lists', () => {
    const many = card('FN:Ada', ...Array.from({ length: 5000 }, (_, i) => `EMAIL:a${i}@example.org`))
    const [row] = readContacts(many)
    expect(Object.keys(row!).filter((key) => key.startsWith('email'))).toHaveLength(9)
  })
})

describe('calendars', () => {
  it('reads events into plain columns, and passes over what is not an event', async () => {
    const events = readEvents(await fixture('ics/sample.ics'))
    expect(events).toHaveLength(3)
    expect(events[0]).toEqual({
      summary: 'Planning meeting, room 4',
      start: '2026-11-23T09:00:00',
      end: '2026-11-23T10:00:00',
      all_day: false,
      timezone: 'America/Chicago',
      location: 'Springfield; second floor',
      description: 'Bring the roadmap.\nAnd the list of formats that are still to do.',
      url: '',
      status: 'CONFIRMED',
      organizer: 'ada@example.org',
      attendees: 'grace@example.org; katherine@example.org',
      duration: '',
      repeats: 'FREQ=WEEKLY;BYDAY=MO',
      uid: '1@example.org',
    })
    expect(events[1]).toMatchObject({ summary: 'Holiday 字幕', start: '2026-12-25', end: '2026-12-26', all_day: true })
    expect(events[2]).toMatchObject({ summary: 'Release', start: '2027-01-04T15:00:00Z', end: '', duration: 'PT1H' })
  })

  it('writes events from rows, the same file for the same rows', () => {
    const rows = [
      { Title: 'Planning, room 4', Start: '2026-11-23 09:00', End: '2026-11-23 10:00', 'Time zone': 'America/Chicago', Where: 'Springfield' },
      { summary: 'Holiday', start: '2026-12-25' },
      { subject: 'Release', start: '2027-01-04T15:00:00Z', repeats: 'FREQ=YEARLY', status: 'confirmed', organizer: 'ada@example.org' },
      { colour: 'red' },
    ]
    const ics = writeEvents(rows, NOW)
    expect(ics).toBe(writeEvents(rows, NOW))
    expect(ics).toContain('DTSTART;TZID=America/Chicago:20261123T090000\r\nDTEND;TZID=America/Chicago:20261123T100000\r\nSUMMARY:Planning\\, room 4\r\nLOCATION:Springfield')
    expect(ics).toContain('DTSTART;VALUE=DATE:20261225\r\nSUMMARY:Holiday')
    expect(ics).toContain('DTSTART:20270104T150000Z\r\nSUMMARY:Release\r\nSTATUS:CONFIRMED\r\nORGANIZER:mailto:ada@example.org\r\nRRULE:FREQ=YEARLY')
    expect(ics.match(/DTSTAMP:20261123T120000Z/g)).toHaveLength(3)
    expect(readEvents(ics).map((event) => event.summary)).toEqual(['Planning, room 4', 'Holiday', 'Release'])
  })

  it('lets nothing in a cell become a line of its own', () => {
    const ics = writeEvents(
      [{ summary: 'x\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nSUMMARY:Injected', start: '2026-01-01', timezone: 'Europe/Oslo:20260101\r\nX-EVIL', repeats: 'FREQ=DAILY\r\nATTACH:http://elsewhere.example', organizer: 'a@b\r\nX:1', status: 'CONFIRMED\r\nX:1' }],
      NOW,
    )
    const events = readEvents(ics)
    expect(events).toHaveLength(1)
    expect(events[0]!.summary).toBe('x\nEND:VEVENT\nBEGIN:VEVENT\nSUMMARY:Injected')
    expect(ics.includes('X-EVIL')).toBe(false)
    expect(ics.includes('ATTACH')).toBe(false)
    expect(ics.includes('X:1')).toBe(false)
  })

  it('refuses a date it would have to guess at', () => {
    for (const start of ['11/12/2026', 'next Tuesday', '2026-13-01', '2026-11-23 25:00', '']) {
      expect(refusal(() => writeEvents([{ summary: 'x', start }], NOW)), start).toBe(
        'An event has a date Omsett cannot read. Write dates as 2026-11-23 or 2026-11-23 14:30',
      )
    }
  })

  it('refuses what is not a calendar', () => {
    const event = 'BEGIN:VEVENT\r\nDTSTART:20260101\r\nSUMMARY:x\r\nEND:VEVENT\r\n'
    expect(refusal(() => readEvents(`BEGIN:VCALENDAR\r\n${event}`))).toBe('This file is not valid iCalendar')
    expect(refusal(() => readEvents(event))).toBe('This file is not valid iCalendar')
    expect(refusal(() => readEvents('BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nSUMMARY:no start\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n'))).toBe('This file is not valid iCalendar')
    expect(refusal(() => readEvents('BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART:tomorrow\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n'))).toBe('This file is not valid iCalendar')
    expect(refusal(() => readEvents('BEGIN:VCALENDAR\r\nBEGIN:VTODO\r\nSUMMARY:x\r\nEND:VTODO\r\nEND:VCALENDAR\r\n'))).toBe('This file has no events in it')
    expect(refusal(() => writeEvents([{ name: 'Ada' }], NOW))).toBe('No events found. An event needs a column called summary (or title) and one called start')
  })
})
