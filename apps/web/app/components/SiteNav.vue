<script setup lang="ts">
import { pages, REPOSITORY } from '~/utils/links'

const route = useRoute()
const { state, label } = useReadiness()
const home = computed(() => route.path === '/')

// On a narrow screen the links fold away behind one button, and open below it.
const open = ref(false)
watch(
  () => route.fullPath,
  () => (open.value = false),
)
</script>

<template>
  <nav class="nav" aria-label="Site">
    <!-- On the converter itself the wordmark is the masthead, so it is not repeated here. -->
    <NuxtLink v-if="!home" to="/" class="brand">omsett<span class="dot">.</span></NuxtLink>
    <span v-else class="brand muted">File converter</span>

    <button type="button" class="menu" :aria-expanded="open" aria-controls="site-links" data-testid="nav-menu" @click="open = !open">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" aria-hidden="true">
        <path v-if="!open" d="M3 6h18M3 12h18M3 18h18" />
        <path v-else d="M5 5l14 14M19 5L5 19" />
      </svg>
      <span>{{ open ? 'Close' : 'Menu' }}</span>
    </button>

    <ul id="site-links" class="links" :class="{ open }">
      <li v-for="page in pages" :key="page.to">
        <NuxtLink :to="page.to" class="link" :data-testid="page.to === '/settings' ? 'nav-settings' : undefined"><GearIcon v-if="page.to === '/settings'" />{{ page.label }}</NuxtLink>
      </li>
      <li>
        <NuxtLink to="/status" class="link status" :data-state="state" data-testid="nav-status">
          <span class="mark" aria-hidden="true" />{{ label }}
        </NuxtLink>
      </li>
      <li><a :href="REPOSITORY" class="link">GitHub</a></li>
      <li><ThemeToggle class="link" data-testid="theme-toggle-top" /></li>
    </ul>
  </nav>
</template>

<style scoped>
.nav {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem 2rem;
  padding-bottom: 0.875rem;
  margin-bottom: clamp(2rem, 6vw, 4.5rem);
  border-bottom: 1px solid var(--ink);
  font-size: var(--text-small);
}
.brand {
  font-size: var(--text-lead);
  font-weight: 700;
  letter-spacing: -0.04em;
  line-height: 1;
  text-decoration: none;
}
.brand.muted {
  font-size: var(--text-small);
  font-weight: 400;
  letter-spacing: 0;
}
.dot {
  color: var(--accent);
}
.links {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 1.5rem;
  margin: 0;
  padding: 0;
  list-style: none;
}
.link {
  color: var(--ink);
  text-decoration: none;
}
/* Wide enough for every link in a row, the button is not needed and is not there. */
.menu {
  display: none;
  align-items: center;
  gap: 0.45rem;
  padding: 0.25rem 0;
  border: 0;
  background: transparent;
  color: var(--ink);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}
.menu:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
}
@media (max-width: 960px) {
  .nav {
    align-items: center;
  }
  .menu {
    display: inline-flex;
  }
  .links {
    display: none;
    flex-basis: 100%;
    flex-direction: column;
    gap: 0;
    padding-top: 0.5rem;
  }
  .links.open {
    display: flex;
  }
  .links li {
    border-top: 1px solid var(--rule);
  }
  .links .link {
    display: flex;
    align-items: center;
    width: 100%;
    padding: 0.75rem 0;
    font-size: var(--text-body);
  }
  /* In a list the page you are on is marked by a blue bar at its left. */
  .links .link.router-link-exact-active {
    padding-left: 0.75rem;
    box-shadow: inset 3px 0 0 var(--accent);
  }
  .links .link.router-link-exact-active::after {
    content: none;
  }
}
.link:hover {
  text-decoration: underline;
  text-underline-offset: 3px;
}
/* The page you are on: bold, and standing on a blue rule that meets the navigation's own. */
.link.router-link-exact-active {
  position: relative;
  font-weight: 700;
}
.link.router-link-exact-active::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: calc(-0.875rem - 2px);
  height: 3px;
  background: var(--accent);
}
.status {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
}
.mark {
  width: 0.5rem;
  height: 0.5rem;
  background: var(--rule-strong);
}
/* Green when this browser can convert, red when it cannot or only partly can, grey while
   that is still being worked out. The words beside it say the same thing. */
.mark {
  width: 0.625rem;
  height: 0.625rem;
}
.status[data-state='ready'] .mark {
  background: var(--positive);
}
.status[data-state='limited'] .mark,
.status[data-state='unavailable'] .mark {
  background: var(--signal);
}
</style>
