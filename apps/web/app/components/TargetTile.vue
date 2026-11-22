<script setup lang="ts">
import type { Target } from '@omsett/registry'

const props = defineProps<{
  target: Target
  selected: boolean
  /** True for the one tile that holds the group's Tab stop. */
  tabbable: boolean
  /** e.g. "downloads 5.0 MB once", when the engine it will use is not fetched yet. */
  download: string
  viaServer: boolean
}>()
defineEmits<{ select: [id: string] }>()

const id = computed(() => `tile-${props.target.format.id}`)
const disabled = computed(() => props.target.route === null)
const extension = computed(() => `.${props.target.format.extensions[0]}`)
</script>

<template>
  <UTooltip :text="target.format.explain" :delay-duration="500" :ui="{ content: 'tile-tip' }">
    <button
      :id="id"
      type="button"
      role="radio"
      class="tile"
      :class="{ selected, disabled }"
      :aria-checked="selected"
      :aria-disabled="disabled"
      :aria-describedby="`${id}-desc`"
      :tabindex="tabbable ? 0 : -1"
      :data-format="target.format.id"
      :style="{ '--cat': `var(--cat-${target.format.category})` }"
      @click="!disabled && $emit('select', target.format.id)"
    >
      <span class="name">{{ target.format.name }}</span>
      <span class="ext">{{ extension }}</span>
      <span :id="`${id}-desc`" class="desc">
        <TierBadge v-if="target.route" :tier="target.route.tier" :via-server="viaServer" />
        <span v-if="target.reason" class="reason">{{ target.reason }}</span>
        <span v-for="warning in target.route?.warnings ?? []" :key="warning.id" class="warning">
          {{ warning.text }}
        </span>
        <span v-if="download && !disabled" class="download figures">{{ download }}</span>
      </span>
    </button>
  </UTooltip>
</template>

<style scoped>
/* A format is set as type, not boxed: a rule in its category's color, then the name, large. */
.tile {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  width: 100%;
  min-height: 148px;
  padding: 0.75rem 0.75rem 0.875rem;
  border: 0;
  border-top: 3px solid var(--cat);
  border-radius: 0;
  background: transparent;
  color: var(--ink);
  text-align: left;
  cursor: pointer;
}
.tile:hover:not(.disabled):not(.selected) {
  background: var(--surface);
}
.tile:hover:not(.disabled):not(.selected) .name {
  color: var(--accent-text);
}
/* Chosen: the whole field inverts. */
.tile.selected {
  background: var(--ink);
  color: var(--bg);
  border-top-color: var(--ink);
}
.tile.disabled {
  border-top: 1px solid var(--rule-strong);
  padding-top: calc(0.75rem + 2px);
  color: var(--muted);
  cursor: not-allowed;
}
.name {
  font-size: var(--text-title);
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.035em;
}
.ext {
  margin-top: 0.25rem;
  font-size: var(--text-small);
  opacity: 0.7;
}
.desc {
  display: flex;
  flex-direction: column;
  margin-top: auto;
  padding-top: 1rem;
  font-size: var(--text-small);
  line-height: 1.35;
}
</style>
