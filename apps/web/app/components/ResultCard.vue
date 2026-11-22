<script setup lang="ts">
import { formatById } from '@omsett/registry'
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

const from = computed(() => (props.sourceFormatId ? formatById(registry, props.sourceFormatId) : undefined))
const to = computed(() => formatById(registry, props.result.formatId))
// Picture to picture: there is something to look at side by side.
const comparable = computed(
  () => props.source !== undefined && from.value?.category === 'image' && to.value?.category === 'image',
)
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
/* How much smaller: the figure people came for. */
.delta {
  color: var(--accent-text);
  font-weight: 700;
}
</style>
