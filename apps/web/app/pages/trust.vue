<script setup lang="ts">
import { deriveEdges } from '@omsett/registry'
import audits from '~/generated/audits.json'
import facts from '~/generated/facts.json'
import { REPOSITORY } from '~/utils/links'
import { registry } from '~/utils/registry'

useHead({ title: 'Can I trust this? — Omsett' })

// Every figure on this page is counted when the site is built: from the registry the app runs
// on, from the list of traps the tests read, from the report of the last test run, and from the
// record of audits. None is typed in, so none can fall behind.
const conversions = deriveEdges(registry).edges.length
const engines = Object.keys(useEngines().info).length
const number = (value: number) => value.toLocaleString('en-GB')

type Finding = (typeof audits)[number]['findings'][number]
// A finding carried from one audit into the next is one finding, at its latest state.
const latest = new Map<string, Finding>()
for (const audit of [...audits].reverse()) for (const finding of audit.findings) latest.set(finding.id, finding)
const findings = [...latest.values()]
const state = (status: string) => findings.filter((finding) => finding.status === status).length
const open = findings.filter((finding) => finding.status === 'open')
const browsers = facts.tests.browsers.map((name) => ({ chromium: 'Chromium', firefox: 'Firefox', webkit: 'WebKit' })[name] ?? name)
const browserList = `${browsers.slice(0, -1).join(', ')} and ${browsers.at(-1)}`
</script>

