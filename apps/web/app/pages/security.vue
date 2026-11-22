<script setup lang="ts">
import audits from '~/generated/audits.json'
import { REPORT, SECURITY_MD } from '~/utils/links'

useHead({ title: 'Security — Omsett' })

type Finding = (typeof audits)[number]['findings'][number]

const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'] as const
const meanings: Record<string, string> = {
  critical: 'A visitor’s files or device can be compromised with no unusual action on their part.',
  high: 'The app gives a wrong result as if it were right, or the site is unavailable.',
  medium: 'Something private can leak, or the app can be made unusable, under conditions an attacker can arrange.',
  low: 'A weakness that needs unusual circumstances, or whose effect is small.',
  info: 'Not a weakness in itself. Recorded so the reasoning is on file.',
}
const statusWord: Record<string, string> = { fixed: 'Fixed', open: 'Open', accepted: 'Accepted' }
const capital = (word: string) => word.charAt(0).toUpperCase() + word.slice(1)

function longDate(iso: string) {
  const [year, month, day] = iso.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}
function tally(findings: Finding[]) {
  const count = (status: string) => findings.filter((f) => f.status === status).length
  return {
    severities: SEVERITIES.map((s) => [s, findings.filter((f) => f.severity === s).length] as const)
      .filter(([, n]) => n > 0)
      .map(([s, n]) => `${n} ${s}`)
      .join(', '),
    fixed: count('fixed'),
    open: count('open'),
    accepted: count('accepted'),
  }
}
const totals = computed(() => {
  // A finding carried from one audit into the next is one finding, counted at its latest state.
  const latest = new Map<string, Finding>()
  for (const audit of [...audits].reverse()) for (const finding of audit.findings) latest.set(finding.id, finding)
  return { ...tally([...latest.values()]), findings: latest.size, audits: audits.length }
})
</script>

