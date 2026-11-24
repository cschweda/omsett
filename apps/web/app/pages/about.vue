<script setup lang="ts">
import { NOTICES, REPOSITORY } from '~/utils/links'
import { deriveEdges } from '@omsett/registry'
import { registry } from '~/utils/registry'

useHead({ title: 'About — Omsett' })

const formats = computed(() => registry.formats.map((f) => f.name))
const conversions = deriveEdges(registry).edges.length
</script>

<template>
  <div>
    <PageTitle title="About" lead="A file converter that does its work on your device, and says plainly what it can and cannot do." />

    <main>
      <StepSection title="The name" heading-id="about-name">
        <div class="prose entry" data-testid="definition">
          <p class="headword">
            <strong lang="nn">omsett</strong>
            <span class="said">/ˈɔmˌsɛt/, roughly “OM-set”</span>
          </p>
          <p>
            Norwegian. A form of the verb <em lang="nn">omsetje</em> (also written <em lang="nn">omsetja</em>) in
            Nynorsk, and <em lang="nb">omsette</em> in Bokmål, the two written standards of Norwegian.
          </p>

          <h3>What it means</h3>
          <ol>
            <li>
              <strong>To translate</strong> from one language into another. This is the everyday word for it in
              Nynorsk: <em lang="nn">Boka er omsett frå engelsk</em>, “the book is translated from English”. Bokmål
              says <em lang="nb">oversette</em> for this.
            </li>
            <li>
              <strong>To convert</strong>, to turn one thing into another: energy into heat, a plan into action.
              <em lang="nb">Å omsette teori i praksis</em>, “to put theory into practice”.
            </li>
            <li>
              <strong>To sell or trade</strong>, to turn goods over. From this sense comes
              <em lang="nb">omsetning</em>, a company’s turnover.
            </li>
          </ol>

          <h3>Its forms</h3>
          <dl class="forms">
            <div><dt>Nynorsk</dt><dd><em lang="nn">å omsetje</em>, <em lang="nn">omset</em>, <em lang="nn">omsette</em>, <em lang="nn">har omsett</em></dd></div>
            <div><dt>Bokmål</dt><dd><em lang="nb">å omsette</em>, <em lang="nb">omsetter</em>, <em lang="nb">omsatte</em>, <em lang="nb">har omsatt</em></dd></div>
          </dl>
          <p>
            <em lang="nn">Omsett</em> itself is two of these at once. It is the Nynorsk past participle, what a
            thing is once the work is done: translated, converted. And it is the imperative, the form used to ask
            for it: translate this, convert this.
          </p>

          <h3>Where it comes from</h3>
          <p>
            Two older words joined: <em lang="nn">om</em>, “around, over, anew”, and <em lang="nn">setje</em>, “to
            set, to put”. To <em lang="nn">omsetje</em> a thing is to set it over into another place or another
            shape. The same pair makes the same word across the neighbouring languages: German
            <em lang="de">umsetzen</em>, Dutch <em lang="nl">omzetten</em>, Danish <em lang="da">omsætte</em>, Swedish
            <em lang="sv">omsätta</em>.
          </p>

          <h3>Words beside it</h3>
          <dl class="forms">
            <div><dt><em lang="nn">omsetjing</em></dt><dd>a translation; the act of translating</dd></div>
            <div><dt><em lang="nn">omsetjar</em></dt><dd>a translator</dd></div>
            <div><dt><em lang="nb">omsetning</em></dt><dd>turnover; sales</dd></div>
          </dl>

          <h3>Why it is the name</h3>
          <p>
            A file converter does to a file what a translator does to a book. The words stay; the language they are
            written in changes. A photograph is the same photograph as a PNG and as a WebP, and a table is the same
            table as a spreadsheet and as JSON. Omsett is named for that: for the first meaning and the second
            together, for the request, and for the state of the file when you get it back.
          </p>
        </div>
      </StepSection>

      <StepSection title="What it is" heading-id="about-what">
        <div class="prose">
          <p class="lead-text">Drop a file, pick a format, download the result.</p>
          <p>
            Omsett converts files in your browser. There is no account, nothing to install, and no upload: the file you
            drop is read, converted, and handed back inside the tab you have open.
          </p>
          <p>
            It is at an early stage. Today it handles {{ formats.length }} formats, pictures, PDFs, documents, presentations, spreadsheets, screenplays, data, subtitles,
            web pages, fonts, archives and sound
            ({{ formats.join(', ') }}): {{ conversions }} conversions in all. More formats, and then MP3
            and video, are the work ahead.
          </p>
        </div>
      </StepSection>

      <StepSection title="Why it exists" heading-id="about-why">
        <div class="prose">
          <p>
            Most converters on the web work by taking your file. You upload it to a server you know nothing about,
            wait, and download what comes back. That is slow, and it is a poor thing to do with a contract, a
            manuscript, or a photograph of your children.
          </p>
          <p>
            A browser is now capable of doing this work itself. Omsett is built on that: every conversion that can
            run on your device does, and the site is written so that it cannot send your files anywhere, not merely
            so that it does not.
          </p>
        </div>
      </StepSection>

      <StepSection title="What to expect" heading-id="about-expect">
        <div class="prose">
          <ul>
            <li>It tells you where a conversion runs before you start it.</li>
            <li>It tells you what a conversion will lose, such as transparency or animation, before you start it.</li>
            <li>It goes by what a file contains, not what it is called.</li>
            <li>It refuses a damaged file instead of quietly returning half of one.</li>
            <li>It refuses a file too large to handle safely, and says so, instead of freezing the tab.</li>
            <li>It stops a conversion that runs too long, instead of leaving you waiting.</li>
            <li>It removes author, location and other metadata from what it produces, and tells you so.</li>
            <li>
              It counts visits, and nothing else, and you can turn that off in
              <NuxtLink to="/settings">Settings</NuxtLink>. Your files are no part of it.
            </li>
          </ul>
        </div>
      </StepSection>

      <StepSection title="Counting visits" heading-id="about-visits">
        <div class="prose" data-testid="about-visits">
          <p>
            omsett.com counts how many people open it, with
            <a href="https://plausible.io/privacy-focused-web-analytics">Plausible</a>, a privacy-friendly counter.
            It sets no cookie, keeps no record of a person, and cannot follow you to another site. It learns that
            a page was opened, which page, and what page linked to it. It never learns what you converted: a file
            is no part of it, and neither is a file’s name.
          </p>
          <p>
            No code of Plausible’s runs on this site. Omsett’s own code makes the report, to omsett.com itself,
            which passes it on, so this page still talks to no other site.
          </p>
          <h3>Turning it off</h3>
          <p>
            Open <NuxtLink to="/settings">Settings</NuxtLink> and choose “Do not count my visits”. It is already
            off, without your doing anything, if your browser sends Do Not Track or Global Privacy Control; Settings
            says which of the three it is. A copy of Omsett you host yourself counts nothing unless you set it up
            to. More on what Omsett can and cannot know is on the <NuxtLink to="/trust">Trust</NuxtLink> page.
          </p>
        </div>
      </StepSection>

      <StepSection title="Who makes it" heading-id="about-who">
        <div class="prose">
          <p>
            Omsett is made by Christopher Schweda and is free and open source under the MIT license. The
            <a :href="REPOSITORY">source is on GitHub</a>, along with the
            <a :href="NOTICES">licenses of everything it is built on</a>.
          </p>
          <p>
            It learned from two other open-source converters, <a href="https://github.com/VERT-sh/VERT">VERT</a> and
            <a href="https://github.com/KnifeLemon/Filee">Filee</a>, and owes the shape of its route planner to Filee.
          </p>
          <p>
            For how it works underneath, see <NuxtLink to="/technical">Technical details</NuxtLink>. For what has
            changed lately, see <NuxtLink to="/whats-new">What’s new</NuxtLink>. For how it has been attacked and
            what was found, see <NuxtLink to="/security">Security</NuxtLink>.
          </p>
        </div>
      </StepSection>
    </main>
  </div>
</template>

<style scoped>
.headword {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.25rem 1rem;
  margin-bottom: 0.5rem;
}
.headword strong {
  font-size: var(--text-title);
  letter-spacing: -0.035em;
  line-height: 1;
}
.said {
  color: var(--muted);
}
.entry h3 {
  margin: 1.5rem 0 0.375rem;
  font-size: var(--text-body);
  font-weight: 700;
}
.entry ol {
  padding-left: 1.25rem;
}
.entry li + li {
  margin-top: 0.5rem;
}
.forms {
  margin: 0 0 0.75rem;
}
.forms > div {
  display: grid;
  grid-template-columns: minmax(6rem, 9rem) minmax(0, 1fr);
  column-gap: 1rem;
  padding: 0.25rem 0;
  border-top: 1px solid var(--rule);
}
.forms dd {
  margin: 0;
}
</style>
