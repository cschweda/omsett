<script setup lang="ts">
import { visitCounting, visitSignals, VISITS_SETTING, type VisitCounting } from '~/utils/visits'
import { testHook } from '~/utils/limits'

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
const site = () => testHook('visits', location) ?? config.visitsSite
onMounted(() => (counting.value = visitCounting(visitSignals(site()))))
function setCounting(on: boolean) {
  try {
    localStorage.setItem(VISITS_SETTING, on ? 'on' : 'off')
  } catch {
    // Without storage the choice cannot be kept, and the page says what is true now.
  }
  counting.value = visitCounting(visitSignals(site()))
}

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
          <p v-if="counting === 'not-set-up'" data-testid="visits-state">
            <strong>Visits are not counted on this copy of Omsett.</strong> There is nothing to turn off.
          </p>
          <template v-else-if="counting !== null">
            <p>
              Omsett counts visits with <a href="https://plausible.io/privacy-focused-web-analytics">Plausible</a>, which
              sets no cookie, keeps no record of a person, and cannot follow you to another site. No code of
              Plausible’s runs here: Omsett itself reports that a page was opened, and nothing more. It never
              learns what you converted.
            </p>
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
