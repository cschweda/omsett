<script setup lang="ts">
// The frame every page shares: the grid's margins, the two navigations, and the one live region.
const engines = useEngines()
const server = useServerHealth()
const { message } = usePoliteAnnouncer()

onMounted(() => {
  // Development only: `?theme=light` or `?theme=dark`, to look at either without a toggle.
  if (import.meta.dev) {
    const theme = new URLSearchParams(location.search).get('theme')
    if (theme === 'light' || theme === 'dark') useColorMode().preference = theme
  }
  // Asked once, here, so the navigation and the status page know what this browser can do.
  void engines.probe()
  void server.refresh()
})
</script>

<template>
  <div class="frame">
    <SiteNav />
    <slot />
    <AppFooter />
    <!-- The app's single live region. Polite: nothing in a conversion is urgent. -->
    <div role="status" aria-live="polite" class="sr-only" data-testid="announcer">{{ message }}</div>
  </div>
</template>

<style scoped>
.frame {
  max-width: 1200px;
  margin: 0 auto;
  padding: 1.25rem var(--margin) 3rem;
}
</style>
