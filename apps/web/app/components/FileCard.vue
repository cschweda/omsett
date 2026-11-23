<script setup lang="ts">
import type { Detail } from '@omsett/engines'
import type { QueueFile } from '~/composables/useConversionQueue'
import { switchedOffReason } from '@omsett/registry'
import { CHECKED, MAX_CHECK_BYTES } from '~/utils/accessibility'
import { CheckFailed, type CheckResult } from '~/composables/useAccessibilityCheck'
import { formatBytes } from '~/utils/format-bytes'

const props = defineProps<{
  entry: QueueFile
  /** Whole seconds this file has been worked on, while it is. */
  seconds?: number
}>()
defineEmits<{ remove: [id: string] }>()

const canvas = useTemplateRef<HTMLCanvasElement>('canvas')

const known = computed(() => (props.entry.detection.kind === 'known' ? props.entry.detection : null))
const label = computed(() => {
  if (known.value) return known.value.format.name
  if (props.entry.detection.kind === 'unregistered') return props.entry.detection.ext.toUpperCase()
  return 'Unknown'
})
const note = computed(() => {
  if (props.entry.error) return props.entry.error
  if (props.entry.problem) return props.entry.problem
  if (props.entry.detection.kind === 'unregistered') {
    // Recognised, and not something Omsett converts so far: said by name, so it is clear the
    // file was understood.
    return switchedOffReason(props.entry.detection.ext) ?? `${label.value} is not supported yet`
  }
  if (!known.value) return 'Unsupported format'
  if (props.entry.mismatch) return `Named like another format, but the contents are ${known.value.format.name}.`
  return ''
})

// While a batch runs, each file says where it stands. The seconds appear once there are a few
// of them: a count that starts at once is noise on a conversion that takes half a second.
const active = computed(() => props.entry.stage === 'loading' || props.entry.stage === 'working')
const stage = computed(() => {
  const time = (props.seconds ?? 0) >= 2 ? `, ${props.seconds} s` : ''
  if (props.entry.stage === 'waiting') return 'Waiting'
  if (props.entry.stage === 'loading') return `Getting the converter (${formatBytes(props.entry.loadingBytes)}, once)${time}`
  if (props.entry.stage === 'working') return `Converting${time}`
  return ''
})

// What the file holds beside what it shows: asked for when the person asks, and read in the
// worker. What is known without reading the file is listed first, and at once.
const open = ref(false)
const reading = ref(false)
const found = ref<Detail[] | null>(null)
const basics = computed<Detail[]>(() => {
  const file = props.entry.file
  const changed = file.lastModified ? new Date(file.lastModified) : null
  return [
    { label: 'Kind', value: known.value ? known.value.format.name : label.value },
    { label: 'Size', value: `${formatBytes(file.size)} (${file.size.toLocaleString('en')} bytes)` },
    ...(known.value?.dimensions ? [{ label: 'Dimensions', value: `${known.value.dimensions.width} × ${known.value.dimensions.height} pixels` }] : []),
    // The date is the one this device keeps for the file. It is not inside the file, and so is not converted.
    ...(changed && !Number.isNaN(changed.getTime()) ? [{ label: 'Last changed on this device', value: changed.toLocaleString() }] : []),
  ]
})
async function toggle() {
  open.value = !open.value
  if (!open.value || found.value !== null || !known.value) return
  reading.value = true
  found.value = await useEngines().describe(props.entry.file, known.value.format.id)
  reading.value = false
}
const FATE = { removed: 'removed when converted', kept: 'kept' }

// Checking the file's accessibility, where this copy of Omsett is set up for it. It sends the
// file to a server, so nothing happens until the person has read where it goes and said to.
const checker = useAccessibilityCheck()
const checkerSite = ref<{ origin: string; host: string } | null>(null)
onMounted(() => {
  checkerSite.value = checker.site()
})
const checkable = computed(() => checkerSite.value !== null && known.value !== null && CHECKED.includes(known.value.format.category))
const tooLargeToCheck = computed(() => props.entry.file.size > MAX_CHECK_BYTES)
const checking = ref<'closed' | 'asking' | 'sending' | 'done' | 'failed'>('closed')
const checked = ref<CheckResult | null>(null)
const checkError = ref('')
function askToCheck() {
  checking.value = checking.value === 'closed' ? (checked.value ? 'done' : 'asking') : 'closed'
}
async function sendForChecking() {
  checking.value = 'sending'
  try {
    checked.value = await checker.check(props.entry.file)
    checking.value = 'done'
  } catch (error) {
    checkError.value = error instanceof CheckFailed ? error.message : 'The checker did not answer. The file was not checked.'
    checking.value = 'failed'
  }
}

// Only a picture has a preview. Anything else gets no empty square where one would be.
const pictured = computed(() => known.value !== null && ['image', 'vector'].includes(known.value.format.category))

