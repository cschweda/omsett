<script setup lang="ts">
import { deriveEdges, formatById } from '@omsett/registry'
import facts from '~/generated/facts.json'
import { boundaries, engines as engineChoice, pipeline } from '~/utils/diagrams'
import { formatBytes } from '~/utils/format-bytes'
import { NOTICES, REPOSITORY } from '~/utils/links'
import { registry } from '~/utils/registry'

useHead({ title: 'Technical details — Omsett' })

const engines = useEngines()

// Everything in these tables is read from the registry and the engine fact sheets the app
// itself runs on, so the page describes the build it is part of.
const edges = deriveEdges(registry).edges
const formats = registry.formats.map((format) => ({
  format,
  reads: registry.capabilities.some((c) => c.reads.includes(format.id)),
  writes: registry.capabilities.some((c) => c.writes.some((w) => w.format === format.id)),
}))
const conversions = edges.map((edge) => ({
  key: `${edge.from}-${edge.to}`,
  from: formatById(registry, edge.from)!.name,
  to: formatById(registry, edge.to)!.name,
  engines: edge.candidates.map((c) => c.engine).join(', then '),
  lossy: edge.candidates[0]!.lossy,
  warnings: edge.warnings.map((w) => w.text).join(' '),
}))
const engineRows = Object.values(engines.info).map((info) => ({
  ...info,
  size: info.sizeBytes === 0 ? 'Nothing' : formatBytes(info.sizeBytes),
  limit: info.maxPixels ? `${(info.maxPixels / 1_000_000).toFixed(1)} megapixels` : 'None of its own',
}))
const trapGroups: Record<string, string> = {
  identity: 'Not what they say they are',
  size: 'Lying about their size',
  damage: 'Damaged',
  unusual: 'Sound, but unusual',
  data: 'Data: broken, hostile, or misnamed',
}
</script>

