<script setup lang="ts">
// Shown only when the selected target's encoder has a quality setting.
const quality = defineModel<number>({ required: true })
defineProps<{ suggested: number }>()
</script>

<template>
  <div class="quality">
    <label for="quality" class="label">
      Quality <output class="mono value" for="quality">{{ quality }}</output>
    </label>
    <div class="track">
      <span class="end muted">smaller file</span>
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
      <span class="end muted">closer to the original</span>
    </div>
    <p class="hint muted">
      <template v-if="quality === suggested">
        {{ suggested }} is a good default: a much smaller file, with a difference few people can see.
      </template>
      <button v-else type="button" class="reset" data-testid="quality-reset" @click="quality = suggested">
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
  max-width: 34rem;
}
.label {
  font-weight: 700;
}
.value {
  margin-left: 0.5rem;
  font-weight: 500;
}
.track {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.range {
  flex: 1;
  min-width: 8rem;
  accent-color: var(--accent);
}
.end,
.hint {
  font-size: 0.8125rem;
}
.hint {
  margin: 0;
  min-height: 1.25rem;
}
.reset {
  color: var(--ink);
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
}
</style>
