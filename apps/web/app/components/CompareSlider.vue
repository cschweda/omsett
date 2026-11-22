<script setup lang="ts">
// Before and after, one over the other, with a divider to drag between them. Scroll to zoom,
// drag to pan once zoomed, and change the quality from here to watch the result follow.
// Both pictures are decoded in the preview worker and drawn here as bitmaps.
const props = defineProps<{
  before: Blob
  after: Blob
  beforeLabel: string
  afterLabel: string
  /** The conversion's quality, when its encoder has one. Changing it converts again. */
  quality?: number | null
  suggestedQuality?: number | null
  /** True while a new result is being made, so the label can say so. */
  busy?: boolean
}>()
const emit = defineEmits<{ 'update:quality': [value: number] }>()

/** Longest side, in pixels, of the previews: enough to inspect detail when zoomed in. */
const PREVIEW = 4096
const MIN_ZOOM = 1
const MAX_ZOOM = 8

const engines = useEngines()
const qualityId = useId()
const stage = useTemplateRef<HTMLElement>('stage')
const beforeCanvas = useTemplateRef<HTMLCanvasElement>('beforeCanvas')
const afterCanvas = useTemplateRef<HTMLCanvasElement>('afterCanvas')
const position = ref(50)
/** Width over height of the picture; the stage takes its shape from it. */
const ratio = ref(1.6)
const failed = ref(false)
const ready = ref(false)

const zoom = ref(1)
const panX = ref(0)
const panY = ref(0)
const zoomed = computed(() => zoom.value > 1)
const zoomLabel = computed(() => `${Math.round(zoom.value * 100)}%`)
const transform = computed(() => ({
  transform: `translate(${panX.value}px, ${panY.value}px) scale(${zoom.value})`,
  // Past twice life size, show the pixels as they are: smoothing would hide what is being judged.
  imageRendering: zoom.value > 2 ? ('pixelated' as const) : ('auto' as const),
}))

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

// ---- zoom and pan ----------------------------------------------------------------------------

/** Keep the picture from being dragged out of its frame. */
function clampPan() {
  const box = stage.value?.getBoundingClientRect()
  if (!box) return
  const limitX = ((zoom.value - 1) * box.width) / 2
  const limitY = ((zoom.value - 1) * box.height) / 2
  panX.value = Math.max(-limitX, Math.min(limitX, panX.value))
  panY.value = Math.max(-limitY, Math.min(limitY, panY.value))
}

/** Zoom to `next`, keeping the point at (cx, cy), measured from the stage's centre, where it is. */
function zoomTo(next: number, cx = 0, cy = 0) {
  const target = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, next))
  const factor = target / zoom.value
  panX.value = cx - factor * (cx - panX.value)
  panY.value = cy - factor * (cy - panY.value)
  zoom.value = target
  if (target === 1) {
    panX.value = 0
    panY.value = 0
  }
  clampPan()
}
const zoomIn = () => zoomTo(zoom.value * 1.5)
const zoomOut = () => zoomTo(zoom.value / 1.5)
const resetZoom = () => zoomTo(1)

function onWheel(event: WheelEvent) {
  const box = stage.value?.getBoundingClientRect()
  if (!box) return
  // Toward the pointer: what is under it stays under it.
  const cx = event.clientX - box.left - box.width / 2
  const cy = event.clientY - box.top - box.height / 2
  zoomTo(zoom.value * (event.deltaY < 0 ? 1.25 : 0.8), cx, cy)
}

// ---- pointer: the handle moves the divider; elsewhere it pans when zoomed --------------------

let touched = false
function touch() {
  touched = true
}
let mode: 'divider' | 'pan' | null = null
let last = { x: 0, y: 0 }

function setDivider(clientX: number) {
  const box = stage.value?.getBoundingClientRect()
  if (!box) return
  position.value = Math.round(Math.max(0, Math.min(100, ((clientX - box.left) / box.width) * 100)) * 2) / 2
}

