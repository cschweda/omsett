<script setup lang="ts">
import { formatById } from '@omsett/registry'
import facts from '~/generated/facts.json'
import { formatBytes } from '~/utils/format-bytes'
import { registry } from '~/utils/registry'

useHead({ title: 'Status — Omsett' })

const engines = useEngines()
const server = useServerHealth()
const readiness = useReadiness()
const { public: config } = useRuntimeConfig()

const secure = ref<boolean | null>(null)
const isolated = ref<boolean | null>(null)
onMounted(() => {
  secure.value = window.isSecureContext
  isolated.value = window.crossOriginIsolated
})

const word = (value: boolean | null | undefined) => (value == null ? 'Checking' : value ? 'Yes' : 'No')

const engineRows = computed(() =>
  Object.values(engines.info).map((info) => ({
    id: info.id,
    available: readiness.probed.value ? engines.availability.value[info.id] === true : null,
    size: info.sizeBytes === 0 ? 'Built into the browser' : `${formatBytes(info.sizeBytes)}, fetched once`,
    loaded: engines.loaded.value.includes(info.id),
  })),
)
const conversions = computed(() =>
  readiness.edges.map((edge) => {
    const engine = edge.candidates.find((c) => engines.availability.value[`${c.engine}>${edge.to}`] === true)
    return {
      key: `${edge.from}-${edge.to}`,
      from: formatById(registry, edge.from)?.name ?? edge.from,
      to: formatById(registry, edge.to)?.name ?? edge.to,
      engine: readiness.probed.value ? (engine?.engine ?? null) : undefined,
    }
  }),
)
</script>

<template>
  <div>
    <PageTitle title="Status" lead="Omsett has no server to be up or down. What matters is what this browser can do, so that is what is checked." />

    <main>
      <StepSection title="This device" heading-id="status-device">
        <p class="lead-text" data-testid="readiness">{{ readiness.label.value }}.</p>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr><th scope="col">Check</th><th scope="col">Result</th><th scope="col">What it means</th></tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Secure connection</th>
                <td data-testid="check-secure">{{ word(secure) }}</td>
                <td>Browsers only allow the faster engines on a secure page.</td>
              </tr>
              <tr>
                <th scope="row">Isolated from other sites</th>
                <td data-testid="check-isolated">{{ word(isolated) }}</td>
                <td>Lets an engine use several processor cores at once. libvips needs it.</td>
              </tr>
              <tr v-for="row in engineRows" :key="row.id">
                <th scope="row">Engine: {{ row.id }}</th>
                <td :data-testid="`check-engine-${row.id}`">{{ word(row.available) }}</td>
                <td>{{ row.size }}<template v-if="row.loaded">. Loaded in this tab.</template></td>
              </tr>
            </tbody>
          </table>
        </div>
      </StepSection>

      <StepSection title="Conversions" heading-id="status-conversions">
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr><th scope="col">From</th><th scope="col">To</th><th scope="col">In this browser</th></tr>
            </thead>
            <tbody>
              <tr v-for="row in conversions" :key="row.key">
                <th scope="row">{{ row.from }}</th>
                <td>{{ row.to }}</td>
                <td>
                  <template v-if="row.engine === undefined">Checking</template>
                  <template v-else-if="row.engine">Works, using {{ row.engine }}</template>
                  <template v-else>Not available</template>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </StepSection>

      <StepSection title="Server" heading-id="status-server">
        <div class="prose">
          <p v-if="server.state.value === 'absent'">
            None, by design. Every conversion on this site runs on your device, so there is nothing here that can go
            down while you are converting, and nowhere for a file to be sent.
          </p>
          <p v-else-if="server.state.value === 'reachable'">
            This copy of Omsett has its own server for conversions a browser cannot do, and it is answering.
          </p>
          <p v-else>This copy of Omsett is set up with its own server, and it is not answering.</p>
        </div>
      </StepSection>

      <StepSection title="This build" heading-id="status-build">
        <div class="table-wrap">
          <table class="table">
            <tbody>
              <tr><th scope="row">Version</th><td class="figures">{{ facts.version }}</td></tr>
              <tr><th scope="row">Built</th><td class="figures">{{ facts.built }}</td></tr>
              <tr><th scope="row">Commit</th><td class="figures">{{ config.commit }}</td></tr>
            </tbody>
          </table>
        </div>
      </StepSection>
    </main>
  </div>
</template>
