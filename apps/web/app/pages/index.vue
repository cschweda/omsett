<script setup lang="ts">
// The one screen: Drop, Pick, Results.
const queue = useConversionQueue()
const engines = useEngines()
const server = useServerHealth()
const { message } = usePoliteAnnouncer()

const dropZone = useTemplateRef<{ focus: () => void }>('dropZone')
const secure = ref(true)
const isMac = ref(false)

const percent = computed(() => Math.round(queue.overall.value * 100))

// Overall progress in the tab title, so the user can switch tabs while it runs.
useHead({
  title: computed(() => (queue.converting.value ? `${percent.value}% — Omsett` : 'Omsett')),
})

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault()
    void queue.convertAll()
  }
}

function convertAnother() {
  queue.reset()
  void engines.probe()
  void nextTick(() => dropZone.value?.focus())
}

onMounted(() => {
  secure.value = window.isSecureContext
  isMac.value = /Mac|iPhone|iPad/.test(navigator.platform)
  window.addEventListener('keydown', onKeydown)
  void engines.probe()
  void server.refresh()
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="page">
    <header class="header">
      <h1 class="wordmark">omsett<span class="dot">.</span></h1>
      <p class="tagline">Drop a file. Pick a format. Nothing leaves your device.</p>
    </header>

    <main class="main">
      <p v-if="!secure" class="insecure" data-testid="insecure">
        This copy of Omsett is being served without HTTPS, so some conversions are unavailable.
      </p>

      <DropZone ref="dropZone" @files="queue.add" />

      <ul v-if="queue.files.value.length" class="cards" aria-label="Files to convert">
        <FileCard v-for="entry in queue.files.value" :key="entry.id" :entry="entry" @remove="queue.remove" />
      </ul>

      <TargetPicker
        :targets="queue.targets.value"
        :model-value="queue.targetId.value"
        :via-server="server.state.value === 'reachable'"
        @select="queue.select"
      />

      <div class="convert">
        <UButton
          size="xl"
          :disabled="!queue.canConvert.value"
          :loading="queue.converting.value"
          class="convert-button"
          data-testid="convert"
          @click="queue.convertAll"
        >
          Convert <span aria-hidden="true">→</span>
        </UButton>
        <span class="shortcut muted">
          <UKbd :value="isMac ? '⌘' : 'Ctrl'" />
          <UKbd value="Enter" />
        </span>
      </div>

      <section v-if="queue.results.value.length" aria-labelledby="results-heading" class="results">
        <h2 id="results-heading" class="heading">Results</h2>
        <ul class="cards" aria-label="Converted files">
          <ResultCard v-for="result in queue.results.value" :key="result.id" :result="result" />
        </ul>
        <!-- TODO(phase-1): "Download all as ZIP" when there is more than one result. -->
        <UButton
          label="Convert another"
          color="neutral"
          variant="outline"
          class="another"
          data-testid="another"
          @click="convertAnother"
        />
      </section>
    </main>

    <AppFooter />

    <!-- The app's single live region. Polite: nothing in a conversion is urgent. -->
    <div role="status" aria-live="polite" class="sr-only" data-testid="announcer">{{ message }}</div>
  </div>
</template>

<style scoped>
.page {
  max-width: 1100px;
  margin: 0 auto;
  padding: 2rem 24px 3rem;
  display: flex;
  flex-direction: column;
  gap: 2rem;
}
.wordmark {
  margin: 0;
  font-size: clamp(3rem, 10vw, 5rem);
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.055em;
}
.dot {
  color: var(--accent);
}
.tagline {
  margin: 0.5rem 0 0;
  font-size: 1.125rem;
  color: var(--muted);
}
.main {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}
.insecure {
  margin: 0;
  padding: 0.75rem 1rem;
  border: 1px solid var(--rule-strong);
  border-radius: 4px;
}
.cards {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin: 0;
  padding: 0;
}
.convert {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 1rem;
}
/* 20px bold counts as large text, where white on Omsett blue passes (4.4:1 against a 3:1 bar). */
.convert-button {
  font-size: 1.25rem;
  font-weight: 700;
  padding: 0.75rem 1.75rem;
  background: var(--accent);
  color: var(--on-accent);
  /* No color transition: halfway between the disabled and enabled colors the label is unreadable. */
  transition: none;
}
.convert-button:disabled {
  background: transparent;
  color: var(--muted);
  box-shadow: inset 0 0 0 2px var(--rule-strong);
  opacity: 1;
}
.shortcut {
  display: inline-flex;
  gap: 0.25rem;
  align-items: center;
}
.results {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.heading {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 700;
}
.another {
  align-self: flex-start;
  color: var(--ink);
}
</style>
