<script setup lang="ts">
import type { QueueFile } from '~/composables/useConversionQueue'
import { switchedOffReason } from '@omsett/registry'
import { formatBytes } from '~/utils/format-bytes'

const props = defineProps<{ entry: QueueFile }>()
defineEmits<{ remove: [id: string] }>()

const canvas = useTemplateRef<HTMLCanvasElement>('canvas')

const known = computed(() => (props.entry.detection.kind === 'known' ? props.entry.detection : null))
const label = computed(() => {
  if (known.value) return known.value.format.name
  if (props.entry.detection.kind === 'unregistered') return props.entry.detection.ext.toUpperCase()
  return 'Unknown'
})
const note = computed(() => {
  if (props.entry.error) return props.entry.error
  if (props.entry.problem) return props.entry.problem
  if (props.entry.detection.kind === 'unregistered') {
    return switchedOffReason(props.entry.detection.ext) ?? 'Unsupported format'
  }
  if (!known.value) return 'Unsupported format'
  if (props.entry.mismatch) return `Named like another format, but the contents are ${known.value.format.name}.`
  return ''
})

// A note is either information (a mislabeled file) or a failure. Only a failure is red.
const failed = computed(() => Boolean(props.entry.error || props.entry.problem || !known.value))

// Draw the worker-made bitmap; the page itself never decodes the file.
watch(
  () => [props.entry.thumbnail, canvas.value] as const,
  ([bitmap, element]) => {
    if (!bitmap || !element) return
    element.width = bitmap.width
    element.height = bitmap.height
    element.getContext('2d')?.drawImage(bitmap, 0, 0)
  },
  { immediate: true, flush: 'post' },
)
</script>

<template>
  <li class="file-card" :data-status="entry.status">
    <div class="thumb" aria-hidden="true">
      <canvas v-show="entry.thumbnail" ref="canvas" />
    </div>
    <div class="meta">
      <p class="name">{{ entry.file.name }}</p>
      <p class="facts figures">
        <span class="format">{{ label }}</span>
        <span>{{ formatBytes(entry.file.size) }}</span>
        <span v-if="known?.dimensions">{{ known.dimensions.width }} × {{ known.dimensions.height }}</span>
      </p>
      <p v-if="note" class="note" :class="{ wrong: failed }" data-testid="file-note">{{ note }}</p>
    </div>
    <button
      type="button"
      class="text-button remove"
      :aria-label="`Remove ${entry.file.name}`"
      @click="$emit('remove', entry.id)"
    >
      Remove
    </button>
    <UProgress
      v-if="entry.status !== 'ready'"
      :model-value="Math.round(entry.progress * 100)"
      :max="100"
      size="xs"
      class="progress"
      :aria-label="`Converting ${entry.file.name}`"
    />
  </li>
</template>

<style scoped>
.file-card {
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr) auto;
  column-gap: 1rem;
  align-items: center;
  padding: 0.875rem 0;
  border-top: 1px solid var(--rule);
  list-style: none;
}
.file-card:last-child {
  border-bottom: 1px solid var(--rule);
}
.thumb {
  width: 56px;
  height: 56px;
  display: grid;
  place-items: center;
  background: var(--surface);
}
.thumb canvas {
  max-width: 56px;
  max-height: 56px;
}
.name {
  margin: 0;
  font-weight: 500;
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
.format {
  color: var(--ink);
  font-weight: 700;
}
.note {
  margin: 0.25rem 0 0;
  font-size: var(--text-small);
}
.note.wrong {
  color: var(--signal);
  font-weight: 700;
}
.note.wrong::before {
  content: '';
  display: inline-block;
  width: 0.5rem;
  height: 0.5rem;
  margin-right: 0.45rem;
  background: var(--signal);
}
.remove {
  font-size: var(--text-small);
}
.progress {
  grid-column: 1 / -1;
  margin-top: 0.75rem;
}
</style>
