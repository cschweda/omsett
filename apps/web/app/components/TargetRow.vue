<script setup lang="ts">
// A target as one line of the index beneath the large tiles: the same choice, set small.
import type { Target } from '@omsett/registry'

const props = defineProps<{
  target: Target
  selected: boolean
  tabbable: boolean
  download: string
  viaServer: boolean
  /** True while a conversion is running: nothing else can be started. */
  busy: boolean
}>()
defineEmits<{ select: [id: string]; convert: [id: string]; why: [id: string] }>()

const id = computed(() => `tile-${props.target.format.id}`)
const disabled = computed(() => props.target.route === null)
// A format offered to itself is named by what that does (a PDF split into pages), as the registry says.
const name = computed(() => props.target.route?.edges[0]?.candidates[0]?.itself ?? props.target.format.name)
// What shows on hover: for a format that cannot be chosen, why not, ahead of what it is.
const tip = computed(() => (props.target.reason ? `${props.target.reason}. ${props.target.format.explain}` : props.target.format.explain))
</script>

<template>
  <div class="row-wrap">
  <UTooltip :text="tip" :delay-duration="disabled ? 100 : 700" :content="{ side: 'top', sideOffset: 8, collisionPadding: 12 }" arrow :ui="{ content: 'tile-tip', text: 'tile-tip-text', arrow: 'tile-tip-arrow' }">
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
    @click="disabled ? $emit('why', target.format.id) : $emit('select', target.format.id)"
  >
    <span class="name">{{ name }}</span>
    <span class="ext">.{{ target.format.extensions[0] }}</span>
    <span :id="`${id}-desc`" class="desc">
      <TierBadge v-if="target.route" :tier="target.route.tier" :via-server="viaServer" />
      <span v-if="target.reason">{{ target.reason }}</span>
      <span v-for="warning in target.route?.warnings ?? []" :key="warning.id">{{ warning.text }}</span>
      <span v-if="download && !disabled" class="figures">{{ download }}</span>
    </span>
  </button>
  </UTooltip>
  <button
    v-if="!disabled"
    type="button"
    class="go"
    data-testid="convert-to"
    :data-target="target.format.id"
    :disabled="busy"
    @click="$emit('convert', target.format.id)"
  >
    Convert<span class="sr-only"> to {{ target.format.name }}</span>
  </button>
  </div>
</template>

<style scoped>
/* The choice, and to its right the button that converts to it at once. */
.row-wrap {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  column-gap: 0.75rem;
  border-top: 1px solid var(--rule);
}
.row-wrap .row {
  border-top: 0;
}
.go {
  padding: 0.3rem 0.875rem;
  border: 1px solid var(--accent);
  border-radius: 0;
  background: transparent;
  color: var(--accent-text);
  font: inherit;
  font-size: var(--text-small);
  font-weight: 700;
  cursor: pointer;
}
.go:hover:not(:disabled) {
  background: var(--accent);
  color: var(--on-accent);
}
.go:disabled {
  border-color: var(--rule-strong);
  color: var(--muted);
  cursor: default;
}
.go:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
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
