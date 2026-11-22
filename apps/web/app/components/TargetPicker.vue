<script setup lang="ts">
import type { Category, Target } from '@omsett/registry'
import { categoryLabels } from '~/utils/registry'
import { formatBytes } from '~/utils/format-bytes'

const props = defineProps<{
  targets: Target[]
  modelValue: string | null
  viaServer: boolean
}>()
const emit = defineEmits<{ select: [id: string] }>()

const engines = useEngines()
const group = useTemplateRef<HTMLElement>('group')

// A heading for each category that has at least one registered format, in registry order.
const groups = computed(() => {
  const byCategory = new Map<Category, Target[]>()
  for (const target of props.targets) {
    byCategory.set(target.format.category, [...(byCategory.get(target.format.category) ?? []), target])
  }
  return [...byCategory].map(([category, targets]) => ({ category, label: categoryLabels[category], targets }))
})

// Roving tabindex: the group is one Tab stop. It rests on the selected tile, else the first.
const tabStop = computed(() => props.modelValue ?? props.targets[0]?.format.id ?? null)

/** "downloads 5.0 MB once" when the engine this tile will use has not been fetched yet. */
function download(target: Target): string {
  const edge = target.route?.edges[0]
  if (!edge) return ''
  const first = edge.candidates.find((c) => engines.availability.value[c.engine] === true)
  const info = first && engines.info[first.engine]
  if (!info || info.sizeBytes === 0 || engines.loaded.value.includes(info.id)) return ''
  return `downloads ${formatBytes(info.sizeBytes)} once`
}

function tiles(): HTMLElement[] {
  return [...(group.value?.querySelectorAll<HTMLElement>('[role="radio"]') ?? [])]
}

function onKeydown(event: KeyboardEvent) {
  const all = tiles()
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
  // Dimmed tiles stay reachable, so their reason can be read.
  all[next]?.focus()
}
</script>

<template>
  <section aria-labelledby="pick-heading">
    <h2 id="pick-heading" class="heading">Convert to</h2>
    <div ref="group" role="radiogroup" aria-labelledby="pick-heading" class="groups" @keydown="onKeydown">
      <div v-for="g in groups" :key="g.category" class="group">
        <h3 class="category mono">{{ g.label }}</h3>
        <div class="grid">
          <TargetTile
            v-for="target in g.targets"
            :key="target.format.id"
            :target="target"
            :selected="modelValue === target.format.id"
            :tabbable="tabStop === target.format.id"
            :download="download(target)"
            :via-server="viaServer"
            @select="emit('select', $event)"
          />
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.heading {
  margin: 0 0 0.75rem;
  font-size: 1.5rem;
  font-weight: 700;
}
.category {
  margin: 0 0 0.5rem;
  font-size: 0.8125rem;
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}
.groups {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 0.75rem;
}
</style>
