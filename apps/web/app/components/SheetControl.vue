<script setup lang="ts">
// Shown when the file being converted has sheets: which of them to convert. The names are
// read from the file, in the worker; until they are known, and where several files are being
// converted at once, the choice is between the first sheet and all of them.
const props = defineProps<{ files: File[] }>()
/** 'first', 'all', or a sheet's position among those shown, from "1". */
const sheet = defineModel<string>({ required: true })

const engines = useEngines()
const names = ref<string[]>([])
watch(
  () => props.files,
  async (files) => {
    const found = (await Promise.all(files.map((file) => engines.sheets(file)))).filter((list) => list.length > 0)
    // Sheets are named for one workbook. With several, a position would mean a different sheet in each.
    names.value = found.length === 1 ? found[0]! : []
    if (sheet.value !== 'first' && sheet.value !== 'all' && !(Number(sheet.value) >= 1 && Number(sheet.value) <= names.value.length)) sheet.value = 'first'
  },
  { immediate: true },
)
</script>

<template>
  <div class="sheet-control">
    <label for="sheet" class="label">Sheet</label>
    <select id="sheet" v-model="sheet" class="select" data-testid="sheet">
      <option value="first">The first sheet with anything in it</option>
      <option v-for="(name, index) in names" :key="index" :value="String(index + 1)">{{ index + 1 }}. {{ name }}</option>
      <option value="all">All sheets<template v-if="names.length > 0"> ({{ names.length }})</template></option>
    </select>
    <p class="hint">
      Hidden sheets are never converted. With all sheets, a format that can hold several tables gets one file with
      each sheet under its name; any other gets a file for each sheet.
    </p>
  </div>
</template>

<style scoped>
.sheet-control {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  max-width: 36rem;
}
.label {
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
.hint {
  margin: 0;
  font-size: var(--text-small);
  color: var(--muted);
}
</style>
