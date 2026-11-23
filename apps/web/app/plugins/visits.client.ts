import { testHook } from '~/utils/limits'
import { visitCounting, visitSignals } from '~/utils/visits'

// Counts the visit, if and only if utils/visits.ts says to. The counting script is loaded from
// this origin, which forwards it; the page asks no other site for anything, and its security
// policy is the same with counting on as with it off.
export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig().public
  // On localhost the tests may name a script, to show what a set-up copy does.
  const script = testHook('visits', location) ?? config.visitsScript
  if (visitCounting(visitSignals(script)) !== 'on') return

  type Plausible = ((...args: unknown[]) => void) & { q?: unknown[]; o?: unknown; init?: (options?: unknown) => void }
  const host = window as Window & { plausible?: Plausible }
  // What the script expects to find when it arrives: a place to queue calls, and its options.
  const plausible: Plausible = host.plausible ?? ((...args: unknown[]) => void (plausible.q = plausible.q ?? []).push(args))
  plausible.init ??= (options) => void (plausible.o = options ?? {})
  host.plausible = plausible
  // Counts are sent to this origin as well, never to another.
  plausible.init({ endpoint: config.visitsEndpoint })

  const tag = document.createElement('script')
  tag.async = true
  tag.src = script
  tag.dataset.testid = 'visits-script'
  document.head.append(tag)
})
