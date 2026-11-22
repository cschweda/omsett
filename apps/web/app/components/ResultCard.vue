<script setup lang="ts">
import type { QueueResult } from '~/composables/useConversionQueue'
import { formatBytes, formatDelta } from '~/utils/format-bytes'

const props = defineProps<{ result: QueueResult }>()

// One object URL per card, revoked when the card goes away. Nothing outlives the session.
const url = ref('')
onMounted(() => {
  url.value = URL.createObjectURL(props.result.blob)
})
onBeforeUnmount(() => {
  if (url.value) URL.revokeObjectURL(url.value)
})

const delta = computed(() => formatDelta(props.result.inputBytes, props.result.blob.size))
</script>

<template>
  <UCard as="li" class="result-card" :data-engine="result.engine" :ui="{ body: 'p-3 sm:p-3' }">
    <div class="row">
      <div class="meta">
        <p class="name mono">{{ result.name }}</p>
        <p class="facts mono">
          <span>{{ formatBytes(result.blob.size) }}</span>
          <span v-if="delta" class="muted">{{ delta }}</span>
          <span class="muted">converted on your device by {{ result.engine }}</span>
        </p>
      </div>
      <a class="download" :href="url || undefined" :download="result.name" data-testid="download">
        Download<span class="sr-only"> {{ result.name }}</span>
      </a>
    </div>
    <!-- TODO(phase-1): before/after preview slider for image → image. -->
  </UCard>
</template>

<style scoped>
.result-card {
  list-style: none;
  background: var(--surface);
}
.row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
}
.meta {
  min-width: 0;
  flex: 1 1 12rem;
}
.name {
  margin: 0;
  overflow-wrap: anywhere;
}
.facts {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin: 0.25rem 0 0;
  font-size: 0.875rem;
}
.download {
  flex: none;
  padding: 0.5rem 1rem;
  border: 2px solid var(--ink);
  border-radius: 4px;
  font-weight: 700;
  text-decoration: none;
}
.download:hover {
  background: var(--ink);
  color: var(--bg);
}
</style>