function onPointerDown(event: PointerEvent) {
  const box = stage.value?.getBoundingClientRect()
  if (!box || event.button !== 0) return
  touched = true
  const dividerX = box.left + (position.value / 100) * box.width
  const onHandle = Math.abs(event.clientX - dividerX) <= 28
  // At life size the whole picture moves the divider. Zoomed in, only the handle does, and
  // anywhere else drags the picture about.
  mode = onHandle || !zoomed.value ? 'divider' : 'pan'
  last = { x: event.clientX, y: event.clientY }
  if (mode === 'divider') setDivider(event.clientX)
  stage.value?.setPointerCapture(event.pointerId)
  event.preventDefault()
}

function onPointerMove(event: PointerEvent) {
  if (!mode) return
  if (mode === 'divider') setDivider(event.clientX)
  else {
    panX.value += event.clientX - last.x
    panY.value += event.clientY - last.y
    clampPan()
  }
  last = { x: event.clientX, y: event.clientY }
}

function onPointerUp() {
  mode = null
}

// Once, when the comparison first appears, the handle slides a little each way and comes back,
// so it is seen to be something that moves and not a line in the picture. It stops the moment
// the handle is touched, and does not happen at all for someone who has asked for less motion.
function nudge() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const started = performance.now()
  const duration = 1400
  const reach = 9
  const step = (now: number) => {
    const t = Math.min(1, (now - started) / duration)
    if (touched) return
    position.value = 50 + Math.sin(t * Math.PI * 2) * reach * (1 - t * 0.35)
    if (t < 1) requestAnimationFrame(step)
    else position.value = 50
  }
  requestAnimationFrame(step)
}

const localQuality = computed({
  get: () => props.quality ?? 0,
  set: (value: number) => emit('update:quality', value),
})

onMounted(async () => {
  await Promise.all([render(props.before, beforeCanvas.value, true), render(props.after, afterCanvas.value)])
  ready.value = true
  nudge()
})
// A new conversion (the quality changed) redraws the result in place; zoom and pan are kept,
// so a detail being inspected stays in view while the quality is moved.
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
    <div class="controls">
      <div class="control-row">
        <span class="control-name">Zoom</span>
        <button type="button" class="step" aria-label="Zoom out" :disabled="!zoomed" data-testid="zoom-out" @click="zoomOut">
          −
        </button>
        <output class="figures zoom-value" data-testid="compare-zoom">{{ zoomLabel }}</output>
        <button
          type="button"
          class="step"
          aria-label="Zoom in"
          :disabled="zoom >= MAX_ZOOM"
          data-testid="zoom-in"
          @click="zoomIn"
        >
          +
        </button>
        <button type="button" class="text-button reset" :disabled="!zoomed" data-testid="zoom-reset" @click="resetZoom">
          Reset
        </button>
        <span class="hint">Scroll to zoom<template v-if="zoomed">, drag to pan</template></span>
      </div>

      <div v-if="quality !== null && quality !== undefined" class="control-row">
        <label :for="qualityId" class="control-name">Quality</label>
        <output class="figures quality-value">{{ quality }}</output>
        <input
          :id="qualityId"
          v-model.number="localQuality"
          type="range"
          min="1"
          max="100"
          step="1"
          class="quality-range"
          data-testid="compare-quality"
        >
        <button
          v-if="suggestedQuality != null && quality !== suggestedQuality"
          type="button"
          class="text-button reset"
          @click="localQuality = suggestedQuality"
        >
          Back to {{ suggestedQuality }}
        </button>
        <span class="hint" aria-live="off">{{ busy ? 'Converting…' : 'The picture follows as you move it' }}</span>
      </div>
    </div>

    <div
      ref="stage"
      class="stage"
      :class="{ zoomed }"
      :style="{ aspectRatio: String(ratio), maxWidth: `calc(70vh * ${ratio})`, '--position': `${position}%` }"
      @wheel.prevent="onWheel"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    >
      <div class="layer"><canvas ref="afterCanvas" :style="transform" data-side="after" /></div>
      <!-- The original sits on top and is cut off at the divider. The cut is on the frame, not
           the picture, so it stays put while the picture is zoomed and panned beneath it. -->
      <div class="layer before"><canvas ref="beforeCanvas" :style="transform" data-side="before" /></div>
      <span class="tag left figures">{{ beforeLabel }}</span>
      <span class="tag right figures">{{ afterLabel }}</span>
      <span class="divider" aria-hidden="true">
        <span class="grip">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M9 6 3.5 12 9 18M15 6l5.5 6L15 18" stroke-linecap="square" />
          </svg>
        </span>
      </span>
      <!-- The divider's keyboard control: arrow keys move it. Pointer work is done by the stage. -->
      <input
        v-model.number="position"
        type="range"
        min="0"
        max="100"
        step="0.5"
        class="control sr-only"
        :aria-label="`Compare: move to reveal more of ${beforeLabel} or ${afterLabel}`"
        data-testid="compare-control"
        @keydown="touch"
      >
    </div>
    <figcaption class="caption">
      Drag the handle to compare the original, on the left, with the result, on the right.
    </figcaption>
  </figure>
