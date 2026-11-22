<script setup lang="ts">
// A teaser for the latest version, above the converter: two or three sentences, and a way to
// the full list. The text is the opening of that version's entry in CHANGELOG.md, cut to three
// sentences at build time, so this banner, the What's new page, and the changelog cannot differ.
import releases from '~/generated/changelog.json'

const latest = releases[0]
const title = latest ? (latest.title === 'Unreleased' ? 'Latest changes' : `Version ${latest.title}`) : ''
const anchor = latest ? `/whats-new#release-${latest.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : '/whats-new'

// Dismissing hides it for this version only. The next version brings it back.
const STORAGE_KEY = 'omsett:whats-new-dismissed'
const mark = latest ? `${latest.title}:${latest.teaser.length}` : ''
const visible = ref(false)

onMounted(() => {
  try {
    visible.value = Boolean(latest?.teaser) && localStorage.getItem(STORAGE_KEY) !== mark
  } catch {
    // Storage can be blocked. Then the banner simply shows.
    visible.value = Boolean(latest?.teaser)
  }
})

function dismiss() {
  visible.value = false
  try {
    localStorage.setItem(STORAGE_KEY, mark)
  } catch {
    // Not remembered; it will show again on the next visit.
  }
}
</script>

<template>
  <aside v-if="visible && latest" class="banner" aria-label="What’s new" data-testid="whats-new-banner">
    <NuxtLink :to="anchor" class="label" data-testid="whats-new-label">
      <span class="mark">What’s new</span>
      <span class="version figures">{{ title }}</span>
    </NuxtLink>
    <p class="teaser">
      <span data-testid="whats-new-teaser">{{ latest.teaser }}</span>
      {{ ' ' }}
      <NuxtLink :to="anchor" class="more" data-testid="whats-new-link">See everything that’s new</NuxtLink>
    </p>
    <button type="button" class="text-button dismiss" data-testid="whats-new-dismiss" @click="dismiss">Dismiss</button>
  </aside>
</template>

<style scoped>
/* On the page's grid: label column, text, and the way out. No rule of its own above it: the
   navigation's is enough. The label alone is marked, with an underline in the highlight colour. */
.banner {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  column-gap: var(--gutter);
  row-gap: 0.5rem;
  align-items: start;
  margin: calc(clamp(2rem, 6vw, 4.5rem) * -1 + 1.25rem) 0 clamp(2rem, 6vw, 4rem);
  padding: 1rem 0 1.25rem;
  border-bottom: 1px solid var(--rule);
}
/* Room on both sides of the bar: between it and the words above, and the version beneath. */
.mark {
  align-self: flex-start;
  padding-bottom: 0.4rem;
  margin-bottom: 0.45rem;
  border-bottom: 3px solid var(--highlight);
}
.label {
  grid-column: 1 / span 3;
  justify-self: start;
  display: flex;
  flex-direction: column;
  margin: 0;
  color: var(--ink);
  font-weight: 700;
  line-height: 1.3;
  text-decoration: none;
}
.label:hover .mark {
  color: var(--positive);
}
.version {
  font-size: var(--text-small);
  font-weight: 400;
  color: var(--muted);
}
.teaser {
  grid-column: 4 / span 7;
  margin: 0;
  max-width: 62ch;
}
.more {
  font-weight: 700;
  color: var(--accent-text);
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 3px;
  white-space: nowrap;
}
.dismiss {
  grid-column: 11 / -1;
  justify-self: end;
  font-size: var(--text-small);
}
@media (max-width: 760px) {
  .label,
  .teaser {
    grid-column: 1 / -1;
  }
  .label {
    flex-direction: row;
    gap: 0.75rem;
    align-items: baseline;
  }
  .mark {
    align-self: baseline;
    margin-bottom: 0;
  }
  .dismiss {
    grid-column: 1 / -1;
    justify-self: start;
  }
}
</style>
