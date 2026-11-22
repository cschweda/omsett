<script setup lang="ts">
import type { Tier } from '@omsett/registry'

const props = defineProps<{ tier: Tier; viaServer?: boolean }>()

// Words, never color alone.
const label = computed(() => {
  if (props.tier === 'browser') return 'on your device'
  return props.viaServer ? 'via your server' : 'needs the desktop app'
})
</script>

<template>
  <UBadge
    :label="label"
    :color="tier === 'browser' ? 'primary' : 'neutral'"
    variant="outline"
    size="sm"
    class="tier-badge mono"
    :data-tier="tier"
  />
</template>

<style scoped>
.tier-badge {
  color: var(--ink);
  white-space: nowrap;
}
</style>
