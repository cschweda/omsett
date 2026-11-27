<script setup lang="ts">
// Shown when a PDF is being made into pictures: every page, one picture each, or the first.
const pages = defineModel<string>({ required: true })
const choices = [
  { value: 'all', label: 'Every page', about: 'One picture for each page, up to 100 pages. Download them together as a ZIP.' },
  { value: 'first', label: 'The first page', about: 'One picture, of the cover or the first page.' },
]
</script>

<template>
  <fieldset class="pdf-pages" data-testid="pdf-pages">
    <legend class="label">Pages</legend>
    <label v-for="choice in choices" :key="choice.value" class="choice">
      <input v-model="pages" type="radio" name="pdf-pages" :value="choice.value" :data-testid="`pdf-pages-${choice.value}`">
      <span><strong>{{ choice.label }}</strong> <span class="about">{{ choice.about }}</span></span>
    </label>
    <p class="hint">
      Each page is drawn at 150 dots to the inch, on white. The words become part of the picture: they can no longer
      be selected or searched.
    </p>
  </fieldset>
</template>

<style scoped>
.pdf-pages {
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
.choice input:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.about {
  color: var(--muted);
}
.hint {
  margin: 0.25rem 0 0;
  font-size: var(--text-small);
  color: var(--muted);
}
</style>
