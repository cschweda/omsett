<script setup lang="ts">
import { languages } from '~/utils/languages'

// Shown only when the selected conversion writes a page that has to say what language it is in,
// from a file that does not say: Markdown, or a table.
const language = defineModel<string>({ required: true })
</script>

<template>
  <div class="language">
    <label for="language" class="label">Language of the text</label>
    <select id="language" v-model="language" class="select" data-testid="language">
      <option v-for="option in languages" :key="option.tag" :value="option.tag">{{ option.name }}</option>
    </select>
    <p class="hint">
      This file does not say what language it is written in. A web page should, so that it is read aloud in the
      right voice.
    </p>
  </div>
</template>

<style scoped>
.language {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  max-width: 36rem;
}
.label {
  font-weight: 700;
}
.select {
  max-width: 20rem;
  padding: 0.5rem 0.625rem;
  border: 1px solid var(--rule-strong);
  border-radius: 0;
  background: var(--bg);
  color: var(--ink);
  font: inherit;
}
.select:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.hint {
  margin: 0;
  font-size: var(--text-small);
  color: var(--muted);
}
</style>
