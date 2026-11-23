import { describe, expect, it } from 'vitest'
import { forwardingRules } from '../security-headers'

describe('what a copy of Omsett passes on to another server', () => {
  it('is nothing, unless the build is told of something', () => {
    expect(forwardingRules({ visitsSite: '', checker: '' })).toBe('')
  })

  it('counts visits through one rule that takes a small POST and nothing else', () => {
    const rules = forwardingRules({ visitsSite: 'omsett.com', checker: '' })
    expect(rules).toContain('location = /api/event {')
    expect(rules).toContain('limit_except POST { deny all; }')
    expect(rules).toContain('client_max_body_size 2k;')
    expect(rules).toContain('proxy_pass https://plausible.io/api/event;')
    expect(rules).toContain('proxy_ssl_verify on;')
    expect(rules).toContain('proxy_ssl_verify_depth 3;')
    expect(rules).toContain('proxy_set_header Cookie "";')
    expect(rules).not.toContain('/api/accessibility')
  })

  it('reaches the checker through three rules, each to one address', () => {
    const rules = forwardingRules({ visitsSite: '', checker: 'https://audit.icjia.app' })
    expect(rules.match(/^location = /gm)).toHaveLength(3)
    expect(rules).toContain('proxy_pass https://audit.icjia.app/api/health;')
    expect(rules).toContain('proxy_pass https://audit.icjia.app/api/analyze;')
    expect(rules).toContain('proxy_pass https://audit.icjia.app/api/reports;')
    expect(rules).toContain('client_max_body_size 26m;')
    expect(rules).toContain('proxy_set_header Authorization "";')
    expect(rules).not.toContain('/api/event')
  })

  it('writes nothing for a setting that is not a plain name or a plain https site', () => {
    for (const visitsSite of ['omsett.com; }', 'a b', 'https://omsett.com', '$host', 'x"y', 'x\ny']) expect(forwardingRules({ visitsSite, checker: '' })).toBe('')
    for (const checker of ['audit.icjia.app', 'http://audit.icjia.app', 'https://audit.icjia.app/x', 'https://a;b', 'https://$host', 'https://x y']) expect(forwardingRules({ visitsSite: '', checker })).toBe('')
  })

  it('every line it writes ends as an nginx line should, with its braces closed', () => {
    const rules = forwardingRules({ visitsSite: 'omsett.com', checker: 'https://audit.icjia.app' })
    for (const line of rules.split('\n').filter((l) => l.trim() !== '' && !l.startsWith('#'))) expect(line, line).toMatch(/[;{}]$/)
    expect(rules.split('{').length).toBe(rules.split('}').length)
  })
})
