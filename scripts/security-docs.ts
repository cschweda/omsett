// Writes SECURITY.md and the Security section of README.md from security/audits.json.
//
//     pnpm security:docs
//
// scripts/security-docs.test.ts fails when either file is out of date, so the audit record, the
// site's Security page, and these two files always say the same thing.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface Finding {
  id: string
  title: string
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info'
  status: 'fixed' | 'open' | 'accepted'
  area: string
  identification: string[]
  mitigation: string[]
  verification: string
}
export interface Audit {
  id: string
  date: string
  title: string
  summary: string
  scope: string[]
  method: string[]
  held: string[]
  findings: Finding[]
}

export const root = join(dirname(fileURLToPath(import.meta.url)), '..')
export const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'] as const
export const SEVERITY_MEANING: Record<Finding['severity'], string> = {
  critical: 'A visitor’s files or device can be compromised with no unusual action on their part.',
  high: 'The app gives a wrong result as if it were right, or the site is unavailable.',
  medium: 'Something private can leak, or the app can be made unusable, under conditions an attacker can arrange.',
  low: 'A weakness that needs unusual circumstances, or whose effect is small.',
  info: 'Not a weakness in itself. Recorded so the reasoning is on file.',
}
const STATUS_WORD: Record<Finding['status'], string> = { fixed: 'Fixed', open: 'Open', accepted: 'Accepted' }

export const loadAudits = (): Audit[] =>
  JSON.parse(readFileSync(join(root, 'security', 'audits.json'), 'utf8')) as Audit[]

const capital = (word: string) => word[0]!.toUpperCase() + word.slice(1)
export function longDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number) as [number, number, number]
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  return `${day} ${months[month - 1]} ${year}`
}
export function tally(audit: Audit) {
  const count = (status: Finding['status']) => audit.findings.filter((f) => f.status === status).length
  const bySeverity = SEVERITIES.map((s) => [s, audit.findings.filter((f) => f.severity === s).length] as const).filter(
    ([, n]) => n > 0,
  )
  return {
    total: audit.findings.length,
    fixed: count('fixed'),
    open: count('open'),
    accepted: count('accepted'),
    severities: bySeverity.map(([s, n]) => `${n} ${s}`).join(', '),
  }
}

const bullets = (items: string[]) => items.map((item) => `- ${item}`).join('\n')
const paragraphs = (items: string[]) => items.join('\n\n')
const findingsTable = (audit: Audit) =>
  [
    '| ID | Severity | Finding | Status |',
    '| --- | --- | --- | --- |',
    ...audit.findings.map((f) => `| ${f.id} | ${capital(f.severity)} | ${f.title} | ${STATUS_WORD[f.status]} |`),
  ].join('\n')

export function renderSecurityMd(audits: Audit[]): string {
  const audit = (a: Audit, index: number) => {
    const t = tally(a)
    return [
      // GitHub renders <details>. The newest audit is open; the older ones are collapsed.
      `<details${index === 0 ? ' open' : ''}>`,
      `<summary><strong>${longDate(a.date)}: ${a.title}</strong> (${t.total} findings: ${t.severities}; ${t.fixed} fixed, ${t.open} open, ${t.accepted} accepted)</summary>`,
      '',
      a.summary,
      '',
      '**Scope**',
      '',
      bullets(a.scope),
      '',
      '**Method**',
      '',
      bullets(a.method),
      '',
      '**What held**',
      '',
      bullets(a.held),
      '',
      '**Findings**',
      '',
      findingsTable(a),
      '',
      ...a.findings.flatMap((f) => [
        `#### ${f.id}: ${f.title}`,
        '',
        `**Severity:** ${capital(f.severity)} · **Status:** ${STATUS_WORD[f.status]} · **Area:** ${f.area}`,
        '',
        '**Identification**',
        '',
        paragraphs(f.identification),
        '',
        '**Mitigation**',
        '',
        paragraphs(f.mitigation),
        '',
        `**Verification:** ${f.verification}`,
        '',
      ]),
      '</details>',
      '',
    ].join('\n')
  }

  return [
    '# Security',
    '',
    '<!-- Generated from security/audits.json by `pnpm security:docs`. Do not edit by hand. -->',
    '',
    'Omsett converts files on the visitor’s own device and is built so that it cannot send them anywhere. This file records every security audit of it: what was looked for, what was found, and what was done. The same record is on the site at <https://omsett.com/security>.',
    '',
    '## Reporting a problem',
    '',
    'Please report a vulnerability privately, through the **Security** tab of the [GitHub repository](https://github.com/cschweda/omsett/security) (“Report a vulnerability”), not in a public issue. Say what you did, what happened, and what you expected.',
    '',
    '## Severity',
    '',
    '| Level | Meaning |',
    '| --- | --- |',
    ...SEVERITIES.map((s) => `| ${capital(s)} | ${SEVERITY_MEANING[s]} |`),
    '',
    'A finding is **Fixed** when a test shows it, **Open** when it is not yet dealt with, and **Accepted** when it has been judged tolerable and the reasons are written down.',
    '',
    '## Audits',
    '',
    'Newest first. The latest is expanded; earlier ones open when clicked.',
    '',
    ...audits.map(audit),
  ].join('\n')
}

export const README_START = '<!-- security:start -->'
export const README_END = '<!-- security:end -->'

export function renderReadmeBlock(audits: Audit[]): string {
  const latest = audits[0]!
  return [
    README_START,
    '<!-- Generated from security/audits.json by `pnpm security:docs`. Do not edit by hand. -->',
    '',
    'Every audit is recorded in full, with how each problem was found and what was done about it, in [`SECURITY.md`](SECURITY.md) and on the site’s [Security page](https://omsett.com/security).',
    '',
    '| Date | Audit | Findings | Fixed | Open | Accepted |',
    '| --- | --- | --- | --- | --- | --- |',
    ...audits.map((a) => {
      const t = tally(a)
      return `| ${longDate(a.date)} | ${a.title} | ${t.total} (${t.severities}) | ${t.fixed} | ${t.open} | ${t.accepted} |`
    }),
    '',
    `**Latest audit, ${longDate(latest.date)}:**`,
    '',
    findingsTable(latest),
    '',
    'To report a vulnerability, use the **Security** tab of this repository (“Report a vulnerability”), not a public issue.',
    '',
    README_END,
  ].join('\n')
}

export function withReadmeBlock(readme: string, block: string): string {
  const start = readme.indexOf(README_START)
  const end = readme.indexOf(README_END)
  if (start < 0 || end < 0) throw new Error('README.md has no security markers')
  return readme.slice(0, start) + block + readme.slice(end + README_END.length)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const audits = loadAudits()
  writeFileSync(join(root, 'SECURITY.md'), renderSecurityMd(audits))
  const readmePath = join(root, 'README.md')
  writeFileSync(readmePath, withReadmeBlock(readFileSync(readmePath, 'utf8'), renderReadmeBlock(audits)))
  console.log(`security docs written from ${audits.length} audits`)
}
