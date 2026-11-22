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

defineExpose({ focus: () => input.value?.focus() })
</script>

<template>
  <section
    class="drop"
    :class="{ dragging }"
    aria-labelledby="drop-heading"
    @dragenter.prevent="dragging = true"
    @dragover.prevent="dragging = true"
    @dragleave.prevent="dragging = false"
    @drop.prevent="onDrop"
  >
    <h2 id="drop-heading" class="sr-only">Files</h2>
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
    <label for="file-input" class="choose">Choose files</label>
    <p id="drop-hint" class="hint">or drop them here · nothing leaves your device</p>
    <UButton
      :label="sampleLabel"
      color="neutral"
      variant="link"
      :loading="loadingSample"
      data-testid="sample"
      class="sample"
      @click="loadSample"
    />
  </section>
</template>

<style scoped>
.drop {
  min-height: 240px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 2rem 1.5rem;
  border: 2px dashed var(--rule-strong);
  border-radius: 4px;
  text-align: center;
}
.drop.dragging {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 8%, transparent);
}
.choose {
  display: inline-block;
  padding: 0.75rem 1.5rem;
  border: 2px solid var(--ink);
  border-radius: 4px;
  font-size: 1.25rem;
  font-weight: 700;
  cursor: pointer;
}
.choose:hover {
  background: var(--ink);
  color: var(--bg);
}
/* The input is visually hidden, so its focus ring is drawn on its label. */
.file-input:focus-visible + .choose {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.hint {
  color: var(--muted);
  margin: 0;
}
.sample {
  color: var(--ink);
  text-decoration: underline;
  text-underline-offset: 3px;
}
</style>
