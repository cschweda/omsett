<script setup lang="ts">
import { formatById, isReadable } from '@omsett/registry'
import type { QueueResult } from '~/composables/useConversionQueue'
import { formatBytes, formatDelta } from '~/utils/format-bytes'
import { registry } from '~/utils/registry'

const props = defineProps<{
  result: QueueResult
  /** The file this was converted from, and its format, for the comparison. */
  source?: Blob
  sourceFormatId?: string
  /** The batch's quality setting, shown beside the comparison so it can be changed in view. */
  quality?: number | null
  suggestedQuality?: number | null
  busy?: boolean
}>()
defineEmits<{ 'update:quality': [value: number] }>()

// One object URL per output, revoked when it is replaced or the card goes away.
const url = ref('')
function release() {
  if (url.value) URL.revokeObjectURL(url.value)
  url.value = ''
}
onMounted(() => {
  watch(
    () => props.result.blob,
    (blob) => {
      release()
      url.value = URL.createObjectURL(blob)
    },
    { immediate: true },
  )
})
onBeforeUnmount(release)

// The converted file can be checked for accessibility too, where it is a kind a checker reads.
// Asked the same way as for the file that was added: nothing is sent until the person says so.
const check = useFileCheck(
  () => new File([props.result.blob], props.result.name, { type: props.result.blob.type }),
  () => formatById(registry, props.result.formatId)?.category,
)
// Converted again, it is a new file, and the score of the old one is not its score.
watch(() => props.result.blob, check.forget)

const from = computed(() => (props.sourceFormatId ? formatById(registry, props.sourceFormatId) : undefined))
const to = computed(() => formatById(registry, props.result.formatId))
// Picture to picture: there is something to look at side by side.
const comparable = computed(
  () => props.source !== undefined && from.value?.category === 'image' && to.value?.category === 'image',
)
// Text to text (data, subtitles): there is something to read side by side.
// A result that is text can be read before it is downloaded, beside the original where that is
// text too, and alone where it is not (a workbook, a Word document).
const readable = computed(() => !!to.value && isReadable(to.value.category))
const bothReadable = computed(() => readable.value && !!from.value && isReadable(from.value.category))
const delta = computed(() => formatDelta(props.result.inputBytes, props.result.blob.size))
</script>

<template>
  <li class="result-card" :data-engine="result.engine">
    <div class="meta">
      <p class="name">{{ result.name }}</p>
      <p class="facts figures">
        <span data-testid="output-size" :data-bytes="result.blob.size">{{ formatBytes(result.blob.size) }}</span>
        <span v-if="delta" class="delta" data-testid="delta">{{ delta }}</span>
        <span>converted on your device by {{ result.engine }}</span>
      </p>
    </div>
    <a class="button solid" :href="url || undefined" :download="result.name" data-testid="download">
      Download<span class="sr-only"> {{ result.name }}</span>
    </a>
    <!-- A button, not a link in passing: after converting a document, whether it is still accessible is the next question. -->
    <p v-if="check.offered && check.stage === 'closed'" class="check-hint" data-testid="result-check-hint">
      {{ check.result ? 'This file has been checked.' : 'To see that nothing a screen reader relies on was lost, check the converted file.' }}
    </p>
    <button
      v-if="check.offered"
      type="button"
      class="button check-toggle"
      :aria-expanded="check.stage !== 'closed'"
      data-testid="result-check-toggle"
      @click="check.toggle"
    >
      {{ check.stage !== 'closed' ? 'Close the accessibility check' : check.result ? 'Show the accessibility score' : 'Check accessibility' }}<span class="sr-only"> of {{ result.name }}</span>
    </button>
    <CheckPanel :check="check" which="This is the converted file." />
    <!-- What converting found out about the file, which the person could not have known before. -->
    <p v-for="note in result.notes" :key="note" class="found" data-testid="result-note">{{ note }}</p>
    <CompareSlider
      v-if="comparable && source"
      :before="source"
      :after="result.blob"
      :before-label="`${from?.name} ${formatBytes(result.inputBytes)}`"
      :after-label="`${to?.name} ${formatBytes(result.blob.size)}`"
      :quality="quality"
      :suggested-quality="suggestedQuality"
      :busy="busy"
      @update:quality="$emit('update:quality', $event)"
    />
    <TextCompare
      v-else-if="readable"
      :before="bothReadable ? source : undefined"
      :after="result.blob"
      :before-label="`${from?.name} ${formatBytes(result.inputBytes)}`"
      :after-label="`${to?.name} ${formatBytes(result.blob.size)}`"
    />
  </li>
</template>

<style scoped>
.result-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  column-gap: 1rem;
  align-items: center;
  padding: 0.875rem 0 1.5rem;
  border-top: 1px solid var(--rule);
  list-style: none;
}
.check-hint {
  grid-column: 1 / -1;
  margin: 0.75rem 0 0;
  max-width: 60ch;
  font-size: var(--text-small);
  color: var(--muted);
}
/* Under the name, at the left, where the eye is after reading what was made. */
.check-toggle {
  grid-column: 1 / -1;
  justify-self: start;
  margin-top: 0.5rem;
  font-size: var(--text-small);
}
.name {
  margin: 0;
  font-size: var(--text-lead);
  font-weight: 700;
  letter-spacing: -0.015em;
  overflow-wrap: anywhere;
}
.facts {
  display: flex;
  flex-wrap: wrap;
  gap: 0 0.875rem;
  margin: 0.125rem 0 0;
  font-size: var(--text-small);
  color: var(--muted);
}
.facts > :first-child {
  color: var(--ink);
  font-weight: 700;
}
.found {
  grid-column: 1 / -1;
  margin: 0.75rem 0 0;
  padding: 0.5rem 0.75rem;
  border-left: 3px solid var(--accent);
  font-size: var(--text-small);
}
/* How much smaller: the figure people came for. */
.delta {
  color: var(--accent-text);
  font-weight: 700;
}
</style>
