<script setup lang="ts">
// Shown when the file being converted is a table: a workbook, a CSV, a TSV.
const named = defineModel<boolean>('named', { required: true })
/** Undefined where the target has only one shape to take. */
const shape = defineModel<string | undefined>('shape')
</script>

<template>
  <div class="table-options">
    <label class="check">
      <input v-model="named" type="checkbox" data-testid="header-row">
      <span>The first row holds the column names</span>
    </label>
    <p class="hint">
      Turn this off if the first row is data like the rest. The columns are then called column_A, column_B and so
      on, and no row is left out.
    </p>
    <template v-if="shape !== undefined">
      <label for="shape" class="label">Shape of the result</label>
      <select id="shape" v-model="shape" class="select" data-testid="shape">
        <option value="records">Records: each row names its columns</option>
        <option value="rows">Rows: the names once, then lists of values</option>
        <option value="columns">Columns: each column's values together</option>
      </select>
      <p class="hint">
        Records repeat the column names in every row, which is what most programs expect. Rows and columns say each
        name once.
      </p>
    </template>
  </div>
</template>

<style scoped>
.table-options {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  max-width: 36rem;
}
.check {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 700;
}
.check input {
  width: 1.125rem;
  height: 1.125rem;
  accent-color: var(--accent);
}
.label {
  margin-top: 0.5rem;
  font-weight: 700;
}
.select {
  max-width: 26rem;
  padding: 0.5rem 0.625rem;
  border: 1px solid var(--rule-strong);
  border-radius: 0;
  background: var(--bg);
  color: var(--ink);
  font: inherit;
}
.select:focus-visible,
.check input:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.hint {
  margin: 0;
  font-size: var(--text-small);
  color: var(--muted);
}
</style>
