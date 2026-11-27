<script setup lang="ts">
// Shown when a PDF is split: a PDF for every page, or the pages named, in that order, as one PDF.
const take = defineModel<string>({ required: true })
const range = ref(take.value === 'every' ? '' : take.value)
const kind = ref<'every' | 'range'>(take.value === 'every' ? 'every' : 'range')
watch([kind, range], ([now, words]) => {
  take.value = now === 'every' ? 'every' : words
})
</script>

<template>
  <fieldset class="pdf-take" data-testid="pdf-take">
    <legend class="label">Pages</legend>
    <label class="choice">
      <input v-model="kind" type="radio" name="pdf-take" value="every" data-testid="pdf-take-every">
      <span><strong>Every page as its own PDF</strong> <span class="about">Up to 500 pages. Download them together as a ZIP.</span></span>
    </label>
    <label class="choice">
      <input v-model="kind" type="radio" name="pdf-take" value="range" data-testid="pdf-take-range">
      <span><strong>These pages, as one PDF</strong></span>
    </label>
    <input
      v-model.lazy="range"
      type="text"
      class="range"
      inputmode="numeric"
      autocomplete="off"
      spellcheck="false"
      placeholder="2-5, 9"
      aria-label="Which pages, as one PDF"
      data-testid="pdf-take-pages"
      :disabled="kind !== 'range'"
    >
    <p class="hint">
      Numbers and ranges, in the order you want them: 2-5, 9. "9, 1" puts the last page first; "4-" runs to the end.
    </p>
  </fieldset>
</template>

<style scoped>
.pdf-take {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  max-width: 36rem;
  margin: 0;
  padding: 0;
  border: 0;
}
.label {
  padding: 0;
  font-weight: 700;
}
.choice {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
}
.choice input {
  width: 1rem;
  height: 1rem;
  accent-color: var(--accent);
}
.choice input:focus-visible,
.range:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.about {
  color: var(--muted);
}
.range {
  max-width: 16rem;
  margin-left: 1.5rem;
  padding: 0.375rem 0.5rem;
  border: 1px solid var(--rule-strong);
  border-radius: 0;
  background: transparent;
  color: inherit;
  font: inherit;
}
.range:disabled {
  opacity: 0.5;
}
.hint {
  margin: 0.25rem 0 0;
  font-size: var(--text-small);
  color: var(--muted);
}
</style>
