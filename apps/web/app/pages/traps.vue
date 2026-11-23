<script setup lang="ts">
import { formatById } from '@omsett/registry'
import traps from '~/generated/traps.json'
import { REPOSITORY } from '~/utils/links'
import { registry } from '~/utils/registry'
import { trapGroups } from '~/utils/trap-groups'

useHead({ title: 'Trap files — Omsett' })

type Trap = (typeof traps)[number]

// What the file really is, by its contents, in the registry's own name for it.
const really = (trap: Trap) => formatById(registry, trap.detect)?.name ?? null

// What the tests require, in a word, and then in a sentence.
function verdict(trap: Trap): 'Converted' | 'Refused' | 'Not offered' {
  if (trap.guard === 'refused' || trap.outcome === 'fails') return 'Refused'
  return trap.outcome === 'succeeds' ? 'Converted' : 'Not offered'
}
function required(trap: Trap): string {
  const name = really(trap)
  if (trap.guard === 'refused') return 'Turned away for its size before any engine reads it.'
  if (trap.outcome === 'none') {
    return name
      ? `Recognised as ${name}, and no conversion is offered.`
      : 'Not recognised as any format, so no conversion is offered.'
  }
  if (trap.outcome === 'fails') {
    return trap.note ? `Refused, with the reason given: “${trap.note}.”` : 'Refused, and the person is told so.'
  }
  const parts = [trap.mismatch && name ? `Read as ${name}, which is what it is, whatever its name says.` : 'Converted.']
  if (trap.payload) parts.push('What was planted in it must be absent from the result.')
  if (trap.note) parts.push(`With this said: “${trap.note}.”`)
  return parts.join(' ')
}

const groups = Object.entries(trapGroups)
  .map(([id, label]) => ({ id, label, traps: traps.filter((trap) => trap.group === id) }))
  .filter((group) => group.traps.length > 0)
const count = (word: ReturnType<typeof verdict>) => traps.filter((trap) => verdict(trap) === word).length
</script>

<template>
  <div>
    <PageTitle
      title="Trap files"
      lead="Every file Omsett is tested against that is broken, hostile, or lying: what each one is, and what must happen to it."
    />

    <main>
      <StepSection title="In figures" heading-id="traps-figures">
        <dl class="figure-row">
          <div><dd data-testid="count-all-traps">{{ traps.length }}</dd><dt>trap files</dt></div>
          <div><dd>{{ count('Refused') }}</dd><dt>must be refused</dt></div>
          <div><dd>{{ count('Converted') }}</dd><dt>must convert safely</dt></div>
          <div><dd>{{ count('Not offered') }}</dd><dt>must be offered nothing</dt></div>
        </dl>
        <div class="prose">
          <p>
            Each file is wrong in one deliberate way. For every one, the tests state in advance what must happen,
            and check it in Chromium, Firefox and WebKit on every change. Whatever a trap is, the page must
            survive it, nothing in it may run, and an ordinary file must still convert afterwards. The files
            are in the <a :href="`${REPOSITORY}/tree/main/fixtures/_traps`">repository</a>, with the program that
            makes them.
          </p>
        </div>
        <ul class="index">
          <li v-for="group in groups" :key="group.id">
            <a :href="`#traps-${group.id}`">{{ group.label }}</a> <span class="figures">{{ group.traps.length }}</span>
          </li>
        </ul>
      </StepSection>

      <StepSection v-for="group in groups" :key="group.id" :title="group.label" :heading-id="`traps-${group.id}`">
        <div class="table-wrap">
          <table class="table trap-table" :data-testid="`trap-group-${group.id}`">
            <thead>
              <tr>
                <th scope="col">File</th>
                <th scope="col">What it is</th>
                <th scope="col">What must happen</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="trap in group.traps" :key="trap.file" data-testid="trap">
                <th scope="row" class="file">{{ trap.file }}</th>
                <td>{{ trap.why }}</td>
                <td>
                  <span class="verdict" :data-verdict="verdict(trap)">{{ verdict(trap) }}</span>
                  {{ required(trap) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </StepSection>
    </main>
  </div>
</template>

<style scoped>
.index {
  margin: 0;
  padding: 0;
  list-style: none;
  columns: 2;
  column-gap: var(--gutter);
  font-size: var(--text-small);
}
.index li {
  padding: 0.3rem 0;
  border-top: 1px solid var(--rule);
  break-inside: avoid;
}
.index span {
  color: var(--muted);
  margin-left: 0.4em;
}
.trap-table {
  table-layout: fixed;
}
.trap-table th:first-child {
  width: 26%;
}
.trap-table th:last-child {
  width: 30%;
}
.file {
  overflow-wrap: anywhere;
}
.verdict {
  display: block;
  font-weight: 700;
}
.verdict[data-verdict='Refused'] {
  color: var(--signal);
}
.verdict[data-verdict='Converted'] {
  color: var(--positive);
}
@media (max-width: 760px) {
  .index {
    columns: 1;
  }
}
</style>
