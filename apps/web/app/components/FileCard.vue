<script setup lang="ts">
import type { QueueFile } from '~/composables/useConversionQueue'
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
  if (!known.value) return 'Unsupported format'
  if (props.entry.mismatch) return `Named like another format, but the contents are ${known.value.format.name}.`
  return ''
})

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
  <UCard as="li" class="file-card" :data-status="entry.status" :ui="{ body: 'p-3 sm:p-3' }">
    <div class="row">
      <div class="thumb" aria-hidden="true">
        <canvas v-show="entry.thumbnail" ref="canvas" />
      </div>
      <div class="meta">
        <p class="name mono">{{ entry.file.name }}</p>
        <p class="facts">
          <UBadge :label="label" color="neutral" variant="subtle" size="sm" class="mono format" />
          <span class="mono muted">{{ formatBytes(entry.file.size) }}</span>
          <span v-if="known?.dimensions" class="mono muted">
            {{ known.dimensions.width }} × {{ known.dimensions.height }}
          </span>
        </p>
        <p v-if="note" class="note" data-testid="file-note">{{ note }}</p>
      </div>
      <UButton
        label="Remove"
        color="neutral"
        variant="outline"
        size="sm"
        :aria-label="`Remove ${entry.file.name}`"
        class="remove"
        @click="$emit('remove', entry.id)"
      />
    </div>
    <UProgress
      v-if="entry.status !== 'ready'"
      :model-value="Math.round(entry.progress * 100)"
      :max="100"
      size="sm"
      class="progress"
      :aria-label="`Converting ${entry.file.name}`"
    />
  </UCard>
</template>

<style scoped>
.file-card {
  list-style: none;
  background: var(--surface);
}
.row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.thumb {
  flex: none;
  width: 64px;
  height: 64px;
  display: grid;
  place-items: center;
  border: 1px solid var(--rule);
  background: var(--bg);
}
.thumb canvas {
  max-width: 64px;
  max-height: 64px;
}
.meta {
  min-width: 0;
  flex: 1;
}
.name {
  margin: 0;
  overflow-wrap: anywhere;
}
.facts {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  margin: 0.25rem 0 0;
  font-size: 0.875rem;
}
.format {
  color: var(--ink);
}
.note {
  margin: 0.25rem 0 0;
  font-size: 0.875rem;
}
.remove {
  color: var(--ink);
  flex: none;
}
.progress {
  margin-top: 0.75rem;
}
</style>
