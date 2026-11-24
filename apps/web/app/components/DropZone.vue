<script setup lang="ts">
import { acceptAttribute, formatForDetected } from '@omsett/registry'
import { detect } from '@omsett/detect'
import assets from '~/generated/engine-assets.json'
import { registry } from '~/utils/registry'

const emit = defineEmits<{ files: [files: File[]] }>()

// Computed from the registry: every registered format's MIME types and extensions.
const accept = acceptAttribute(registry)
const input = useTemplateRef<HTMLInputElement>('input')
const dragging = ref(false)
// Files to try the converter with. Each is named on its button by what it really is, read from
// its bytes; until that is known, by nothing more than "a sample file".
interface Sample {
  url: string
  name: string
  /** The format's id and name, once the file has been identified. */
  id: string | null
  label: string
}
const samples = ref<Sample[]>(assets.samples.map((sample, index) => ({ ...sample, id: null, label: index === 0 ? 'Try a sample file' : '' })))
const loadingSample = ref(false)

function onChange(event: Event) {
  const target = event.target as HTMLInputElement
  if (target.files?.length) emit('files', [...target.files])
  // Let the same file be chosen again.
  target.value = ''
}

function onDrop(event: DragEvent) {
  dragging.value = false
  const dropped = [...(event.dataTransfer?.files ?? [])]
  if (dropped.length) emit('files', dropped)
}

function onPaste(event: ClipboardEvent) {
  const pasted = [...(event.clipboardData?.files ?? [])]
  if (pasted.length) {
    event.preventDefault()
    emit('files', pasted)
  }
}

const sampleBlob = async (url: string): Promise<Blob> => (await fetch(url)).blob()

/** Add a sample as if it had been dropped: the first, where none is named. */
async function loadSample(sample: { url: string; name: string } = assets.samples[0]!) {
  loadingSample.value = true
  try {
    const blob = await sampleBlob(sample.url)
    emit('files', [new File([blob], sample.name, { type: blob.type })])
  } finally {
    loadingSample.value = false
  }
}

onMounted(async () => {
  window.addEventListener('paste', onPaste)
  // Name each sample by what it really is, from its bytes and the registry.
  await Promise.all(
    samples.value.map(async (sample) => {
      try {
        const found = await detect(await sampleBlob(sample.url), registry.formats)
        const format = found.kind === 'known' ? formatForDetected(registry, found.ext) : undefined
        if (!format) return
        sample.id = format.id
        sample.label = `Try a sample ${format.name}`
      } catch {
        // The first keeps its plain label; the others are not offered.
      }
    }),
  )
})
onBeforeUnmount(() => window.removeEventListener('paste', onPaste))

defineExpose({ focus: () => input.value?.focus(), loadSample })
</script>

<template>
  <div
    class="drop"
    :class="{ dragging }"
    @dragenter.prevent="dragging = true"
    @dragover.prevent="dragging = true"
    @dragleave.prevent="dragging = false"
    @drop.prevent="onDrop"
  >
    <p class="call">Drop files here</p>
    <div class="actions">
      <!-- A real file input is the control; drag-and-drop is an enhancement. -->
      <input
        id="file-input"
        ref="input"
        class="sr-only file-input"
        type="file"
        multiple
        :accept="accept"
        aria-describedby="drop-hint"
        @change="onChange"
      >
      <label for="file-input" class="button choose">Choose files</label>
      <template v-for="(sample, index) in samples" :key="sample.url">
        <button
          v-if="sample.label"
          type="button"
          class="text-button"
          :data-testid="index === 0 ? 'sample' : `sample-${sample.id}`"
          :disabled="loadingSample"
          @click="loadSample(sample)"
        >
          {{ sample.label }}
        </button>
      </template>
    </div>
    <p id="drop-hint" class="hint">You can also paste an image. Files are converted in this tab and are never uploaded.</p>
  </div>
</template>

<style scoped>
.drop {
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 1rem;
  min-height: 240px;
  padding: var(--gutter);
  background: var(--surface);
}
.drop.dragging {
  background: var(--accent);
  color: var(--on-accent);
}
.drop.dragging .hint,
.drop.dragging .text-button {
  color: var(--on-accent);
}
.drop.dragging .choose {
  border-color: var(--on-accent);
  color: var(--on-accent);
}
.call {
  margin: 0;
  font-size: var(--text-title);
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.03em;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 1.25rem;
}
/* The input is visually hidden, so its focus ring is drawn on its label. */
.file-input:focus-visible + .choose {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.hint {
  margin: 0;
  max-width: 44ch;
  font-size: var(--text-small);
  color: var(--muted);
}
</style>