// A note is either information (a mislabeled file) or a failure. Only a failure is red.
const failed = computed(() => Boolean(props.entry.error || props.entry.problem || !known.value))

// Draw the worker-made bitmap; the page itself never decodes the file.
watch(
  () => [props.entry.thumbnail, canvas.value] as const,
  ([bitmap, element]) => {
    if (!bitmap || !element) return
    element.width = bitmap.width
    element.height = bitmap.height
    element.getContext('2d')?.drawImage(bitmap, 0, 0)
  },
  { immediate: true, flush: 'post' },
)
</script>

<template>
  <li class="file-card" :class="{ plain: !pictured }" :data-status="entry.status">
    <div v-if="pictured" class="thumb" aria-hidden="true">
      <canvas v-show="entry.thumbnail" ref="canvas" />
    </div>
    <div class="meta">
      <p class="name">{{ entry.file.name }}</p>
      <p class="facts figures">
        <span class="format">{{ label }}</span>
        <span>{{ formatBytes(entry.file.size) }}</span>
        <span v-if="known?.dimensions">{{ known.dimensions.width }} × {{ known.dimensions.height }}</span>
      </p>
      <p v-if="note" class="note" :class="{ wrong: failed }" data-testid="file-note">{{ note }}</p>
    </div>
    <div class="actions">
      <button type="button" class="text-button" :aria-expanded="open" data-testid="details-toggle" @click="toggle">
        {{ open ? 'Hide details' : 'Details' }}<span class="sr-only"> of {{ entry.file.name }}</span>
      </button>
      <button
        v-if="checkable"
        type="button"
        class="text-button"
        :aria-expanded="checking !== 'closed'"
        data-testid="check-toggle"
        @click="askToCheck"
      >
        Check accessibility<span class="sr-only"> of {{ entry.file.name }}</span>
      </button>
      <button
        type="button"
        class="text-button remove"
        :aria-label="`Remove ${entry.file.name}`"
        @click="$emit('remove', entry.id)"
      >
        Remove
      </button>
    </div>
    <div v-if="open" class="details" data-testid="details">
      <dl>
        <div v-for="detail in [...basics, ...(found ?? [])]" :key="detail.label">
          <dt>{{ detail.label }}</dt>
          <dd>
            {{ detail.value }}
            <span v-if="detail.fate" class="fate" :class="detail.fate" :data-fate="detail.fate">{{ FATE[detail.fate] }}</span>
          </dd>
        </div>
      </dl>
      <p v-if="reading" class="details-note" data-testid="details-reading">Reading the file</p>
      <p v-else-if="found !== null && found.length === 0" class="details-note" data-testid="details-none">
        Nothing more is recorded in this file, or nothing Omsett reads.
      </p>
    </div>
    <div v-if="checkable && checking !== 'closed'" class="details check" data-testid="check">
      <template v-if="checking === 'asking'">
        <p class="check-lead">This sends the file to a server.</p>
        <p>
          It is the one thing in Omsett that sends a file off your device, and it happens only if you press the
          button below. The file goes to <strong>{{ checkerSite?.host }}</strong>, an accessibility checker.
        </p>
        <ul>
          <li>The checker does not keep the file.</li>
          <li>It asks another server for part of the audit.</li>
          <li>It keeps the report, with the file’s name, at a private link for a year, so that you can open it.</li>
        </ul>
        <p v-if="tooLargeToCheck" class="wrong" data-testid="check-too-large">
          This file is larger than the checker takes (25 MB), so it cannot be checked.
        </p>
        <p class="check-actions">
          <button v-if="!tooLargeToCheck" type="button" class="button solid" data-testid="check-send" @click="sendForChecking">
            Send this file and check it
          </button>
          <button type="button" class="text-button" data-testid="check-cancel" @click="checking = 'closed'">Do not send it</button>
        </p>
      </template>
      <p v-else-if="checking === 'sending'" data-testid="check-sending">
        Sent to {{ checkerSite?.host }}. Checking.
      </p>
      <template v-else-if="checking === 'done' && checked">
        <p class="check-lead" data-testid="check-score">
          Accessibility: {{ checked.verdict.score }} out of 100, grade {{ checked.verdict.grade }}.
        </p>
        <p v-if="checked.report">
          <a :href="checked.report" target="_blank" rel="noopener" data-testid="check-report">Open the full report</a>
          (on {{ checkerSite?.host }}, in a new window)
        </p>
        <p v-else data-testid="check-no-report">The checker gave a score but could not save its full report.</p>
        <p class="details-note">This is the file as you added it, before any conversion.</p>
      </template>
      <p v-else class="wrong" data-testid="check-failed">{{ checkError }}</p>
    </div>
    <div v-if="entry.status !== 'ready'" class="progress">
      <div
        class="bar"
        :class="{ active }"
        role="progressbar"
        aria-valuemin="0"
        aria-valuemax="100"
        :aria-valuenow="Math.round(entry.progress * 100)"
        :aria-label="`Converting ${entry.file.name}`"
        data-testid="file-progress"
      >
        <div class="fill" :style="{ width: `${Math.round(entry.progress * 100)}%` }" />
      </div>
      <p v-if="stage" class="stage figures" data-testid="file-stage">{{ stage }}</p>
    </div>
  </li>