</template>

<style scoped>
.compare {
  grid-column: 1 / -1;
  margin: 1rem 0 0;
}

/* The bar above the picture: zoom, and quality where the conversion has one. */
.controls {
  display: flex;
  flex-direction: column;
  margin-bottom: 0.75rem;
  border-top: 1px solid var(--rule);
}
.control-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 0.875rem;
  padding: 0.625rem 0;
  border-bottom: 1px solid var(--rule);
  font-size: var(--text-small);
}
.control-name {
  min-width: 3.75rem;
  font-weight: 700;
}
.step {
  width: 2rem;
  height: 2rem;
  border: 1px solid var(--ink);
  border-radius: 0;
  background: transparent;
  color: var(--ink);
  font-size: 1.125rem;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
}
.step:hover:not(:disabled) {
  background: var(--ink);
  color: var(--bg);
}
.step:disabled,
.reset:disabled {
  border-color: var(--rule-strong);
  color: var(--muted);
  cursor: default;
}
.zoom-value {
  min-width: 3.25rem;
  text-align: center;
  font-weight: 700;
}
.quality-value {
  min-width: 2rem;
  font-weight: 700;
  color: var(--accent-text);
}
.quality-range {
  flex: 1 1 10rem;
  min-width: 8rem;
  accent-color: var(--accent);
}
.hint {
  margin-left: auto;
  color: var(--muted);
}

.stage {
  position: relative;
  /* Never taller than most of the window; the width follows, so the picture is never stretched. */
  width: 100%;
  overflow: hidden;
  cursor: ew-resize;
  user-select: none;
  /* A finger scrolls the page past the picture at life size; zoomed in, it moves the picture. */
  touch-action: pan-y;
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
.stage.zoomed {
  cursor: grab;
  touch-action: none;
}
.stage.zoomed:active {
  cursor: grabbing;
}
.layer {
  position: absolute;
  inset: 0;
  overflow: hidden;
}
.layer canvas {
  display: block;
  width: 100%;
  height: 100%;
  transform-origin: center center;
  will-change: transform;
}
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
/* The divider is drawn in the accent colour with a dark edge, so it reads as a control laid
   over the picture, whatever the picture is, and never as a line that belongs to it. */
.divider {
  position: absolute;
  top: 0;
  bottom: 0;
  left: var(--position);
  width: 4px;
  margin-left: -2px;
  background: var(--accent);
  box-shadow: 0 0 0 1px rgba(13, 13, 13, 0.85);
  pointer-events: none;
}
/* The handle: a round button with an arrow each way. This is the part that says "drag me". */
.grip {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: grid;
  place-items: center;
  width: 3rem;
  height: 3rem;
  border-radius: 50%;
  background: var(--accent);
  color: #ffffff;
  box-shadow:
    0 0 0 3px #f4f4f2,
    0 0 0 4px rgba(13, 13, 13, 0.85),
    0 4px 14px rgba(0, 0, 0, 0.45);
}
.stage:hover .grip,
.stage:has(.control:focus-visible) .grip {
  background: #f4f4f2;
  color: var(--accent);
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
