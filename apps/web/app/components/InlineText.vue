<script setup lang="ts">
// A line of changelog text: plain runs, bold runs, and names of files or settings.
defineProps<{ parts: Array<{ kind: string; text: string }> }>()
</script>

<template>
  <span>
    <template v-for="(part, index) in parts" :key="index">
      <strong v-if="part.kind === 'strong'">{{ part.text }}</strong>
      <code v-else-if="part.kind === 'code'" class="plain-code">{{ part.text }}</code>
      <template v-else>{{ part.text }}</template>
    </template>
  </span>
</template>
