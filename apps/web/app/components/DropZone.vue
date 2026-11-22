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
const sampleLabel = ref('Try a sample file')
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

async function sampleBlob(): Promise<Blob> {
  const response = await fetch(assets.sample.url)
  return response.blob()
}

async function loadSample() {
  loadingSample.value = true
  try {
    const blob = await sampleBlob()
    emit('files', [new File([blob], assets.sample.name, { type: blob.type })])
  } finally {
    loadingSample.value = false
  }
}

onMounted(async () => {
  window.addEventListener('paste', onPaste)
  // Name the sample by what it really is, from its bytes and the registry.
  try {
    const found = await detect(await sampleBlob(), registry.formats)
    const format = found.kind === 'known' ? formatForDetected(registry, found.ext) : undefined
    if (format) sampleLabel.value = `Try a sample ${format.name}`
  } catch {
    // The generic label stands.
  }
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
      <button type="button" class="text-button" data-testid="sample" :disabled="loadingSample" @click="loadSample">
        {{ sampleLabel }}
      </button>
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
