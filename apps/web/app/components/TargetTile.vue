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
  <UTooltip :text="target.format.explain" :delay-duration="400" :ui="{ content: 'tile-tip' }">
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
      <span class="top">
        <span class="mark" aria-hidden="true" />
        <TierBadge v-if="target.route" :tier="target.route.tier" :via-server="viaServer" />
      </span>
      <span class="ext mono">{{ extension }}</span>
      <span class="name">{{ target.format.name }}</span>
      <span :id="`${id}-desc`" class="desc">
        <span v-if="target.reason" class="reason">{{ target.reason }}</span>
        <span v-for="warning in target.route?.warnings ?? []" :key="warning.id" class="warning">
          {{ warning.text }}
        </span>
        <span v-if="download && !disabled" class="download mono">{{ download }}</span>
      </span>
      <span v-if="selected" class="check mono" aria-hidden="true">selected</span>
    </button>
  </UTooltip>
</template>

<style scoped>
.tile {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.25rem;
  min-width: 140px;
  min-height: 110px;
  width: 100%;
  padding: 0.75rem;
  border: 2px solid var(--rule-strong);
  border-radius: 4px;
  background: var(--surface);
  color: var(--ink);
  text-align: left;
  cursor: pointer;
}
.tile.selected {
  border-color: var(--accent);
  box-shadow: inset 0 0 0 2px var(--accent);
}
/* Dimmed, but still readable: the reason has to meet contrast like any other text. */
.tile.disabled {
  cursor: not-allowed;
  border-style: dashed;
  background: transparent;
}
.tile.disabled .ext,
.tile.disabled .name {
  color: var(--muted);
}
.top {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  min-height: 1.5rem;
}
.mark {
  width: 12px;
  height: 12px;
  background: var(--cat);
}
.ext {
  font-size: 28px;
  font-weight: 500;
  line-height: 1.1;
}
.name {
  font-weight: 700;
}
.desc {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  font-size: 0.8125rem;
  color: var(--muted);
}
.check {
  margin-top: auto;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
</style>
