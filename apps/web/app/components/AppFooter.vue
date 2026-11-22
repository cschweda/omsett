<script setup lang="ts">
const { state } = useServerHealth()
const colorMode = useColorMode()
const { public: config } = useRuntimeConfig()

const status = computed(() => {
  const base = 'Conversions run on your device.'
  if (state.value === 'reachable') return `${base} Server connected for the rest.`
  if (state.value === 'unreachable') return `${base} The server isn't answering.`
  return base
})

const dark = computed(() => colorMode.value === 'dark')
function toggle() {
  colorMode.preference = dark.value ? 'light' : 'dark'
}
</script>

<template>
  <footer class="footer">
    <p>
      Open source · Free · Accessible · MIT ·
      <UTooltip :text="`Build ${config.commit}`">
        <a href="https://github.com/cschweda/omsett" class="link">GitHub</a>
      </UTooltip>
    </p>
    <p class="mono meaning">omsett · Norwegian — to translate; to convert</p>
    <p data-testid="status">{{ status }}</p>
    <UButton
      :label="dark ? 'Switch to light mode' : 'Switch to dark mode'"
      color="neutral"
      variant="outline"
      size="sm"
      class="toggle"
      data-testid="theme-toggle"
      @click="toggle"
    />
  </footer>
</template>

<style scoped>
.footer {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.375rem;
  padding-top: 1.5rem;
  border-top: 1px solid var(--rule);
  font-size: 0.875rem;
  color: var(--muted);
}
.footer p {
  margin: 0;
}
.link {
  color: var(--ink);
  text-decoration: underline;
  text-underline-offset: 3px;
}
.toggle {
  margin-top: 0.5rem;
  color: var(--ink);
}
</style>
