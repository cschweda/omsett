<script setup lang="ts">
import type { QueueFile } from '~/composables/useConversionQueue'
import { switchedOffReason } from '@omsett/registry'
import { formatBytes } from '~/utils/format-bytes'

const props = defineProps<{
  entry: QueueFile
  /** Whole seconds this file has been worked on, while it is. */
  seconds?: number
}>()
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
    // Recognised, and not something Omsett converts so far: said by name, so it is clear the
    // file was understood.
    return switchedOffReason(props.entry.detection.ext) ?? `${label.value} is not supported yet`
  }
  if (!known.value) return 'Unsupported format'
  if (props.entry.mismatch) return `Named like another format, but the contents are ${known.value.format.name}.`
  return ''
})

// While a batch runs, each file says where it stands. The seconds appear once there are a few
// of them: a count that starts at once is noise on a conversion that takes half a second.
const active = computed(() => props.entry.stage === 'loading' || props.entry.stage === 'working')
const stage = computed(() => {
  const time = (props.seconds ?? 0) >= 2 ? `, ${props.seconds} s` : ''
  if (props.entry.stage === 'waiting') return 'Waiting'
  if (props.entry.stage === 'loading') return `Getting the converter (${formatBytes(props.entry.loadingBytes)}, once)${time}`
  if (props.entry.stage === 'working') return `Converting${time}`
  return ''
})

// Only a picture has a preview. Anything else gets no empty square where one would be.
const pictured = computed(() => known.value !== null && ['image', 'vector'].includes(known.value.format.category))

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
  <li class="file-card" :class="{ plain: !pictured }" :data-status="entry.status">
    <div v-if="pictured" class="thumb" aria-hidden="true">
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
    <div v-if="entry.status !== 'ready'" class="progress">
      <div
        class="bar"
        :class="{ active }"
        role="progressbar"
        aria-valuemin="0"
        aria-valuemax="100"
        :aria-valuenow="Math.round(entry.progress * 100)"
        :aria-label="`Converting ${entry.file.name}`"
        data-testid="file-progress"
      >
        <div class="fill" :style="{ width: `${Math.round(entry.progress * 100)}%` }" />
      </div>
      <p v-if="stage" class="stage figures" data-testid="file-stage">{{ stage }}</p>
    </div>
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
.file-card.plain {
  grid-template-columns: minmax(0, 1fr) auto;
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
.stage {
  margin: 0.375rem 0 0;
  font-size: var(--text-small);
  color: var(--muted);
}
</style>

<!-- The bar is shared with the batch's own, beside the Convert button. -->
<style>
.bar {
  position: relative;
  height: 4px;
  overflow: hidden;
  background: var(--rule);
}
.bar .fill {
  height: 100%;
  background: var(--accent);
  transition: width 200ms linear;
}
/* A band of light crossing the whole track, filled or not: the sign that work is going on
   between the moments an engine can say how far it has got. */
.bar.active::after {
  content: '';
  position: absolute;
  inset: 0;
  width: 30%;
  background: linear-gradient(90deg, transparent, var(--ink), transparent);
  opacity: 0.35;
  animation: bar-sweep 1.4s linear infinite;
}
@keyframes bar-sweep {
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(334%);
  }
}
/* With motion turned down the band stands still; the count of seconds is what moves. */
@media (prefers-reduced-motion: reduce) {
  .bar.active::after {
    animation: none;
    width: 100%;
    opacity: 0.15;
  }
  .bar .fill {
    transition: none;
  }
}
</style>
