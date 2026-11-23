import type { Format } from '../types'

export const ics: Format = {
  id: 'ics',
  name: 'iCalendar',
  category: 'data',
  extensions: ['ics', 'ical'],
  mime: ['text/calendar'],
  detect: ['ics'],
  explain:
    'An iCalendar file holds calendar events. Google Calendar, Outlook and Apple Calendar all export and import it, and an invitation sent by email is one.',
  lossy: 'never',
  traits: [],
}
