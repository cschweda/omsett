<script setup lang="ts">
import { previewBlob, type TextPreview } from '~/utils/text-preview'

// The start of the original and of the converted file, next to each other. File contents are
// put on the page as text and never as markup: a file of HTML is shown, not run.
const props = defineProps<{
  before: Blob
  after: Blob
  beforeLabel: string
  afterLabel: string
}>()

const sides = ref<Array<{ side: 'before' | 'after'; label: string; preview: TextPreview }>>([])
const ready = ref(false)

onMounted(() => {
  watch(
    () => [props.before, props.after] as const,
    async ([before, after]) => {
      ready.value = false
      const [first, second] = await Promise.all([previewBlob(before), previewBlob(after)])
      // A newer conversion may have replaced these while they were being read.
      if (before !== props.before || after !== props.after) return
      sides.value = [
        { side: 'before', label: props.beforeLabel, preview: first },
        { side: 'after', label: props.afterLabel, preview: second },
      ]
      ready.value = true
    },
    { immediate: true },
  )
})

const numbers = (count: number) => Array.from({ length: count }, (_, i) => i + 1).join('\n')
</script>

<template>
  <div class="text-compare" data-testid="text-compare" :data-ready="ready">
    <section v-for="pane in sides" :key="pane.side" class="pane" :data-side="pane.side">
      <h3 class="label figures">{{ pane.label }}</h3>
      <div class="scroll" tabindex="0">
        <pre class="numbers" aria-hidden="true">{{ numbers(pane.preview.lines.length) }}</pre>
        <pre class="file-text" data-testid="text-contents">{{ pane.preview.lines.join('\n') }}</pre>
      </div>
      <p v-if="pane.preview.more" class="more" data-testid="text-more">
        The start of the file. The download has all of it.
      </p>
    </section>
  </div>
</template>

<style scoped>
.text-compare {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 1rem var(--gutter);
  margin: 1rem 0 0;
}
@media (min-width: 760px) {
  .text-compare {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }
}
.pane {
  min-width: 0;
}
.label {
  margin: 0;
  padding: 0 0 0.375rem;
  border-bottom: 1px solid var(--rule-strong);
  font-size: var(--text-small);
  font-weight: 700;
}
.scroll {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  max-height: 24rem;
  overflow: auto;
  background: var(--surface);
}
.scroll:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
pre {
  margin: 0;
  padding: 0.625rem 0.75rem;
  font-family: var(--font-file);
  font-size: var(--text-small);
  line-height: 1.5;
  tab-size: 4;
}
.numbers {
  position: sticky;
  left: 0;
  padding-right: 0.625rem;
  border-right: 1px solid var(--rule);
  background: var(--surface);
  color: var(--muted);
  text-align: right;
  user-select: none;
}
.file-text {
  width: max-content;
  min-width: 100%;
  white-space: pre;
}
.more {
  margin: 0.375rem 0 0;
  font-size: var(--text-small);
  color: var(--muted);
}
</style>
