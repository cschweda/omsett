import { ABSENT, checkServerHealth, type ServerHealth } from '~/utils/server-health'

/**
 * The only code that knows a server might exist. It talks to its own origin and nowhere else.
 * No feature may require a server; absent is the normal state and shows no error.
 */
export function useServerHealth() {
  const health = useState<ServerHealth>('server-health', () => ({ ...ABSENT }))

  async function refresh() {
    health.value = await checkServerHealth((input, init) => fetch(input, init))
  }

  return {
    state: computed(() => health.value.state),
    engines: computed(() => health.value.engines),
    maxBytes: computed(() => health.value.maxBytes),
    refresh,
  }
}