<template>
  <div>
    <PageTitle title="Technical details" lead="How a conversion happens, what does the work, and how it is tested. The figures and tables are read from this build." />

    <main>
      <StepSection title="In figures" heading-id="tech-figures">
        <dl class="figure-row">
          <div><dd data-testid="count-formats">{{ registry.formats.length }}</dd><dt>formats recognized</dt></div>
          <div><dd data-testid="count-conversions">{{ edges.length }}</dd><dt>conversions</dt></div>
          <div><dd>{{ engineRows.length }}</dd><dt>engines</dt></div>
          <div><dd data-testid="count-traps">{{ facts.traps.total }}</dd><dt>trap files in the tests</dt></div>
          <div><dd>{{ facts.sampleFormats }}</dd><dt>formats with a sample file</dt></div>
        </dl>
      </StepSection>

      <StepSection title="One conversion, start to finish" heading-id="tech-pipeline">
        <div class="prose">
          <p>
            A file passes several checks before anything expensive happens. Each can stop it, and each stop is
            reported in words, on the file itself.
          </p>
        </div>
        <MermaidDiagram :code="pipeline" caption="The path of one file. Every exit on the left ends with a reason shown to the user." />
      </StepSection>

      <StepSection title="Where it runs" heading-id="tech-where">
        <div class="prose">
          <p>
            Everything happens in one browser tab. The page itself never decodes a file: pictures are decoded for
            preview in one background worker and converted in another, so a hostile or broken file can at worst stop
            a worker, which is then replaced.
          </p>
          <p>
            The site is static files. It serves the app and its engines and has no way to receive anything. That is
            enforced, not promised: the page and every worker carry a security policy that forbids connecting to any
            other address, so even a faulty dependency could not send a file away.
          </p>
        </div>
        <MermaidDiagram :code="boundaries" caption="What crosses the network: the app, once. Never a file." />
      </StepSection>

      <StepSection title="Engines" heading-id="tech-engines">
        <div class="prose">
          <p>
            An engine is the code that does a conversion. Several can cover the same pair of formats; they are tried
            in order. An engine is fetched only when a conversion needs it, and then cached.
          </p>
          <p>
            A browser's own decoder forgives a damaged file and returns the part it could read. So the browser's
            engine is given PNG only, and only after Omsett has checked the file's structure itself: every chunk and
            checksum, and that the image data is exactly as long as the header says. Every other format is read by
            libvips, which treats damage as an error.
          </p>
        </div>
        <MermaidDiagram :code="engineChoice" caption="Choosing an engine. Safari cannot write WebP from a canvas and answers with a PNG, which is why the output is checked." />
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th scope="col">Engine</th><th scope="col">Download</th><th scope="col">Largest picture</th>
                <th scope="col">License</th><th scope="col">Source</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="engine in engineRows" :key="engine.id">
                <th scope="row">{{ engine.id }}</th>
                <td class="figures">{{ engine.size }}</td>
                <td class="figures">{{ engine.limit }}</td>
                <td>{{ engine.license }}</td>
                <td><a :href="engine.sourceUrl" class="text-button">Source</a></td>
              </tr>
            </tbody>
          </table>
        </div>
      </StepSection>

      <StepSection title="Formats and conversions" heading-id="tech-formats">
        <div class="prose">
          <p>
            What converts to what is not written into the app. Each engine declares the formats it reads and writes;
            the routes, and the warnings about what a conversion loses, are worked out from that.
          </p>
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr><th scope="col">Format</th><th scope="col">Read</th><th scope="col">Written</th><th scope="col">Largest side</th></tr>
            </thead>
            <tbody>
              <tr v-for="row in formats" :key="row.format.id">
                <th scope="row">{{ row.format.name }}</th>
                <td>{{ row.reads ? 'Yes' : 'Not yet' }}</td>
                <td>{{ row.writes ? 'Yes' : 'Not yet' }}</td>
                <td class="figures">{{ row.format.maxDimension ? `${row.format.maxDimension} pixels` : 'No limit' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr><th scope="col">From</th><th scope="col">To</th><th scope="col">Engines, in order</th><th scope="col">Loses</th></tr>
            </thead>
            <tbody>
              <tr v-for="row in conversions" :key="row.key">
                <th scope="row">{{ row.from }}</th>
                <td>{{ row.to }}</td>
                <td>{{ row.engines }}</td>
                <td>{{ row.warnings || (row.lossy ? 'Some detail, by an amount you set with Quality.' : 'Nothing.') }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </StepSection>

      <StepSection title="Testing" heading-id="tech-testing">
        <div class="prose">
          <p>
            Every change is tested in three browser engines (Chromium, Firefox, and WebKit, which is Safari’s) before
            it is published, and the engines that can run outside a browser are tested there as well.
          </p>
          <p>
            Part of that is a set of <strong>{{ facts.traps.total }} trap files</strong>: pictures and data files that are broken,
            hostile, or lying, each in one deliberate way. For every one, the tests state in advance what must
            happen, and check it. Whatever a trap is, the page must survive, the file must end in a state a person
            can read, and an ordinary file must still convert afterwards.
          </p>
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr><th scope="col">Kind of trap</th><th scope="col" class="num">Files</th></tr>
            </thead>
            <tbody>
              <tr v-for="(count, group) in facts.traps.groups" :key="group">
                <th scope="row">{{ trapGroups[group] ?? group }}</th>
                <td class="num" :data-testid="`traps-${group}`">{{ count }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="prose">
          <p>
            Every conversion also runs against a clock: 30 seconds, plus 3 for each megapixel, at most 10 minutes.
            Past that the worker is stopped and the file is reported as having taken too long, so a file that sends
            an engine into a loop cannot hold the page. The <NuxtLink to="/security">Security</NuxtLink> page
            records each audit and what it found.
          </p>
          <p>
            Among them is a real decompression bomb, a small valid file that expands to 400 megapixels, which is
            refused from its header without being decoded. There are also {{ facts.cases }} sound edge-case files
            and a sample in each of {{ facts.sampleFormats }} image formats, most of them waiting for the formats
            they belong to.
          </p>
        </div>
      </StepSection>

      <StepSection title="Built with" heading-id="tech-stack">
        <div class="prose">
          <ul>
            <li>Nuxt and Vue, written in TypeScript, published as static files and served by nginx.</li>
            <li>libvips, compiled to WebAssembly, for conversions the browser cannot do itself.</li>
            <li>One typeface: Helvetica Neue where a device has it, Inter where it does not. No web fonts are fetched from anyone else.</li>
            <li>No analytics, no cookies, no accounts.</li>
          </ul>
          <p>
            The <a :href="REPOSITORY">source</a> is public, and so are the
            <a :href="NOTICES">licenses of every engine and library</a> the site ships.
          </p>
        </div>
      </StepSection>
    </main>
  </div>
</template>
