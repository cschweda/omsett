export interface ServerHealth {
  state: 'absent' | 'reachable' | 'unreachable'
  engines: string[]
  maxBytes: number | null
}

export const ABSENT: ServerHealth = { state: 'absent', engines: [], maxBytes: null }
const UNREACHABLE: ServerHealth = { state: 'unreachable', engines: [], maxBytes: null }

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>

/**
 * Same origin only, GET only, no body. Absent is the normal state and is never an error.
 * Never throws.
 */
export async function checkServerHealth(fetcher: Fetcher, timeoutMs = 3000): Promise<ServerHealth> {
  let configured: boolean
  try {
    const response = await fetcher('/config.json', { cache: 'no-store' })
    const config: unknown = response.ok ? await response.json() : null
    configured =
      typeof config === 'object' && config !== null && (config as { server?: unknown }).server === true
  } catch {
    return ABSENT
  }
  if (!configured) return ABSENT

  try {
    const response = await fetcher('/api/health', {
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!response.ok) return UNREACHABLE
    const body = (await response.json()) as { ok?: unknown; engines?: unknown; maxBytes?: unknown }
    if (body.ok !== true || !Array.isArray(body.engines)) return UNREACHABLE
    return {
      state: 'reachable',
      engines: body.engines.filter((e): e is string => typeof e === 'string'),
      maxBytes: typeof body.maxBytes === 'number' ? body.maxBytes : null,
    }
  } catch {
    return UNREACHABLE
  }
}
