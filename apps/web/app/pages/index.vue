<script setup lang="ts">
// The one screen, in three numbered moves: files, format, result.
const queue = useConversionQueue()
const engines = useEngines()
const server = useServerHealth()

const dropZone = useTemplateRef<{ focus: () => void; loadSample: () => Promise<void> }>('dropZone')
const secure = ref(true)
const isMac = ref(false)

const percent = computed(() => Math.round(queue.overall.value * 100))

const choices = queue.choices
// What the button will do, said on the button and beside it.
const convertLabel = computed(() => (queue.selected.value ? `Convert to ${queue.selected.value.format.name}` : 'Convert'))
const convertSummary = computed(() => {
  const target = queue.selected.value
  const ready = queue.files.value.filter((file) => file.detection.kind === 'known' && !file.problem)
  if (!target || ready.length === 0) return ''
  return ready.length === 1 ? `${ready[0]!.file.name} → ${target.format.name}` : `${ready.length} files → ${target.format.name}`
})

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

// The list of formats is long, and the result comes after it. When a conversion a person asked
// for is done, the result is brought to the top of the window, where the comparison can be seen.
function showResult() {
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  document.getElementById('results-heading')?.scrollIntoView({ block: 'start', behavior: calm ? 'auto' : 'smooth' })
}
watch(queue.arrived, async () => {
  await nextTick()
  showResult()
})

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault()
    void queue.convertAll()
  }
}

// Every result in one ZIP, packed in the worker. Two results with one name are told apart.
const zipping = ref(false)
async function downloadAll() {
  const results = queue.results.value
  if (zipping.value || results.length < 2) return
  zipping.value = true
  try {
    const names = uniqueNames(results.map((result) => result.name))
    const blob = await useEngines().zip(results.map((result, i) => ({ name: names[i]!, blob: result.blob })))
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'omsett.zip'
    link.click()
    // The browser has the file by the time the click returns; the address is no longer needed.
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  } finally {
    zipping.value = false
  }
}

function sourceOf(sourceId: string) {
  const entry = queue.files.value.find((f) => f.id === sourceId)
  return {
    blob: entry?.file,
    formatId: entry?.detection.kind === 'known' ? entry.detection.format.id : undefined,
  }
}

// A file dropped anywhere on the page is taken as dropped in step 1. Without this, a drop that
// misses the box makes the browser leave the page and open the file.
function onDragOver(event: DragEvent) {
  if (event.dataTransfer?.types.includes('Files')) event.preventDefault()
}
function onDropAnywhere(event: DragEvent) {
  // The box in step 1 has dealt with its own.
  if (event.defaultPrevented) return
  const dropped = [...(event.dataTransfer?.files ?? [])]
  if (dropped.length === 0) return
  event.preventDefault()
  void queue.add(dropped)
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
  window.addEventListener('dragover', onDragOver)
  window.addEventListener('drop', onDropAnywhere)
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
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('dragover', onDragOver)
  window.removeEventListener('drop', onDropAnywhere)
})
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
          :busy="queue.converting.value"
          @select="queue.select"
          @convert="queue.convertTo"
        />

        <QualityControl
          v-if="queue.quality.value !== null && queue.defaultQuality.value !== null"
          v-model="queue.quality.value"
          :suggested="queue.defaultQuality.value"
        />

        <!-- A look at the result before converting: one picture, a picture format, and a
             converter that is already here. One that is not is fetched only when asked for. -->
        <div v-if="queue.preview.value" class="preview" data-testid="preview" :data-state="queue.preview.value.state">
          <CompareSlider
            v-if="queue.preview.value.blob"
            preview
            :before="queue.preview.value.source"
            :after="queue.preview.value.blob"
            :before-label="`Original ${formatBytes(queue.preview.value.source.size)}`"
            :after-label="`${queue.selected.value?.format.name ?? ''} ${formatBytes(queue.preview.value.blob.size)}`"
            :quality="queue.quality.value"
            :suggested-quality="queue.defaultQuality.value"
            :busy="queue.preview.value.state === 'working'"
            @update:quality="queue.quality.value = $event"
          />
          <p v-else-if="queue.preview.value.state === 'needs'" class="preview-ask">
            <button type="button" class="button" data-testid="preview-fetch" @click="queue.allowPreview()">Show a preview</button>
            <span>
              Seeing how {{ queue.selected.value?.format.name }} will look means fetching its converter first:
              {{ formatBytes(queue.preview.value.bytes ?? 0) }}, once.
            </span>
          </p>
          <p v-else-if="queue.preview.value.state === 'working'" class="preview-ask" role="status">Making a preview…</p>
        </div>

        <LanguageControl v-if="typeof choices.language === 'string'" v-model="choices.language" />
        <TableOptions
          v-if="typeof choices.headerRow === 'boolean'"
          v-model:named="choices.headerRow"
          v-model:shape="choices.shape as string | undefined"
        />
        <SheetControl
          v-if="typeof choices.sheet === 'string'"
          v-model="choices.sheet"
          :files="queue.files.value.map((entry) => entry.file)"
        />

        <!-- Once there is something to convert this stays at the foot of the window, so that
             it is in sight wherever in the list of formats the choice was made. -->
        <div class="convert" :class="{ armed: queue.canConvert.value || queue.converting.value }">
          <UButton
            size="xl"
            :label="convertLabel"
            :disabled="!queue.canConvert.value"
            :loading="queue.converting.value"
            class="convert-button"
            data-testid="convert"
            @click="queue.convertAll()"
          />
          <span v-if="convertSummary" class="summary figures" data-testid="convert-summary">{{ convertSummary }}</span>
          <span class="shortcut">
            <UKbd :value="isMac ? '⌘' : 'Ctrl'" />
            <UKbd value="Enter" />
          </span>
          <!-- The result is below the list of formats. Once there is one, this goes to it. -->
          <button
            v-if="queue.results.value.length && !queue.converting.value"
            type="button"
            class="to-result"
            data-testid="to-result"
            @click="showResult"
          >
            {{ queue.results.value.length === 1 ? 'Converted. See the result' : `${queue.results.value.length} converted. See the results` }}
          </button>
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
        <div class="after">
          <button
            v-if="queue.results.value.length > 1"
            type="button"
            class="button solid"
            data-testid="download-all"
            :disabled="zipping"
            @click="downloadAll"
          >
            {{ zipping ? 'Packing' : `Download all ${queue.results.value.length} as a ZIP` }}
          </button>
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
/* With a file and a format chosen, the button is pinned to the foot of the window. */
.convert.armed {
  position: sticky;
  bottom: 0;
  z-index: 5;
  margin: 0 calc(-1 * var(--margin));
  padding: 0.875rem var(--margin);
  border-top: 2px solid var(--accent);
  background: var(--bg);
}
.preview {
  max-width: 100%;
}
.preview-ask {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
  margin: 0;
  padding-top: 0.875rem;
  border-top: 4px solid var(--accent);
  color: var(--muted);
}
/* Green is for what is ready. This says a result is, and goes to it. */
.to-result {
  padding: 0.6rem 1rem;
  border: 2px solid var(--positive);
  border-radius: 0;
  background: transparent;
  color: var(--positive);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}
.to-result:hover {
  background: var(--positive);
  color: var(--bg);
}
.to-result:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.summary {
  font-size: var(--text-small);
  font-weight: 700;
  overflow-wrap: anywhere;
}
.after {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
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