<template>
  <div>
    <PageTitle
      title="Can I trust this?"
      lead="You should not have to take anyone’s word for it. What Omsett does with your files, what stops it doing anything else, and how to check each of those yourself."
    />

    <main>
      <StepSection title="In figures" heading-id="trust-figures">
        <dl class="figure-row wide">
          <div><dd data-testid="trust-unit">{{ number(facts.tests.unit) }}</dd><dt>tests of the code</dt></div>
          <div><dd data-testid="trust-browser">{{ number(facts.tests.browser) }}</dd><dt>tests in real browsers</dt></div>
          <div><dd data-testid="trust-traps">{{ number(facts.traps.total) }}</dd><dt>trap files</dt></div>
          <div><dd data-testid="trust-audits">{{ audits.length }}</dd><dt>audits</dt></div>
          <div><dd data-testid="trust-fixed">{{ state('fixed') }}</dd><dt>findings fixed</dt></div>
          <div><dd data-testid="trust-open">{{ state('open') }}</dd><dt>findings open</dt></div>
        </dl>
        <p class="counted">
          Counted, not typed in, when this copy of the site was built: version {{ facts.version }}, {{ facts.built }}.
          They change as Omsett does.
        </p>
      </StepSection>

      <StepSection title="Where your files go" heading-id="trust-files">
        <div class="prose">
          <p>
            Nowhere. A file you add is read by this page, converted on your device, and handed back to you. It is
            never uploaded, because there is nowhere for it to go: this site has no server that takes files.
          </p>
          <p>
            That is a rule the browser enforces, not a promise. Every page carries a security policy that forbids
            it to make a request to any other site, and the converters run in workers that have no other way to
            reach the network. A test opens every page and fails if one request goes elsewhere, or if any request
            carries a file.
          </p>
          <h3>Check it yourself</h3>
          <ul>
            <li>
              Open your browser’s developer tools, choose <strong>Network</strong>, and convert a file. You will
              see the converter being fetched from this site the first time, and nothing being sent.
            </li>
            <li>
              Convert a file once, so that its converter is loaded. Then turn off your Wi-Fi and convert another
              of the same kind. It works, because nothing was ever being sent.
            </li>
            <li>
              Read the policy: it is in the source of this page, in a tag near the top that begins
              <code>Content-Security-Policy</code>. Look for <code>connect-src 'self'</code>.
            </li>
          </ul>
        </div>
      </StepSection>

      <StepSection title="What a hostile file can do" heading-id="trust-hostile">
        <div class="prose">
          <p>
            People convert files that other people sent them. So Omsett is tested against files made to attack
            it: {{ number(facts.traps.total) }} of them, each broken, hostile or lying in one deliberate way.
            Files that claim to be tiny and unpack to gigabytes. Archives with files named to land outside their
            folder. Documents carrying programs. Subtitles carrying scripts. A file of every format with code
            planted wherever that format holds text.
          </p>
          <p>
            For each, the tests state in advance what must happen, and check it. Whatever the file is, nothing
            in it may run, the page must survive it, and an ordinary file must still convert afterwards. A
            conversion that runs too long is stopped. Damaged files are refused, not half-converted.
          </p>
          <p><NuxtLink to="/traps" data-testid="trust-to-traps">See every trap file</NuxtLink>, with what each is and what must happen to it.</p>
        </div>
      </StepSection>

      <StepSection title="How it is tested" heading-id="trust-tests">
        <div class="prose">
          <p>
            Every change runs {{ number(facts.tests.unit) }} tests of the code and
            {{ number(facts.tests.browser) }} tests in real browsers: {{ browserList }}, which between them are
            the engines of Chrome, Edge, Firefox and Safari. Every one of the {{ conversions }} conversions
            between {{ registry.formats.length }} formats is run from a real sample file in each of them, and
            every trap is dropped into each.
          </p>
          <p>
            A change is merged only after all of it has passed. That is how the project works, not yet a lock
            on the repository, and it is one of the open findings listed below. The runs are public:
            <a :href="`${REPOSITORY}/actions`">every run, on GitHub</a>.
          </p>
        </div>
      </StepSection>

      <StepSection title="Who has checked" heading-id="trust-audits">
        <div class="prose">
          <p>
            Omsett has been audited {{ audits.length }} times, most recently by reviewers told to break it and to
            prove whatever they claimed. Between them the audits made {{ findings.length }} findings.
            {{ state('fixed') }} are fixed, each with a test that fails without the fix.
            {{ state('accepted') }} are accepted, with the reasons written down.
            <template v-if="open.length > 0">{{ open.length }} are open:</template>
            <template v-else>None is open.</template>
          </p>
          <ul v-if="open.length > 0" data-testid="trust-open-list">
            <li v-for="finding in open" :key="finding.id">{{ finding.title }}.</li>
          </ul>
          <p>
            Nothing is left out of that list to make it look better. The
            <NuxtLink to="/security">Security page</NuxtLink> has every audit in full: what was looked for, what
            was found, how serious it was, and what was done.
          </p>
        </div>
      </StepSection>

      <StepSection title="What Omsett learns about you" heading-id="trust-visits">
        <div class="prose">
          <p>
            That a page was opened. omsett.com counts visits with
            <a href="https://plausible.io/privacy-focused-web-analytics">Plausible</a>, a privacy-friendly counter
            that sets no cookie, keeps no record of a person, and cannot follow you to another site.
          </p>
          <ul>
            <li>What is sent: that a page was opened, which page, and what page linked to it.</li>
            <li>What is never sent: a file, a file’s name, what you converted, or anything about it.</li>
            <li>
              No code of Plausible’s runs here. Omsett’s own code makes the report, to omsett.com, which passes
              it on. So the rule that this page talks to no other site holds with counting on.
            </li>
          </ul>
          <h3>Turning it off</h3>
          <p>
            Open <NuxtLink to="/settings">Settings</NuxtLink> and choose “Do not count my visits”. It is off
            already, without your doing anything, if your browser sends Do Not Track or Global Privacy Control.
            A copy of Omsett that you host yourself counts nothing unless you set it up to.
          </p>
        </div>
      </StepSection>

      <StepSection title="What you are still trusting" heading-id="trust-limits">
        <div class="prose">
          <p>No tool can honestly say “nothing”. These are the things you rely on when you use Omsett:</p>
          <ul>
            <li>
              <strong>That this site sends you the code that is published.</strong> The source is
              <a :href="REPOSITORY">open</a>, under the MIT license. If you would rather not rely on omsett.com,
              run your own copy: it is one command, and it needs no server of ours.
            </li>
            <li>
              <strong>Your browser.</strong> It is what enforces the rules above, so keep it up to date.
            </li>
            <li>
              <strong>The {{ engines }} converters.</strong> Some are well-known open-source libraries, compiled
              to run in the browser. Each is listed with its license in
              <NuxtLink to="/technical">Technical details</NuxtLink>, and each file of them is checked against a
              fingerprint recorded when the site was built before it runs.
            </li>
            <li>
              <strong>The converted file.</strong> Omsett removes what it says it removes, and tells you what a
              conversion loses before you start. Open the result and look, as you would with any converter.
            </li>
          </ul>
        </div>
      </StepSection>
    </main>
  </div>
</template>

<style scoped>
/* Figures in the thousands need more room than the row gives by default. */
.figure-row.wide {
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  row-gap: 2rem;
}
.counted {
  margin: 0;
  max-width: var(--measure, 60ch);
  font-size: var(--text-small);
  color: var(--muted);
}
</style>
