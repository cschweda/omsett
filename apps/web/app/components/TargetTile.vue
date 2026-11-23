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
  /** True while a conversion is running: nothing else can be started. */
  busy: boolean
}>()
defineEmits<{ select: [id: string]; convert: [id: string]; why: [id: string] }>()

const id = computed(() => `tile-${props.target.format.id}`)
const disabled = computed(() => props.target.route === null)
const extension = computed(() => `.${props.target.format.extensions[0]}`)
// What shows on hover: for a format that cannot be chosen, why not, ahead of what it is.
const tip = computed(() => (props.target.reason ? `${props.target.reason}. ${props.target.format.explain}` : props.target.format.explain))
</script>

<template>
  <div class="tile-wrap">
  <UTooltip :text="tip" :delay-duration="disabled ? 100 : 500" :content="{ side: 'top', sideOffset: 8, collisionPadding: 12 }" arrow :ui="{ content: 'tile-tip', text: 'tile-tip-text', arrow: 'tile-tip-arrow' }">
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
      @click="disabled ? $emit('why', target.format.id) : $emit('select', target.format.id)"
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
  <!-- Beside the choice, not inside it: one press converts to this format, with its usual settings. -->
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
.tile-wrap {
  display: flex;
  flex-direction: column;
}
.tile-wrap > :first-child {
  flex: 1;
}
.go {
  align-self: flex-start;
  margin: 0.5rem 0 0 0.75rem;
  padding: 0.4rem 1rem;
  border: 1px solid var(--accent);
  border-radius: 0;
  background: var(--accent);
  color: var(--on-accent);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}
.go:hover:not(:disabled) {
  background: var(--ink);
  border-color: var(--ink);
  color: var(--bg);
}
.go:disabled {
  border-color: var(--rule-strong);
  background: transparent;
  color: var(--muted);
  cursor: default;
}
.go:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
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
  /* The name is sized against the tile it is in (see .name). */
  container-type: inline-size;
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
/* As large as the scale allows, and never wider than its tile: in a narrow tile "Markdown" at
   full size ran past the edge and lost its last letter. */
.name {
  max-width: 100%;
  overflow-wrap: anywhere;
  font-size: min(var(--text-title), 20cqi);
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
