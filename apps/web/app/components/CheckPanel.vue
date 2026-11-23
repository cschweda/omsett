<script setup lang="ts">
import type { FileCheck } from '~/composables/useFileCheck'

// The accessibility check, as it is put to the person: first where the file would go and what
// is kept, with a button to send it and a button not to; then the score, and the way to the
// report. Opening this sends nothing.
defineProps<{
  check: FileCheck
  /** Which file this is, said under the score: the one added, or the one converted. */
  which: string
}>()
</script>

<template>
  <div v-if="check.offered && check.stage !== 'closed'" class="check" data-testid="check">
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
        <button type="button" class="text-button" data-testid="check-cancel" @click="check.close">Do not send it</button>
      </p>
    </template>
    <p v-else-if="check.stage === 'sending'" data-testid="check-sending">Sent to {{ check.host }}. Checking.</p>
    <template v-else-if="check.stage === 'done' && check.result">
      <p class="lead" data-testid="check-score">
        Accessibility: {{ check.result.verdict.score }} out of 100, grade {{ check.result.verdict.grade }}.
      </p>
      <p v-if="check.result.report" class="actions">
        <a :href="check.result.report" target="_blank" rel="noopener" class="button report" data-testid="check-report">Open the full report</a>
        <span class="aside">Opens on {{ check.host }}, in a new window. It can be saved or printed from there.</span>
      </p>
      <p v-else data-testid="check-no-report">The checker gave a score but could not save its full report.</p>
      <p class="aside" data-testid="check-which">{{ which }}</p>
    </template>
    <p v-else class="wrong" data-testid="check-failed">{{ check.error }}</p>
  </div>
</template>

<style scoped>
.check {
  grid-column: 1 / -1;
  margin-top: 0.75rem;
  padding: 0.625rem 0.75rem;
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
.lead {
  font-weight: 700;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 1rem;
  margin-top: 0.75rem;
}
.aside {
  margin: 0;
  color: var(--muted);
}
.wrong {
  color: var(--signal);
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
