<script setup lang="ts">
// A band of the page: a label in the grid's left column, the content in the rest. On the
// converter the bands are the three moves, in order, so they are numbered; on the other pages
// they are simply headed.
defineProps<{ title: string; headingId: string; step?: number }>()
</script>

<template>
  <section class="band" :aria-labelledby="headingId">
    <h2 :id="headingId" class="title">
      <span v-if="step" class="number figures">{{ step }}</span>
      <span>{{ title }}</span>
    </h2>
    <div class="body">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.band {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  column-gap: var(--gutter);
  row-gap: 1rem;
  padding: 1rem 0 3.5rem;
  border-top: 1px solid var(--ink);
}
.title {
  grid-column: 1 / span 3;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin: 0;
  font-size: var(--text-body);
  font-weight: 700;
  line-height: 1.3;
}
/* The numeral is set at display size: it is the page's wayfinding. */
.number {
  font-size: var(--text-title);
  line-height: 0.85;
  letter-spacing: -0.04em;
  color: var(--accent-text);
}
.body {
  grid-column: 4 / -1;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  min-width: 0;
}
@media (max-width: 760px) {
  .title,
  .body {
    grid-column: 1 / -1;
  }
  .title {
    flex-direction: row;
    align-items: baseline;
    gap: 0.75rem;
  }
  .band {
    padding-bottom: 2.5rem;
  }
}
</style>
