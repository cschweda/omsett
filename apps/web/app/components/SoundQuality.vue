<script setup lang="ts">
// Shown only when the selected conversion packs sound by leaving some of it out.
const quality = defineModel<string>({ required: true })
const choices = [
  { value: 'smaller', label: 'Smaller', about: 'About 130 kbps. Good for speech, and for listening on the move.' },
  { value: 'standard', label: 'Standard', about: 'About 190 kbps. Most people cannot tell it from the original.' },
  { value: 'best', label: 'Best', about: '320 kbps, the most this format holds. The largest file.' },
]
</script>

<template>
  <fieldset class="sound-quality" data-testid="sound-quality">
    <legend class="label">Quality of the sound</legend>
    <label v-for="choice in choices" :key="choice.value" class="choice">
      <input v-model="quality" type="radio" name="sound-quality" :value="choice.value" :data-testid="`sound-quality-${choice.value}`">
      <span><strong>{{ choice.label }}</strong> <span class="about">{{ choice.about }}</span></span>
    </label>
    <p class="hint">
      This format makes sound small by leaving some of it out. The setting is how much. Music with little in it
      comes out smaller than these figures, and nothing left out can be put back, so keep the original.
    </p>
  </fieldset>
</template>

<style scoped>
.sound-quality {
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
