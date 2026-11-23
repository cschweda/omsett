<script setup lang="ts">
import { deriveEdges } from '@omsett/registry'
import audits from '~/generated/audits.json'
import facts from '~/generated/facts.json'
import { REPOSITORY } from '~/utils/links'
import { registry } from '~/utils/registry'
import traps from '~/generated/traps.json'
import { trapGroups } from '~/utils/trap-groups'

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
// Every trap file, by kind, for the list on this page. Read from the list the tests read.
const trapKinds = Object.entries(trapGroups)
  .map(([id, label]) => ({ id, label, files: traps.filter((trap) => trap.group === id).map((trap) => trap.file) }))
  .filter((kind) => kind.files.length > 0)

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
          <p data-testid="trust-exception">
            There is one exception, and it never happens by itself. For a PDF, Word, PowerPoint or Excel file,
            omsett.com can ask an accessibility checker to score it: audit.icjia.app, written by the same author
            as Omsett, Christopher Schweda. That sends the file to a server. Omsett
            first shows you where the file would go and what is kept, and sends nothing unless you then press
            “Send this file and check it”. Converting never needs it.
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
            People convert files that other people sent them. A file can be built to attack whatever opens it,
            and a converter opens everything it is given. So the question is not whether Omsett handles good
            files well, but what it does with bad ones.
          </p>
          <p>
            A conversion that runs too long is stopped. A damaged file is refused, not half-converted. Nothing a
            file contains is ever run, and nothing it contains is put on this page except as plain text. None of
            that is taken on trust: it is tested, with trap files.
          </p>
        </div>
      </StepSection>

      <StepSection title="Trap files" heading-id="trust-traps">
        <div class="prose" data-testid="trust-trap-definition">
          <p>
            A <strong>trap file</strong> is a file made on purpose to be wrong in one particular way, to find out
            what Omsett does with it. Each one is small, each is built by a program so that it is exactly as wrong
            as intended and no more, and each comes with a statement, written before the test is run, of what
            must happen to it. There are {{ number(facts.traps.total) }} of them. They are test files, kept with
            the code. Nothing of yours is ever one.
          </p>
          <h3>What they are made to do</h3>
          <ul>
            <li>
              <strong>Lie about what they are.</strong> A JPEG named .png. A web page named as a picture. A
              table whose first letters spell the start of a picture file. Omsett must go by what a file
              contains, not what it is called.
            </li>
            <li>
              <strong>Lie about their size.</strong> A few kilobytes that claim to be a picture forty thousand
              pixels wide, or that unpack to gigabytes: the “bomb”, in a ZIP, a spreadsheet, a font, a drawing.
              Omsett must refuse before it has made room for them, not after.
            </li>
            <li>
              <strong>Be damaged.</strong> Cut off halfway, a byte changed, a checksum that does not match. Omsett
              must say the file is damaged, and must not hand back half a picture as if it were whole.
            </li>
            <li>
              <strong>Carry something that could run.</strong> A script in a subtitle, a program in a PDF, a
              formula in a spreadsheet that starts another program, a web page with a hidden form. For every
              format there is a file with code planted wherever that format holds text. None of it may run, here
              or in anything the file is converted into.
            </li>
            <li>
              <strong>Reach outside themselves.</strong> An archive with a file named to land outside its
              folder. A document that asks for a file from your computer, or from another site. Omsett must
              refuse the first and never fetch the second.
            </li>
            <li>
              <strong>Hold what their author meant to be gone.</strong> Deleted text still in a Word file,
              hidden slides, comments, speaker notes, a photograph’s location. None may be carried into the
              converted copy.
            </li>
            <li>
              <strong>Take forever.</strong> A list nested ten thousand deep, a line of three million letters, a
              length written as eighty thousand zeros. Omsett must be done, or have refused, in moments.
            </li>
          </ul>
          <h3>What must happen to each</h3>
          <p>
            One of three things, stated in advance: it is <strong>refused</strong>, with the reason shown to the
            person; it is <strong>converted</strong> safely, with whatever was planted in it gone; or it is
            <strong>offered nothing</strong>, because it is not a file Omsett reads. Whichever it is, the page
            must survive, nothing in the file may run, and an ordinary file must convert straight afterwards.
            Every trap is tried in Chromium, Firefox and WebKit on every change.
          </p>
          <p>
            When an audit finds something Omsett got wrong, the file that showed it becomes a trap, so that the
            same mistake cannot come back unnoticed.
          </p>
          <h3>Every trap file</h3>
          <p>
            All {{ number(facts.traps.total) }}, by kind. Each name leads to its entry on the
            <NuxtLink to="/traps" data-testid="trust-to-traps">Trap files</NuxtLink> page, which says what that file
            is, what must happen to it, and where the file itself can be had.
          </p>
        </div>
        <div class="trap-list" data-testid="trust-trap-list">
          <details v-for="kind in trapKinds" :key="kind.id" class="kind">
            <summary>
              <span>{{ kind.label }}</span>
              <span class="figures count">{{ kind.files.length }}</span>
            </summary>
            <ul>
              <li v-for="file in kind.files" :key="file">
                <NuxtLink :to="{ path: '/traps', hash: `#trap-${file}` }" data-testid="trust-trap">{{ file }}</NuxtLink>
              </li>
            </ul>
          </details>
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
.trap-list {
  border-bottom: 1px solid var(--rule);
}
.kind {
  border-top: 1px solid var(--rule);
}
.kind summary {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.625rem 0;
  font-weight: 700;
  cursor: pointer;
}
.kind summary:hover {
  color: var(--accent-text);
}
.kind .count {
  color: var(--muted);
  font-weight: 400;
}
.kind ul {
  margin: 0 0 1rem;
  padding: 0;
  list-style: none;
  columns: 3 14rem;
  column-gap: var(--gutter);
  font-size: var(--text-small);
}
.kind li {
  padding: 0.2rem 0;
  break-inside: avoid;
  overflow-wrap: anywhere;
}
.kind a {
  text-decoration: underline;
  text-underline-offset: 0.15em;
}
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
