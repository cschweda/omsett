<script setup lang="ts">
// The one screen, in three numbered moves: files, format, result.
const queue = useConversionQueue()
const engines = useEngines()
const server = useServerHealth()

const dropZone = useTemplateRef<{ focus: () => void; loadSample: () => Promise<void> }>('dropZone')
const secure = ref(true)
const isMac = ref(false)

const percent = computed(() => Math.round(queue.overall.value * 100))

const batchLine = computed(() => {
  const batch = queue.batch.value
  if (!batch) return ''
  const seconds = queue.secondsSince(batch.startedAt)
  const time = seconds >= 2 ? `, ${seconds} s` : ''
  const position = Math.min(Math.max(batch.position, 1), batch.total)
  return batch.total > 1 ? `Converting ${position} of ${batch.total}${time}` : `Converting${time}`
})

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

function sourceOf(sourceId: string) {
  const entry = queue.files.value.find((f) => f.id === sourceId)
  return {
    blob: entry?.file,
    formatId: entry?.detection.kind === 'known' ? entry.detection.format.id : undefined,
  }
}

function convertAnother() {
  queue.reset()
  void engines.probe()
  void nextTick(() => dropZone.value?.focus())
}

onMounted(async () => {
  secure.value = window.isSecureContext
  isMac.value = /Mac|iPhone|iPad/.test(navigator.platform)
  window.addEventListener('keydown', onKeydown)
  await engines.probe()

  // Development only: `?demo` loads the sample and converts it, so the finished state can be
  // looked at without clicking through. Removed from production builds.
  if (import.meta.dev && new URLSearchParams(location.search).has('demo')) {
    await dropZone.value?.loadSample()
    for (let i = 0; i < 50 && queue.files.value.length === 0; i++) await new Promise((r) => setTimeout(r, 100))
    const first = queue.targets.value.find((t) => t.route)
    if (first) {
      queue.select(first.format.id)
      await queue.convertAll()
    }
  }
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div>
    <WhatsNewBanner />
    <header class="masthead">
      <h1 class="wordmark">omsett<span class="dot">.</span></h1>
      <p class="tagline">Drop a file. Pick a format.<br>Nothing leaves your device.</p>
    </header>

    <main>
      <p v-if="!secure" class="insecure" data-testid="insecure">
        This copy of Omsett is being served without HTTPS, so some conversions are unavailable.
      </p>

      <StepSection :step="1" title="Files" heading-id="step-files">
        <DropZone ref="dropZone" @files="queue.add" />
        <p v-if="queue.notice.value" class="notice" data-testid="notice">{{ queue.notice.value }}</p>
        <ul v-if="queue.files.value.length" class="rows" aria-label="Files to convert">
          <FileCard
            v-for="entry in queue.files.value"
            :key="entry.id"
            :entry="entry"
            :seconds="queue.secondsSince(entry.startedAt)"
            @remove="queue.remove"
          />
        </ul>
      </StepSection>

      <StepSection :step="2" title="Convert to" heading-id="pick-heading">
        <TargetPicker
          :targets="queue.targets.value"
          :model-value="queue.targetId.value"
          :via-server="server.state.value === 'reachable'"
          labelledby="pick-heading"
          :waiting="queue.waiting.value"
          @select="queue.select"
        />

        <QualityControl
          v-if="queue.quality.value !== null && queue.defaultQuality.value !== null"
          v-model="queue.quality.value"
          :suggested="queue.defaultQuality.value"
        />

        <div class="convert">
          <UButton
            size="xl"
            label="Convert"
            :disabled="!queue.canConvert.value"
            :loading="queue.converting.value"
            class="convert-button"
            data-testid="convert"
            @click="queue.convertAll()"
          />
          <span class="shortcut">
            <UKbd :value="isMac ? '⌘' : 'Ctrl'" />
            <UKbd value="Enter" />
          </span>
          <!-- The whole batch at a glance: which file it is on, and that it is still going. -->
          <div v-if="queue.batch.value" class="batch" data-testid="batch">
            <p class="batch-line figures" data-testid="batch-line">{{ batchLine }}</p>
            <div
              class="bar active"
              role="progressbar"
              aria-valuemin="0"
              aria-valuemax="100"
              :aria-valuenow="percent"
              aria-label="Converting all files"
            >
              <div class="fill" :style="{ width: `${percent}%` }" />
            </div>
          </div>
        </div>
      </StepSection>

      <StepSection v-if="queue.results.value.length" :step="3" title="Result" heading-id="results-heading">
        <ul class="rows" aria-label="Converted files">
          <ResultCard
            v-for="result in queue.results.value"
            :key="result.id"
            :result="result"
            :source="sourceOf(result.sourceId).blob"
            :source-format-id="sourceOf(result.sourceId).formatId"
            :quality="queue.quality.value"
            :suggested-quality="queue.defaultQuality.value"
            :busy="queue.converting.value"
            @update:quality="queue.quality.value = $event"
          />
        </ul>
        <!-- TODO(phase-1): "Download all as ZIP" when there is more than one result. -->
        <div>
          <button type="button" class="button" data-testid="another" @click="convertAnother">Convert another</button>
        </div>
      </StepSection>
    </main>
  </div>
</template>

<style scoped>
/* The wordmark is the one loud thing on the page. Everything under it is quiet. */
.masthead {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  column-gap: var(--gutter);
  align-items: end;
  padding-bottom: 2.5rem;
}
.wordmark {
  grid-column: 1 / span 8;
  margin: 0 0 0 -0.045em;
  font-size: clamp(4.5rem, 15vw, 11rem);
  font-weight: 700;
  line-height: 0.82;
  letter-spacing: -0.06em;
}
.dot {
  color: var(--accent);
}
.tagline {
  grid-column: 9 / -1;
  margin: 0;
  font-size: var(--text-lead);
  font-weight: 500;
  line-height: 1.25;
  letter-spacing: -0.01em;
}
@media (max-width: 760px) {
  .wordmark,
  .tagline {
    grid-column: 1 / -1;
  }
  .tagline {
    margin-top: 1.25rem;
  }
}

.insecure {
  margin: 0 0 1.5rem;
  padding: 0.75rem 1rem;
  border-left: 3px solid var(--accent);
  background: var(--surface);
}
.rows {
  margin: 0;
  padding: 0;
}
.notice {
  margin: 0;
  font-size: var(--text-small);
  font-weight: 700;
}
.convert {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 1rem;
}
.batch {
  flex: 1 1 14rem;
  min-width: 0;
}
.batch-line {
  margin: 0 0 0.375rem;
  font-size: var(--text-small);
  font-weight: 700;
}
/* 20px bold counts as large text, where white on Omsett blue passes (4.4:1 against a 3:1 bar). */
.convert-button {
  padding: 0.9rem 2.5rem;
  border-radius: 0;
  background: var(--accent);
  color: var(--on-accent);
  font-size: var(--text-lead);
  font-weight: 700;
  letter-spacing: -0.01em;
  /* No color transition: halfway between the disabled and enabled colors the label is unreadable. */
  transition: none;
}
.convert-button:hover:not(:disabled) {
  background: var(--ink);
  color: var(--bg);
}
.convert-button:disabled {
  background: transparent;
  color: var(--muted);
  box-shadow: inset 0 0 0 1px var(--rule-strong);
  opacity: 1;
}
.shortcut {
  display: inline-flex;
  gap: 0.25rem;
  align-items: center;
  color: var(--muted);
}
</style>
