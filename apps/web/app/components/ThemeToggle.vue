<script setup lang="ts">
const colorMode = useColorMode()
const dark = computed(() => colorMode.value === 'dark')
function toggle() {
  colorMode.preference = dark.value ? 'light' : 'dark'
}
</script>

<template>
  <button type="button" class="text-button" @click="toggle">
    <ClientOnly fallback="Dark mode">{{ dark ? 'Light mode' : 'Dark mode' }}</ClientOnly>
  </button>
</template>
