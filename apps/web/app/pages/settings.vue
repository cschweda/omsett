<script setup lang="ts">
import { visitCounting, visitSignals, VISITS_SETTING, type VisitCounting } from '~/utils/visits'
import { testHook } from '~/utils/limits'
import { MAX_AFFIX, namedAs } from '~/utils/naming'

useHead({ title: 'Settings — Omsett' })

const colorMode = useColorMode()
const themes = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'system', label: 'As this device is set' },
]

// Whether this visit is counted, and why. Worked out in the browser, where the signals are.
const config = useRuntimeConfig().public
const counting = ref<VisitCounting | null>(null)
const signals = () => {
  const named = testHook('visits', location)
  return visitSignals(named ?? config.visitsSite, named === null ? location.hostname : undefined)
}
onMounted(() => (counting.value = visitCounting(signals())))
function setCounting(on: boolean) {
  try {
    localStorage.setItem(VISITS_SETTING, on ? 'on' : 'off')
  } catch {
    // Without storage the choice cannot be kept, and the page says what is true now.
  }
  counting.value = visitCounting(signals())
}

// Words to put before and after the names of converted files.
const names = useNaming()
const prefix = ref('')
const suffix = ref('')
onMounted(() => {
  prefix.value = names.naming.value.prefix
  suffix.value = names.naming.value.suffix
})
const saveNames = () => names.set({ prefix: prefix.value, suffix: suffix.value })
const example = computed(() => namedAs('report.html', { prefix: prefix.value, suffix: suffix.value }))

function startAgain() {
  try {
    localStorage.clear()
    sessionStorage.clear()
  } catch {
    // Nothing kept, nothing to forget.
  }
  location.assign('/')
}
</script>

<template>
  <div>
    <PageTitle title="Settings" lead="What Omsett remembers about how you like it, kept on this device and nowhere else." />

    <main>
      <StepSection title="Privacy" heading-id="settings-privacy">
        <div class="prose">
          <p>
            Your files are never sent anywhere, and no setting changes that. This is about something else: counting
            how many people open Omsett.
          </p>
          <p>
            Where a copy of Omsett counts visits, it does so with
            <a href="https://plausible.io/privacy-focused-web-analytics">Plausible</a>, a privacy-friendly counter. This
            is all of what that means:
          </p>
          <dl class="facts" data-testid="visits-facts">
            <div><dt>What is sent</dt><dd>That a page was opened, which page, and what page linked to it.</dd></div>
            <div><dt>What is never sent</dt><dd>A file, a file’s name, what you converted, or anything about it.</dd></div>
            <div><dt>Cookies</dt><dd>None. Nothing is stored on your device for counting, and nothing identifies you from one day to the next.</dd></div>
            <div><dt>Your address</dt><dd>Seen by the counter, as by any site you open, and used to count you once and to tell which country a visit came from. It is not kept.</dd></div>
            <div><dt>Other sites</dt><dd>It cannot follow you to them, and nothing is shared with advertisers.</dd></div>
            <div><dt>Plausible’s code</dt><dd>None runs here. Omsett’s own code makes the report, to this site, which passes it on.</dd></div>
          </dl>
          <p v-if="counting === 'not-set-up'" data-testid="visits-state">
            <strong>Visits are not counted on this copy of Omsett.</strong> There is nothing to turn off.
          </p>
          <template v-else-if="counting !== null">
            <p data-testid="visits-state">
              <strong v-if="counting === 'on'">Your visits are counted.</strong>
              <strong v-else-if="counting === 'off-by-choice'">Your visits are not counted. You turned this off.</strong>
              <strong v-else>
                Your visits are not counted. Your browser asks sites not to track you, and Omsett takes that as your
                answer.
              </strong>
            </p>
            <p v-if="counting !== 'off-by-browser'" class="choices">
              <button type="button" class="button" :class="{ solid: counting === 'on' }" :aria-pressed="counting === 'on'" data-testid="visits-on" @click="setCounting(true)">
                Count my visits
              </button>
              <button type="button" class="button" :class="{ solid: counting === 'off-by-choice' }" :aria-pressed="counting === 'off-by-choice'" data-testid="visits-off" @click="setCounting(false)">
                Do not count my visits
              </button>
            </p>
            <p class="small">A change takes effect the next time a page is opened.</p>
          </template>
        </div>
      </StepSection>

      <StepSection title="Appearance" heading-id="settings-appearance">
        <div class="prose">
          <p class="choices">
            <ClientOnly>
              <button
                v-for="theme in themes"
                :key="theme.value"
                type="button"
                class="button"
                :class="{ solid: colorMode.preference === theme.value }"
                :aria-pressed="colorMode.preference === theme.value"
                :data-testid="`theme-${theme.value}`"
                @click="colorMode.preference = theme.value"
              >
                {{ theme.label }}
              </button>
            </ClientOnly>
          </p>
        </div>
      </StepSection>

      <StepSection title="File names" heading-id="settings-names">
        <div class="prose">
          <p>
            A converted file keeps its name and takes its new ending. You can have words put before the name, after
            it, or both. Leave them empty for the name alone.
          </p>
          <div class="fields">
            <label>
              <span>Before the name</span>
              <input v-model="prefix" type="text" :maxlength="MAX_AFFIX" autocomplete="off" spellcheck="false" placeholder="omsett-" data-testid="name-prefix" @input="saveNames">
            </label>
            <label>
              <span>After the name</span>
              <input v-model="suffix" type="text" :maxlength="MAX_AFFIX" autocomplete="off" spellcheck="false" placeholder="-converted" data-testid="name-suffix" @input="saveNames">
            </label>
          </div>
          <p class="small" data-testid="name-example">
            For example, “report.docx” converted to HTML is saved as <strong>{{ example }}</strong>.
          </p>
          <p class="small">
            Letters, numbers, spaces and most marks are kept; a few that a file name cannot hold, such as / and :,
            are left out. This is kept on this device only.
          </p>
        </div>
      </StepSection>

      <StepSection title="Start again" heading-id="settings-reset">
        <div class="prose">
          <p>
            Omsett keeps a few things on this device: these settings, and which announcements you have dismissed. It
            keeps no files. This forgets all of it and returns to the converter.
          </p>
          <p><button type="button" class="button" data-testid="start-again" @click="startAgain">Forget my settings</button></p>
        </div>
      </StepSection>
    </main>
  </div>
</template>

<style scoped>
.facts {
  margin: 0 0 1rem;
  font-size: var(--text-small);
}
.facts > div {
  display: grid;
  grid-template-columns: minmax(8rem, 12rem) minmax(0, 1fr);
  column-gap: 1rem;
  padding: 0.4rem 0;
  border-top: 1px solid var(--rule);
}
.facts dt {
  font-weight: 700;
}
.facts dd {
  margin: 0;
}
.fields {
  display: flex;
  flex-wrap: wrap;
  gap: var(--gutter);
}
.fields label {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  font-size: var(--text-small);
  font-weight: 700;
}
.fields input {
  width: 16rem;
  max-width: 100%;
  padding: 0.5rem 0.625rem;
  border: 1px solid var(--rule-strong);
  border-radius: 0;
  background: var(--bg);
  color: var(--ink);
  font: inherit;
  font-weight: 400;
}
.fields input:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
@media (max-width: 520px) {
  .facts > div {
    grid-template-columns: minmax(0, 1fr);
  }
}
.choices {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}
.small {
  font-size: var(--text-small);
  color: var(--muted);
}
</style>
