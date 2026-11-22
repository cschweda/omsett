<script setup lang="ts">
import type { Target } from '@omsett/registry'
import { categoryLabels } from '~/utils/registry'
import { formatBytes } from '~/utils/format-bytes'

const props = defineProps<{
  targets: Target[]
  modelValue: string | null
  viaServer: boolean
  /** id of the heading that names this group. */
  labelledby: string
  /** True until there is a file whose format is known: what it can become depends on the file. */
  waiting: boolean
}>()
const emit = defineEmits<{ select: [id: string] }>()

/** How many targets are set large. The rest go in the list beneath. */
const FEATURED = 4
/** A list longer than this gets a field to filter it by typing. */
const FILTER_FROM = 8

const engines = useEngines()
const group = useTemplateRef<HTMLElement>('group')
const filter = ref('')

// The registry lists formats most generally useful first, so the first few a file can become
// are the ones most people want. Those are set large; everything else is one line each.
const reachable = computed(() => props.targets.filter((t) => t.route))
const featured = computed(() => reachable.value.slice(0, FEATURED))
const others = computed(() => reachable.value.slice(FEATURED))
const unavailable = computed(() => props.targets.filter((t) => !t.route))
const listed = computed(() => {
  const all = [...others.value, ...unavailable.value]
  const wanted = filter.value.trim().toLowerCase()
  if (!wanted) return all
  return all.filter(
    (t) => t.format.name.toLowerCase().includes(wanted) || t.format.extensions.some((ext) => ext.includes(wanted)),
  )
})
const filterable = computed(() => others.value.length + unavailable.value.length > FILTER_FROM)

// What Omsett handles at all, shown before a file is dropped, by category.
const supported = computed(() => {
  const byCategory = new Map<string, string[]>()
  for (const { format } of props.targets) {
    const label = categoryLabels[format.category]
    byCategory.set(label, [...(byCategory.get(label) ?? []), format.name])
  }
  return [...byCategory].map(([label, names]) => ({ label, names }))
})

// Roving tabindex: the group is one Tab stop. It rests on the selected target, else the first.
const tabStop = computed(
  () => props.modelValue ?? featured.value[0]?.format.id ?? listed.value[0]?.format.id ?? null,
)

/** "downloads 5.0 MB once" when the engine this target will use has not been fetched yet. */
function download(target: Target): string {
  const edge = target.route?.edges[0]
  if (!edge) return ''
  const first = edge.candidates.find((c) => engines.availability.value[`${c.engine}>${edge.to}`] === true)
  const info = first && engines.info[first.engine]
  if (!info || info.sizeBytes === 0 || engines.loaded.value.includes(info.id)) return ''
  return `downloads ${formatBytes(info.sizeBytes)} once`
}

function choices(): HTMLElement[] {
  return [...(group.value?.querySelectorAll<HTMLElement>('[role="radio"]') ?? [])]
}

function onKeydown(event: KeyboardEvent) {
  const all = choices()
  const index = all.indexOf(document.activeElement as HTMLElement)
  if (index < 0) return
  let next = index
  switch (event.key) {
    case 'ArrowRight':
    case 'ArrowDown':
      next = (index + 1) % all.length
      break
    case 'ArrowLeft':
    case 'ArrowUp':
      next = (index - 1 + all.length) % all.length
      break
    case 'Home':
      next = 0
      break
    case 'End':
      next = all.length - 1
      break
    case 'Enter':
    case ' ': {
      event.preventDefault()
      const id = all[index]?.dataset.format
      if (id && all[index]?.getAttribute('aria-disabled') !== 'true') emit('select', id)
      return
    }
    default:
      return
  }
  event.preventDefault()
  // Unavailable targets stay reachable, so their reason can be read.
  all[next]?.focus()
}
</script>

<template>
  <div ref="group" role="radiogroup" :aria-labelledby="labelledby" class="picker" @keydown="onKeydown">
    <!-- Before a file: what it can become depends on the file, so nothing is offered yet. -->
    <div v-if="waiting" class="waiting" data-testid="picker-waiting">
      <p class="prompt">Drop a file to see what it can become.</p>
      <dl class="supported">
        <div v-for="kind in supported" :key="kind.label">
          <dt>{{ kind.label }}</dt>
          <dd>{{ kind.names.join(', ') }}</dd>
        </div>
      </dl>
    </div>

    <template v-else>
      <div v-if="featured.length" class="grid">
        <TargetTile
          v-for="target in featured"
          :key="target.format.id"
          :target="target"
          :selected="modelValue === target.format.id"
          :tabbable="tabStop === target.format.id"
          :download="download(target)"
          :via-server="viaServer"
          @select="emit('select', $event)"
        />
      </div>
      <p v-else class="prompt">Nothing converts from this file yet.</p>

      <div v-if="others.length + unavailable.length" class="index">
        <div class="index-head">
          <h3 class="index-title">{{ others.length ? 'More formats' : 'Not available for this file' }}</h3>
          <input
            v-if="filterable"
            v-model="filter"
            type="search"
            class="filter"
            placeholder="Filter formats"
            aria-label="Filter formats"
            data-testid="format-filter"
          >
        </div>
        <TargetRow
          v-for="target in listed"
          :key="target.format.id"
          :target="target"
          :selected="modelValue === target.format.id"
          :tabbable="tabStop === target.format.id"
          :download="download(target)"
          :via-server="viaServer"
          @select="emit('select', $event)"
        />
        <p v-if="listed.length === 0" class="none">No format matches “{{ filter }}”.</p>
      </div>
    </template>
  </div>
</template>

<style scoped>
.picker {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}
.prompt {
  margin: 0;
  font-size: var(--text-lead);
  font-weight: 500;
  letter-spacing: -0.01em;
}
.waiting {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
.supported {
  margin: 0;
  font-size: var(--text-small);
}
.supported div {
  display: grid;
  grid-template-columns: 6rem minmax(0, 1fr);
  column-gap: 1rem;
  padding: 0.5rem 0;
  border-top: 1px solid var(--rule);
}
.supported dt {
  color: var(--muted);
}
.supported dd {
  margin: 0;
}
/* Each tile is three columns of the page grid. */
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 180px), 1fr));
  gap: var(--gutter);
}
.index-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem 1rem;
  margin-bottom: 0.5rem;
}
.index-title {
  margin: 0;
  font-size: var(--text-small);
  font-weight: 400;
  color: var(--muted);
}
.filter {
  width: min(100%, 16rem);
  padding: 0.375rem 0.5rem;
  border: 1px solid var(--rule-strong);
  border-radius: 0;
  background: transparent;
  color: var(--ink);
  font: inherit;
  font-size: var(--text-small);
}
.index :deep(.row:last-of-type) {
  border-bottom: 1px solid var(--rule);
}
.none {
  margin: 0;
  padding: 0.625rem 0;
  font-size: var(--text-small);
  color: var(--muted);
}
</style>
