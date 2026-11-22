import { deriveEdges } from '@omsett/registry'
import { registry } from '~/utils/registry'

/**
 * Whether this browser can convert, judged from the engines' own probes. There is no server to
 * be up or down, so this is the only status the site has: the state of the visitor's device.
 */
export function useReadiness() {
  const engines = useEngines()
  const edges = deriveEdges(registry).edges

  const probed = computed(() => Object.keys(engines.availability.value).length > 0)
  /** Conversions this browser has at least one working engine for. */
  const working = computed(() =>
    edges.filter((edge) => edge.candidates.some((c) => engines.availability.value[c.engine] === true)),
  )
  const state = computed<'checking' | 'ready' | 'limited' | 'unavailable'>(() => {
    if (!probed.value) return 'checking'
    if (working.value.length === edges.length) return 'ready'
    return working.value.length > 0 ? 'limited' : 'unavailable'
  })
  const label = computed(
    () =>
      ({
        checking: 'Checking this device',
        ready: 'Ready on this device',
        limited: 'Partly available on this device',
        unavailable: 'Not available in this browser',
      })[state.value],
  )

  return { state, label, probed, working, edges }
}
