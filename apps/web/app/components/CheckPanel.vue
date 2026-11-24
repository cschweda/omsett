<script setup lang="ts">
import type { FileCheck } from '~/composables/useFileCheck'

// The accessibility check, as it is put to the person: first where the file would go and what
// is kept, with a button to send it and a button not to; then that it is being checked; then
// the score, the way to the report, and the way on. Opening this sends nothing.
//
// It is a card of its own, ruled off from the file it belongs to, with its actions as buttons:
// a person who has read a score should not have to hunt for what to do next.
const props = defineProps<{
  check: FileCheck
  /** Which file this is, said under the score: the one added, or the one converted. */
  which: string
  /** Set where there is a next thing to do with the file: choosing what to convert it to. */
  onward?: boolean
}>()
defineEmits<{ onward: [] }>()

// How long the check has been going. The checker does not say how far it has got, so the time
// is the one true thing there is to show.
const seconds = ref(0)
let ticking: ReturnType<typeof setInterval> | undefined
watch(
  () => props.check.stage,
  (stage) => {
    clearInterval(ticking)
    if (stage !== 'sending') return
    const count = () => (seconds.value = Math.max(0, Math.floor((Date.now() - props.check.since) / 1000)))
    count()
    ticking = setInterval(count, 500)
  },
  { immediate: true },
)
onBeforeUnmount(() => clearInterval(ticking))
</script>

<template>
  <div v-if="check.offered && check.stage !== 'closed'" class="check" :data-stage="check.stage" data-testid="check">
    <p class="kicker">Accessibility check</p>
    <template v-if="check.stage === 'asking'">
      <p class="lead">This sends the file to a server.</p>
      <p>
        It is the one thing in Omsett that sends a file off your device, and it happens only if you press the
        button below. The file goes to <strong>{{ check.host }}</strong>, an accessibility checker.
        <span v-if="check.maker" data-testid="check-maker">{{ check.maker }}</span>
      </p>
      <ul>
        <li>The checker does not keep the file.</li>
        <li>It asks another server for part of the audit.</li>
        <li>It keeps the report, with the file’s name, at a private link for a year, so that you can open it.</li>
      </ul>
      <p v-if="check.tooLarge" class="wrong" data-testid="check-too-large">
        This file is larger than the checker takes (25 MB), so it cannot be checked.
      </p>
      <p class="actions">
        <button v-if="!check.tooLarge" type="button" class="button solid" data-testid="check-send" @click="check.send">
          Send this file and check it
        </button>
        <button type="button" class="button" data-testid="check-cancel" @click="check.close">Do not send it</button>
      </p>
    </template>
    <div v-else-if="check.stage === 'sending'" data-testid="check-sending">
      <p class="lead">
        <template v-if="check.step === 'saving'">Checked. Saving the report on {{ check.host }}.</template>
        <template v-else>Sent to {{ check.host }}. Checking.</template>
        <span class="figures elapsed" data-testid="check-elapsed">{{ seconds }} s</span>
      </p>
      <!-- Not a measure of how far: a sign that it is still going. The checker reports nothing until it is done. -->
      <div class="working" :class="{ late: check.step === 'saving' }" data-testid="check-working"><div class="runner" /></div>
      <p class="aside">
        The checker reads the whole document and says nothing until it has finished, so this shows that it is
        working, not how far it has got. A long document takes longer. You can go on with your conversion meanwhile.
      </p>
    </div>
    <template v-else-if="check.stage === 'done' && check.result">
      <p class="score" data-testid="check-score">
        Accessibility: {{ check.result.verdict.score }} out of 100, grade {{ check.result.verdict.grade }}.
      </p>
      <p class="aside" data-testid="check-which">{{ which }}</p>
      <p class="actions">
        <a v-if="check.result.report" :href="check.result.report" target="_blank" rel="noopener" class="button report" data-testid="check-report">Open the full report</a>
        <button v-if="onward" type="button" class="button" data-testid="check-onward" @click="$emit('onward')">Go on to convert it</button>
        <button type="button" class="button" data-testid="check-close" @click="check.close">Close</button>
      </p>
      <p v-if="check.result.report" class="aside">The report opens on {{ check.host }}, in a new window. It can be saved or printed from there.</p>
      <p v-else data-testid="check-no-report">The checker gave a score but could not save its full report.</p>
    </template>
    <template v-else>
      <p class="wrong" data-testid="check-failed">{{ check.error }}</p>
      <p class="actions">
        <button type="button" class="button" data-testid="check-again" @click="check.send">Try again</button>
        <button type="button" class="button" @click="check.close">Close</button>
      </p>
    </template>
  </div>
</template>

<style scoped>
/* A card of its own: a rule all round, and a thick one in the accent across its top. */
.check {
  grid-column: 1 / -1;
  margin-top: 0.875rem;
  padding: 0.875rem 1rem 1rem;
  border: 1px solid var(--rule-strong);
  border-top: 4px solid var(--accent);
  background: var(--surface);
  font-size: var(--text-small);
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
.kicker {
  font-weight: 700;
  color: var(--muted);
}
.lead {
  font-weight: 700;
}
.score {
  font-size: var(--text-lead);
  font-weight: 700;
  letter-spacing: -0.01em;
  line-height: 1.25;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
  margin-top: 0.875rem;
  max-width: none !important;
}
.aside {
  color: var(--muted);
}
.wrong {
  color: var(--signal);
}
.elapsed {
  margin-left: 0.5rem;
  font-weight: 400;
  color: var(--muted);
}
/* A band that runs across, over and over, for as long as the check goes on. */
.working {
  position: relative;
  height: 4px;
  margin: 0.625rem 0 0.75rem;
  max-width: 60ch;
  overflow: hidden;
  background: var(--rule);
}
.runner {
  position: absolute;
  inset: 0 auto 0 0;
  width: 32%;
  background: var(--accent);
  animation: run 1.3s linear infinite;
}
.working.late .runner {
  background: var(--positive);
}
@keyframes run {
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(315%);
  }
}
/* Where movement is not wanted, the band stands still and the count of seconds says it is going. */
@media (prefers-reduced-motion: reduce) {
  .runner {
    width: 100%;
    animation: none;
    opacity: 0.55;
  }
}
/* The one coloured button on a card: the way to the report. */
.report {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--on-accent);
  text-decoration: none;
}
.report:hover {
  filter: brightness(1.1);
}
</style>
