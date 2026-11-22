<script setup lang="ts">
// A Mermaid diagram, drawn in the page's own type and colors. Mermaid is fetched only when a
// page that has a diagram is opened, so the converter never pays for it.
const props = defineProps<{ code: string; caption: string }>()

const colorMode = useColorMode()
const svg = ref('')
const failed = ref(false)
const id = `diagram-${useId().replace(/[^a-z0-9]/gi, '')}`

async function draw() {
  try {
    const { default: mermaid } = await import('mermaid')
    const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()
    const ink = token('--ink')
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'base',
      fontFamily: token('--font-sans') || 'Helvetica, Arial, sans-serif',
      // Plain SVG text and straight lines: no HTML inside the drawing, nothing rounded.
      flowchart: { htmlLabels: false, curve: 'linear', padding: 14, nodeSpacing: 36, rankSpacing: 44 },
      themeVariables: {
        fontSize: '14px',
        background: 'transparent',
        primaryColor: token('--surface'),
        primaryBorderColor: ink,
        primaryTextColor: ink,
        secondaryColor: token('--bg'),
        tertiaryColor: token('--bg'),
        lineColor: ink,
        textColor: ink,
        clusterBkg: 'transparent',
        clusterBorder: token('--rule-strong'),
        edgeLabelBackground: token('--bg'),
      },
    })
    svg.value = (await mermaid.render(id, props.code)).svg
    failed.value = false
  } catch (error) {
    console.warn('[omsett] diagram could not be drawn', error)
    failed.value = true
  }
}

onMounted(draw)
// The drawing takes its colors from the theme, so it is redrawn when the theme changes.
watch(() => colorMode.value, () => nextTick(draw))
</script>

<template>
  <figure class="diagram" :data-drawn="svg !== ''" data-testid="diagram">
    <!-- eslint-disable-next-line vue/no-v-html -- Mermaid's own output, from source in this repo -->
    <div v-if="svg" class="drawing" v-html="svg" />
    <pre v-else-if="failed" class="source">{{ code }}</pre>
    <div v-else class="drawing waiting" aria-hidden="true" />
    <figcaption class="caption">{{ caption }}</figcaption>
  </figure>
</template>

<style scoped>
.diagram {
  margin: 0;
}
.drawing {
  overflow-x: auto;
  padding: 1rem 0;
  border-top: 1px solid var(--rule);
  border-bottom: 1px solid var(--rule);
}
.drawing.waiting {
  min-height: 12rem;
}
.drawing :deep(svg) {
  display: block;
  max-width: 100%;
  height: auto;
}
/* Mermaid rounds its boxes and gives them shadows; this page does neither. */
.drawing :deep(rect) {
  rx: 0;
  ry: 0;
}
.drawing :deep(*) {
  filter: none !important;
}
.source {
  margin: 0;
  padding: 1rem;
  overflow-x: auto;
  background: var(--surface);
  font-family: inherit;
  font-size: var(--text-small);
  white-space: pre-wrap;
}
.caption {
  margin-top: 0.5rem;
  font-size: var(--text-small);
  color: var(--muted);
}
</style>
