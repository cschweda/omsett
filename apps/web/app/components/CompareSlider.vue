<script setup lang="ts">
// Before and after, one over the other, with a divider to drag between them.
// Both pictures are decoded in the thumbnail worker and drawn here as bitmaps.
const props = defineProps<{
  before: Blob
  after: Blob
  beforeLabel: string
  afterLabel: string
}>()

/** Longest side, in pixels, of the previews. Plenty for the widest layout on a dense screen. */
const PREVIEW = 2200

const engines = useEngines()
const beforeCanvas = useTemplateRef<HTMLCanvasElement>('beforeCanvas')
const afterCanvas = useTemplateRef<HTMLCanvasElement>('afterCanvas')
const position = ref(50)
/** Width over height of the picture; the stage takes its shape from it. */
const ratio = ref(1.6)
const failed = ref(false)
const ready = ref(false)

async function draw(blob: Blob, canvas: HTMLCanvasElement | null, sets: boolean) {
  if (!canvas) return
  const bitmap = await engines.thumbnail(blob, PREVIEW)
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0)
  if (sets) ratio.value = bitmap.width / bitmap.height
  bitmap.close()
}

async function render(blob: Blob, canvas: HTMLCanvasElement | null, sets = false) {
  try {
    await draw(blob, canvas, sets)
    failed.value = false
  } catch {
    failed.value = true
  }
}

onMounted(async () => {
  await Promise.all([render(props.before, beforeCanvas.value, true), render(props.after, afterCanvas.value)])
  ready.value = true
})
// A new conversion (the quality changed) redraws the right-hand side in place.
watch(
  () => props.after,
  (blob) => render(blob, afterCanvas.value),
)
watch(
  () => props.before,
  (blob) => render(blob, beforeCanvas.value, true),
)
</script>

<template>
  <figure v-if="!failed" class="compare" data-testid="compare" :data-ready="ready">
    <div
      class="stage"
      :style="{ aspectRatio: String(ratio), maxWidth: `calc(70vh * ${ratio})`, '--position': `${position}%` }"
    >
      <canvas ref="afterCanvas" class="layer" data-side="after" />
      <canvas ref="beforeCanvas" class="layer before" data-side="before" />
      <span class="tag left figures">{{ beforeLabel }}</span>
      <span class="tag right figures">{{ afterLabel }}</span>
      <span class="divider" aria-hidden="true"><span class="grip" /></span>
      <input
        v-model.number="position"
        type="range"
        min="0"
        max="100"
        step="0.5"
        class="control"
        :aria-label="`Compare: drag to reveal more of ${beforeLabel} or ${afterLabel}`"
        data-testid="compare-control"
      >
    </div>
    <figcaption class="caption">Drag the line to compare the original, left, with the result, right.</figcaption>
  </figure>
</template>

<style scoped>
.compare {
  grid-column: 1 / -1;
  margin: 1rem 0 0;
}
.stage {
  position: relative;
  /* Never taller than most of the window; the width follows, so the picture is never stretched. */
  width: 100%;
  overflow: hidden;
  /* A checkerboard behind both pictures, so transparency reads as transparency. */
  background-color: #fff;
  background-image:
    linear-gradient(45deg, #c9c9c9 25%, transparent 25%, transparent 75%, #c9c9c9 75%),
    linear-gradient(45deg, #c9c9c9 25%, transparent 25%, transparent 75%, #c9c9c9 75%);
  background-size: 16px 16px;
  background-position:
    0 0,
    8px 8px;
}
.layer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
/* The original sits on top and is cut off at the divider. */
.before {
  clip-path: inset(0 calc(100% - var(--position)) 0 0);
}
.tag {
  position: absolute;
  top: 0;
  padding: 0.25rem 0.625rem;
  background: #0d0d0d;
  color: #f4f4f2;
  font-size: var(--text-small);
  font-weight: 700;
  pointer-events: none;
}
.left {
  left: 0;
}
.right {
  right: 0;
}
.divider {
  position: absolute;
  top: 0;
  bottom: 0;
  left: var(--position);
  width: 2px;
  margin-left: -1px;
  background: #f4f4f2;
  box-shadow: 0 0 0 1px #0d0d0d;
  pointer-events: none;
}
.grip {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 0.75rem;
  height: 2.75rem;
  background: #f4f4f2;
  box-shadow: 0 0 0 1px #0d0d0d;
}
/* A real range input does the work: it covers the stage, invisible, and takes mouse, touch, and keys. */
.control {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  opacity: 0;
  cursor: ew-resize;
}
.stage:has(.control:focus-visible) {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.caption {
  margin-top: 0.5rem;
  font-size: var(--text-small);
  color: var(--muted);
}
</style>
