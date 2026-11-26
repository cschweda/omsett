<script setup lang="ts">
// Shown when the file being converted is a presentation. Notes are left out unless asked for:
// they are what the presenter kept for themselves, and the person who gets the result may not
// be the presenter.
const included = defineModel<boolean>({ required: true })
</script>

<template>
  <div class="speaker-notes">
    <label class="check">
      <input v-model="included" type="checkbox" data-testid="speaker-notes">
      <span>Include speaker notes</span>
    </label>
    <p class="hint">
      Off unless you turn it on. Notes are what the presenter wrote for themselves; with this on, each slide's notes
      follow it under the heading "Speaker notes". Hidden slides are never included, notes and all.
    </p>
  </div>
</template>

<style scoped>
.speaker-notes {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  max-width: 36rem;
}
.check {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 700;
}
.check input {
  width: 1.125rem;
  height: 1.125rem;
  accent-color: var(--accent);
}
.check input:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.hint {
  margin: 0;
  font-size: var(--text-small);
  color: var(--muted);
}
</style>
