import { describe, expect, it } from 'vitest'
import { ownOrigin, visitCounting } from './visits'

const base = { script: '/js/count.js', stored: null, doNotTrack: false, privacyControl: false }

describe('whether a visit is counted', () => {
  it('is, by default, where this copy of Omsett is set up to', () => {
    expect(visitCounting(base)).toBe('on')
    expect(visitCounting({ ...base, stored: 'on' })).toBe('on')
  })

  it('is not, where the copy is not set up to: no setting can turn it on', () => {
    expect(visitCounting({ ...base, script: '' })).toBe('not-set-up')
    expect(visitCounting({ ...base, script: '', stored: 'on' })).toBe('not-set-up')
  })

  it('is not, once the visitor has turned it off', () => {
    expect(visitCounting({ ...base, stored: 'off' })).toBe('off-by-choice')
  })

  it('is not, where the browser asks not to be tracked, whatever is stored', () => {
    expect(visitCounting({ ...base, doNotTrack: true })).toBe('off-by-browser')
    expect(visitCounting({ ...base, privacyControl: true, stored: 'on' })).toBe('off-by-browser')
  })

  it('never loads a script from another site, however it is spelled', () => {
    expect(ownOrigin('/js/pa-abc.js')).toBe(true)
    for (const elsewhere of ['https://plausible.io/js/x.js', '//plausible.io/js/x.js', '/\\\\plausible.io/x.js', 'js/x.js', '', '/', 'javascript:alert(1)', 'data:text/javascript,1']) {
      expect(ownOrigin(elsewhere), elsewhere).toBe(false)
      expect(visitCounting({ ...base, script: elsewhere })).toBe('not-set-up')
    }
  })
})
