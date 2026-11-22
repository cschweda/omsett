<script setup lang="ts">
// A target as one line of the index beneath the large tiles: the same choice, set small.
import type { Target } from '@omsett/registry'

const props = defineProps<{
  target: Target
  selected: boolean
  tabbable: boolean
  download: string
  viaServer: boolean
}>()
defineEmits<{ select: [id: string] }>()

const id = computed(() => `tile-${props.target.format.id}`)
const disabled = computed(() => props.target.route === null)
</script>

<template>
  <button
    :id="id"
    type="button"
    role="radio"
    class="row"
    :class="{ selected, disabled }"
    :aria-checked="selected"
    :aria-disabled="disabled"
    :aria-describedby="`${id}-desc`"
    :tabindex="tabbable ? 0 : -1"
    :data-format="target.format.id"
    :title="target.format.explain"
    @click="!disabled && $emit('select', target.format.id)"
  >
    <span class="name">{{ target.format.name }}</span>
    <span class="ext">.{{ target.format.extensions[0] }}</span>
    <span :id="`${id}-desc`" class="desc">
      <TierBadge v-if="target.route" :tier="target.route.tier" :via-server="viaServer" />
      <span v-if="target.reason">{{ target.reason }}</span>
      <span v-for="warning in target.route?.warnings ?? []" :key="warning.id">{{ warning.text }}</span>
      <span v-if="download && !disabled" class="figures">{{ download }}</span>
    </span>
  </button>
</template>

<style scoped>
.row {
  display: grid;
  grid-template-columns: 6rem 4rem minmax(0, 1fr);
  column-gap: 1rem;
  align-items: baseline;
  width: 100%;
  padding: 0.625rem 0.5rem;
  border: 0;
  border-top: 1px solid var(--rule);
  border-radius: 0;
  background: transparent;
  color: var(--ink);
  text-align: left;
  cursor: pointer;
}
.row:hover:not(.disabled):not(.selected) {
  background: var(--surface);
}
.row.selected {
  background: var(--ink);
  color: var(--bg);
}
.row.disabled {
  color: var(--muted);
  cursor: not-allowed;
}
.name {
  font-weight: 700;
}
.ext {
  font-size: var(--text-small);
  opacity: 0.7;
}
.desc {
  display: flex;
  flex-wrap: wrap;
  gap: 0 0.75rem;
  font-size: var(--text-small);
}
@media (max-width: 520px) {
  .row {
    grid-template-columns: 5rem minmax(0, 1fr);
  }
  .ext {
    display: none;
  }
}
</style>
