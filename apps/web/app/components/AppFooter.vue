<script setup lang="ts">
import { CHANGELOG, pages, REPOSITORY } from '~/utils/links'

const { state } = useServerHealth()
const { public: config } = useRuntimeConfig()

const status = computed(() => {
  const base = 'Conversions run on your device.'
  if (state.value === 'reachable') return `${base} Server connected for the rest.`
  if (state.value === 'unreachable') return `${base} The server isn't answering.`
  return base
})
</script>

<template>
  <footer class="footer">
    <div class="about">
      <p>Omsett is free and open source, under the MIT license.</p>
      <p>“Omsett” is Norwegian: to translate, to convert.</p>
    </div>

    <nav class="links" aria-label="Footer">
      <ul>
        <li><NuxtLink to="/" class="text-button">Converter</NuxtLink></li>
        <li v-for="page in pages" :key="page.to">
          <NuxtLink :to="page.to" class="text-button">{{ page.label }}</NuxtLink>
        </li>
        <li><NuxtLink to="/status" class="text-button">Status</NuxtLink></li>
      </ul>
      <ul>
        <li><a :href="REPOSITORY" class="text-button">GitHub repository</a></li>
        <li><a :href="CHANGELOG" class="text-button">Changelog</a></li>
      </ul>
    </nav>

    <div class="state">
      <p data-testid="status">{{ status }}</p>
      <p class="figures">Build {{ config.commit }}</p>
      <ThemeToggle data-testid="theme-toggle" />
    </div>
  </footer>
</template>

<style scoped>
.footer {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  column-gap: var(--gutter);
  row-gap: 1.5rem;
  margin-top: 1rem;
  padding-top: 1.25rem;
  border-top: 1px solid var(--ink);
  font-size: var(--text-small);
  color: var(--muted);
}
.footer p {
  margin: 0;
}
.about {
  grid-column: 1 / span 3;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.links {
  grid-column: 4 / span 5;
  display: grid;
  grid-template-columns: 1fr 1fr;
  column-gap: var(--gutter);
}
.links ul {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin: 0;
  padding: 0;
  list-style: none;
}
.state {
  grid-column: 9 / -1;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.25rem;
}
@media (max-width: 760px) {
  .about,
  .links,
  .state {
    grid-column: 1 / -1;
  }
}
</style>
