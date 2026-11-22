<script setup lang="ts">
// The head of an information page: one line of display type, one of explanation.
defineProps<{ title: string; lead: string }>()
</script>

<template>
  <header class="head">
    <h1 class="title">{{ title }}<span class="dot">.</span></h1>
    <p class="lead">{{ lead }}</p>
  </header>
</template>

<style scoped>
.head {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  column-gap: var(--gutter);
  row-gap: 1.25rem;
  align-items: end;
  padding-bottom: 2.5rem;
}
.title {
  grid-column: 1 / span 8;
  margin: 0 0 0 -0.04em;
  font-size: clamp(3rem, 9vw, 6.5rem);
  font-weight: 700;
  line-height: 0.88;
  letter-spacing: -0.05em;
}
.dot {
  color: var(--accent);
}
.lead {
  grid-column: 9 / -1;
  margin: 0;
  font-size: var(--text-lead);
  font-weight: 500;
  line-height: 1.25;
  letter-spacing: -0.01em;
}
@media (max-width: 760px) {
  .title,
  .lead {
    grid-column: 1 / -1;
  }
}
</style>
