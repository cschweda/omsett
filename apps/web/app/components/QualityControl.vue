<script setup lang="ts">
// Shown only when the selected target's encoder has a quality setting.
const quality = defineModel<number>({ required: true })
defineProps<{ suggested: number }>()
</script>

<template>
  <div class="quality">
    <div class="head">
      <label for="quality" class="label">Quality</label>
      <output class="value figures" for="quality">{{ quality }}</output>
    </div>
    <input
      id="quality"
      v-model.number="quality"
      type="range"
      min="1"
      max="100"
      step="1"
      data-testid="quality"
      class="range"
    >
    <div class="ends">
      <span>Smaller file</span>
      <span>Closer to the original</span>
    </div>
    <p class="hint">
      <template v-if="quality === suggested">
        {{ suggested }} is a good default: a much smaller file, with a difference few people can see.
      </template>
      <button v-else type="button" class="text-button" data-testid="quality-reset" @click="quality = suggested">
        Back to {{ suggested }}
      </button>
    </p>
  </div>
</template>

<style scoped>
.quality {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  max-width: 36rem;
}
.head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}
.label {
  font-weight: 700;
}
.value {
  font-size: var(--text-title);
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.035em;
  color: var(--accent-text);
}
.range {
  width: 100%;
  accent-color: var(--accent);
}
.ends {
  display: flex;
  justify-content: space-between;
  font-size: var(--text-small);
  color: var(--muted);
}
.hint {
  margin: 0.25rem 0 0;
  min-height: 1.25rem;
  font-size: var(--text-small);
  color: var(--muted);
}
</style>