</template>

<style scoped>
.file-card {
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr) auto;
  column-gap: 1rem;
  align-items: center;
  padding: 0.875rem 0;
  border-top: 1px solid var(--rule);
  list-style: none;
}
.file-card.plain {
  grid-template-columns: minmax(0, 1fr) auto;
}
.file-card:last-child {
  border-bottom: 1px solid var(--rule);
}
.thumb {
  width: 56px;
  height: 56px;
  display: grid;
  place-items: center;
  background: var(--surface);
}
.thumb canvas {
  max-width: 56px;
  max-height: 56px;
}
.name {
  margin: 0;
  font-weight: 500;
  overflow-wrap: anywhere;
}
.facts {
  display: flex;
  flex-wrap: wrap;
  gap: 0 0.875rem;
  margin: 0.125rem 0 0;
  font-size: var(--text-small);
  color: var(--muted);
}
.format {
  color: var(--ink);
  font-weight: 700;
}
.note {
  margin: 0.25rem 0 0;
  font-size: var(--text-small);
}
.note.wrong {
  color: var(--signal);
  font-weight: 700;
}
.note.wrong::before {
  content: '';
  display: inline-block;
  width: 0.5rem;
  height: 0.5rem;
  margin-right: 0.45rem;
  background: var(--signal);
}
.actions {
  display: flex;
  gap: 1rem;
  font-size: var(--text-small);
}
.details {
  grid-column: 1 / -1;
  margin-top: 0.75rem;
  padding: 0.625rem 0.75rem;
  background: var(--surface);
  font-size: var(--text-small);
}
.details dl {
  margin: 0;
}
.details dl > div {
  display: grid;
  grid-template-columns: minmax(8rem, 14rem) minmax(0, 1fr);
  column-gap: 1rem;
  padding: 0.25rem 0;
  border-top: 1px solid var(--rule);
}
.details dl > div:first-child {
  border-top: 0;
}
.details dt {
  color: var(--muted);
}
.details dd {
  margin: 0;
  overflow-wrap: anywhere;
}
/* What converting does with it: red for what is taken out, green for what stays. */
.fate {
  margin-left: 0.5rem;
  font-weight: 700;
  white-space: nowrap;
}
.fate.removed {
  color: var(--signal);
}
.fate.kept {
  color: var(--positive);
}
.details-note {
  margin: 0.5rem 0 0;
  color: var(--muted);
}
.check p,
.check ul {
  margin: 0 0 0.5rem;
  max-width: 60ch;
}
.check ul {
  padding-left: 1.1rem;
  list-style: square;
}
.check-lead {
  font-weight: 700;
}
.check a {
  text-decoration: underline;
  text-underline-offset: 0.15em;
}
.check-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 1rem;
  margin-top: 0.75rem;
}
.check .wrong {
  color: var(--signal);
}
.actions {
  flex-wrap: wrap;
  justify-content: flex-end;
}
@media (max-width: 520px) {
  .details dl > div {
    grid-template-columns: minmax(0, 1fr);
  }
}
.progress {
  grid-column: 1 / -1;
  margin-top: 0.75rem;
}
.stage {
  margin: 0.375rem 0 0;
  font-size: var(--text-small);
  color: var(--muted);
}
</style>

<!-- The bar is shared with the batch's own, beside the Convert button. -->
<style>
.bar {
  position: relative;
  height: 4px;
  overflow: hidden;
  background: var(--rule);
}
.bar .fill {
  height: 100%;
  background: var(--accent);
  transition: width 200ms linear;
}
/* A band of light crossing the whole track, filled or not: the sign that work is going on
   between the moments an engine can say how far it has got. */
.bar.active::after {
  content: '';
  position: absolute;
  inset: 0;
  width: 30%;
  background: linear-gradient(90deg, transparent, var(--ink), transparent);
  opacity: 0.35;
  animation: bar-sweep 1.4s linear infinite;
}
@keyframes bar-sweep {
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(334%);
  }
}
/* With motion turned down the band stands still; the count of seconds is what moves. */
@media (prefers-reduced-motion: reduce) {
  .bar.active::after {
    animation: none;
    width: 100%;
    opacity: 0.15;
  }
  .bar .fill {
    transition: none;
  }
}
</style>