<template>
  <div>
    <PageTitle
      title="Security"
      lead="Every audit of Omsett: what was looked for, what was found, how serious it was, and what was done. Newest first."
    />

    <main>
      <StepSection title="In figures" heading-id="security-figures">
        <dl class="figure-row">
          <div><dd data-testid="count-audits">{{ totals.audits }}</dd><dt>audits</dt></div>
          <div><dd data-testid="count-findings">{{ totals.findings }}</dd><dt>findings</dt></div>
          <div><dd>{{ totals.fixed }}</dd><dt>fixed</dt></div>
          <div><dd>{{ totals.open }}</dd><dt>open</dt></div>
          <div><dd>{{ totals.accepted }}</dd><dt>accepted</dt></div>
        </dl>
      </StepSection>

      <StepSection
        v-for="(audit, index) in audits"
        :key="audit.id"
        :title="longDate(audit.date)"
        :heading-id="`audit-${audit.id}`"
      >
        <!-- The latest audit is open; earlier ones open when clicked. -->
        <details class="audit" :open="index === 0" data-testid="audit">
          <summary class="summary">
            <span class="audit-title">{{ audit.title }}</span>
            <span class="audit-tally figures">
              {{ audit.findings.length }} findings ({{ tally(audit.findings).severities }}):
              {{ tally(audit.findings).fixed }} fixed, {{ tally(audit.findings).open }} open,
              {{ tally(audit.findings).accepted }} accepted
            </span>
          </summary>

          <div class="audit-body">
            <p class="lead-text">{{ audit.summary }}</p>

            <div class="context">
              <div>
                <h3 class="label">Scope</h3>
                <ul><li v-for="item in audit.scope" :key="item">{{ item }}</li></ul>
              </div>
              <div>
                <h3 class="label">Method</h3>
                <ul><li v-for="item in audit.method" :key="item">{{ item }}</li></ul>
              </div>
              <div>
                <h3 class="label">What held</h3>
                <ul><li v-for="item in audit.held" :key="item">{{ item }}</li></ul>
              </div>
            </div>

            <article v-for="finding in audit.findings" :key="finding.id" class="finding" data-testid="finding">
              <header class="finding-head">
                <p class="finding-id figures">{{ finding.id }}</p>
                <h3 class="finding-title">{{ finding.title }}</h3>
                <p class="finding-facts">
                  <span class="severity" :data-severity="finding.severity">
                    <span class="mark" aria-hidden="true" />{{ capital(finding.severity) }}
                  </span>
                  <span class="status" :data-status="finding.status">{{ statusWord[finding.status] }}</span>
                  <span class="muted">{{ finding.area }}</span>
                </p>
              </header>
              <div class="finding-body">
                <h4 class="label">Identification</h4>
                <p v-for="paragraph in finding.identification" :key="paragraph">{{ paragraph }}</p>
                <h4 class="label">Mitigation</h4>
                <p v-for="paragraph in finding.mitigation" :key="paragraph">{{ paragraph }}</p>
                <h4 class="label">Verification</h4>
                <p>{{ finding.verification }}</p>
              </div>
            </article>
          </div>
        </details>
      </StepSection>

      <StepSection title="Severity" heading-id="security-severity">
        <div class="table-wrap">
          <table class="table">
            <tbody>
              <tr v-for="level in SEVERITIES" :key="level">
                <th scope="row">
                  <span class="severity" :data-severity="level"><span class="mark" aria-hidden="true" />{{ capital(level) }}</span>
                </th>
                <td>{{ meanings[level] }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="prose">
          <p>
            A finding is <strong>fixed</strong> when a test shows it, <strong>open</strong> when it is not yet dealt
            with, and <strong>accepted</strong> when it has been judged tolerable and the reasons are written down.
          </p>
        </div>
      </StepSection>

      <StepSection title="Reporting a problem" heading-id="security-report">
        <div class="prose">
          <p>
            Please report a vulnerability privately, through the <a :href="REPORT">Security tab of the repository</a>
            (“Report a vulnerability”), not in a public issue. Say what you did, what happened, and what you expected.
          </p>
          <p>The same record, as one file, is <a :href="SECURITY_MD">SECURITY.md on GitHub</a>.</p>
        </div>
      </StepSection>
    </main>
  </div>
</template>

<style scoped>
.audit {
  border-bottom: 1px solid var(--rule);
}
.summary {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0 2rem 1rem 0;
  position: relative;
  cursor: pointer;
  list-style: none;
}
.summary::-webkit-details-marker {
  display: none;
}
/* Open or closed is shown by a plus that becomes a minus, set in the type itself. */
.summary::after {
  content: '+';
  position: absolute;
  top: -0.35rem;
  right: 0;
  font-size: var(--text-title);
  font-weight: 400;
  line-height: 1;
  color: var(--accent-text);
}
.audit[open] > .summary::after {
  content: '−';
}
.audit-title {
  font-size: var(--text-lead);
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: -0.015em;
}
.audit-tally {
  font-size: var(--text-small);
  color: var(--muted);
}
.audit-body {
  display: flex;
  flex-direction: column;
  gap: 2rem;
  padding: 0.5rem 0 2.5rem;
}
.audit-body p {
  margin: 0;
  max-width: 68ch;
}
.context {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--gutter);
  font-size: var(--text-small);
}
.context ul {
  margin: 0;
  padding: 0;
  list-style: none;
}
.context li {
  padding: 0.5rem 0;
  border-top: 1px solid var(--rule);
}
.label {
  margin: 0 0 0.375rem;
  font-size: var(--text-small);
  font-weight: 400;
  color: var(--muted);
}
.finding {
  padding-top: 1rem;
  border-top: 1px solid var(--ink);
}
.finding-id {
  font-size: var(--text-small);
  color: var(--muted);
}
.finding-title {
  margin: 0.125rem 0 0.5rem;
  font-size: var(--text-lead);
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: -0.015em;
  max-width: 34ch;
}
.finding-facts {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 1.25rem;
  font-size: var(--text-small);
}
.finding-body {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
  margin-top: 1.25rem;
}
.finding-body .label {
  margin: 0.75rem 0 0;
}
.severity {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  font-weight: 700;
}
.mark {
  width: 0.625rem;
  height: 0.625rem;
  background: var(--rule-strong);
}
/* Colour is kept for what needs attention: red for the two gravest levels, blue for medium. */
.severity[data-severity='critical'] .mark,
.severity[data-severity='high'] .mark {
  background: var(--signal);
}
.severity[data-severity='critical'],
.severity[data-severity='high'] {
  color: var(--signal);
}
.severity[data-severity='medium'] .mark {
  background: var(--accent);
}
.severity[data-severity='info'] .mark {
  background: transparent;
  box-shadow: inset 0 0 0 1px var(--rule-strong);
}
.status {
  font-weight: 700;
}
.status[data-status='open'] {
  text-decoration: underline;
  text-decoration-thickness: 2px;
  text-underline-offset: 3px;
}
</style>
