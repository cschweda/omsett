import { describe, expect, it } from 'vitest'
import { checkerMaker, checkerSite, failureReason, readVerdict, reportAddress } from './accessibility'

describe('the accessibility checker', () => {
  it('is set up only by a plain https site', () => {
    expect(checkerSite('https://audit.icjia.app')).toEqual({ origin: 'https://audit.icjia.app', host: 'audit.icjia.app' })
    for (const not of ['', 'audit.icjia.app', 'http://audit.icjia.app', 'https://audit.icjia.app/', 'https://audit.icjia.app/x', 'https://a b', 'https://user@host', 'https://host:8443', 'javascript:alert(1)', 'https://']) {
      expect(checkerSite(not), JSON.stringify(not)).toBeNull()
    }
  })

  it('is believed only about a score and a grade that read as one', () => {
    expect(readVerdict({ overallScore: 82.4, grade: 'B', anything: '<script>' })).toEqual({ score: 82, grade: 'B' })
    expect(readVerdict({ overallScore: 100, grade: 'A+' })).toEqual({ score: 100, grade: 'A+' })
    for (const not of [null, 'x', {}, { overallScore: '82', grade: 'B' }, { overallScore: 182, grade: 'B' }, { overallScore: Number.NaN, grade: 'B' }, { overallScore: 82, grade: '<b>' }, { overallScore: 82, grade: 'ZZ' }]) {
      expect(readVerdict(not), JSON.stringify(not)).toBeNull()
    }
  })

  it('links to a report only by an id that is one', () => {
    const id = 'a'.repeat(32)
    expect(reportAddress('https://audit.icjia.app', id)).toBe(`https://audit.icjia.app/report/${id}`)
    for (const not of ['', 'abc', `${'a'.repeat(31)}/`, `../${'a'.repeat(29)}`, 12, null, `${'A'.repeat(32)}`]) expect(reportAddress('https://audit.icjia.app', not)).toBeNull()
  })

  it('says who is behind a checker only where that is known', () => {
    expect(checkerMaker('audit.icjia.app')).toBe('It is written by the same author as Omsett, Christopher Schweda.')
    expect(checkerMaker('checker.example')).toBeNull()
    expect(checkerMaker('constructor')).toBeNull()
  })

  it('says why a check did not happen', () => {
    expect(failureReason(413)).toMatch(/larger than the checker takes/)
    expect(failureReason(429)).toMatch(/Try again in a while/)
    expect(failureReason(503)).toMatch(/busy/)
    expect(failureReason(400)).toMatch(/could not read this file/)
    expect(failureReason(0)).toMatch(/did not answer/)
  })
})
