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
      <StepSection title="What it is" heading-id="about-what">
        <div class="prose">
          <p class="lead-text">Drop a file, pick a format, download the result.</p>
          <p>
            Omsett converts files in your browser. There is no account, nothing to install, and no upload: the file you
            drop is read, converted, and handed back inside the tab you have open.
          </p>
          <p>
            It is at an early stage. Today it handles {{ formats.length }} formats, pictures, data, subtitles and web pages
            ({{ formats.join(', ') }}): {{ conversions }} conversions in all. More formats, and then documents and
            sound, are the work ahead.
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
          </ul>
        </div>
      </StepSection>

      <StepSection title="The name" heading-id="about-name">
        <div class="prose">
          <p>
            <em>Omsett</em> is Norwegian Nynorsk, from the verb <em>omsetja</em>: to translate, and by extension to
            convert. Literally, to set over.
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
