import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadAudits, renderReadmeBlock, renderSecurityMd, root, SEVERITIES, withReadmeBlock } from './security-docs'

const audits = loadAudits()

describe('security audit record', () => {
  it('is newest first', () => {
    const dates = audits.map((a) => a.date)
    expect(dates).toEqual([...dates].sort().reverse())
  })

  it('gives every finding a severity, a status, and something written under each heading', () => {
    for (const audit of audits) {
      expect(audit.findings.length, audit.id).toBeGreaterThan(0)
      for (const finding of audit.findings) {
        expect(finding.id, audit.id).toMatch(/^OMS-\d{3}$/)
        expect(SEVERITIES, finding.id).toContain(finding.severity)
        expect(['fixed', 'open', 'accepted'], finding.id).toContain(finding.status)
        expect(finding.identification.join(' ').length, `${finding.id} identification`).toBeGreaterThan(80)
        expect(finding.mitigation.join(' ').length, `${finding.id} mitigation`).toBeGreaterThan(40)
        expect(finding.verification.length, `${finding.id} verification`).toBeGreaterThan(0)
      }
    }
  })

  it('never reuses an id within one audit', () => {
    for (const audit of audits) {
      const ids = audit.findings.map((f) => f.id)
      expect(new Set(ids).size, audit.id).toBe(ids.length)
    }
  })

  it('matches SECURITY.md (run `pnpm security:docs` after editing audits.json)', () => {
    expect(readFileSync(join(root, 'SECURITY.md'), 'utf8')).toBe(renderSecurityMd(audits))
  })

  it('matches the Security section of README.md (run `pnpm security:docs`)', () => {
    const readme = readFileSync(join(root, 'README.md'), 'utf8')
    expect(withReadmeBlock(readme, renderReadmeBlock(audits))).toBe(readme)
  })
})
