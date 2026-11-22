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
  <span class="tier" :data-tier="tier">{{ label }}</span>
</template>
