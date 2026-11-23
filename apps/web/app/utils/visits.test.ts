import { describe, expect, it } from 'vitest'
import { isSiteName, visitCounting, visitReport } from './visits'

const base = { site: 'omsett.com', stored: null, doNotTrack: false, privacyControl: false }

describe('whether a visit is counted', () => {
  it('is, by default, where this copy of Omsett is set up to', () => {
    expect(visitCounting(base)).toBe('on')
    expect(visitCounting({ ...base, stored: 'on' })).toBe('on')
  })

  it('is not, where the copy is not set up to: no setting can turn it on', () => {
    expect(visitCounting({ ...base, site: '' })).toBe('not-set-up')
    expect(visitCounting({ ...base, site: '', stored: 'on' })).toBe('not-set-up')
  })

  it('is not, once the visitor has turned it off', () => {
    expect(visitCounting({ ...base, stored: 'off' })).toBe('off-by-choice')
  })

  it('is not, where the browser asks not to be tracked, whatever is stored', () => {
    expect(visitCounting({ ...base, doNotTrack: true })).toBe('off-by-browser')
    expect(visitCounting({ ...base, privacyControl: true, stored: 'on' })).toBe('off-by-browser')
  })

  it('takes only a plain site name for a setting', () => {
    expect(isSiteName('omsett.com')).toBe(true)
    const tab = String.fromCodePoint(9)
    for (const not of ['https://plausible.io/js/x.js', '//evil.example', `/${tab}/evil.example/x.js`, '/js/x.js', 'omsett.com/x', 'a b', '', '.', 'omsett.com.', '<script>', 'x"y']) {
      expect(isSiteName(not), JSON.stringify(not)).toBe(false)
      expect(visitCounting({ ...base, site: not })).toBe('not-set-up')
    }
  })
})

describe('what is reported about a visit', () => {
  it('is that a page was opened, which, and from where; and nothing else', () => {
    expect(visitReport('omsett.com', 'https://omsett.com', '/about', 'https://example.org/')).toEqual({
      name: 'pageview',
      domain: 'omsett.com',
      url: 'https://omsett.com/about',
      referrer: 'https://example.org/',
    })
    expect(Object.keys(visitReport('omsett.com', 'https://omsett.com', '/', ''))).toEqual(['name', 'domain', 'url', 'referrer'])
  })
})
