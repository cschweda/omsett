import { testHook } from '~/utils/limits'
import { visitCounting, visitReport, visitSignals } from '~/utils/visits'

// Counts the visit, if and only if utils/visits.ts says to. No script is loaded for it: these
// lines are all of it. One small request is made to this origin each time a page is opened,
// and this origin's server passes it on. The page asks no other site for anything.
export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig().public
  // On localhost the tests may name a site, to show what a set-up copy does.
  const named = testHook('visits', location)
  const site = named ?? config.visitsSite
  // The build's site is counted only where the page is really served from it.
  if (visitCounting(visitSignals(site, named === null ? location.hostname : undefined)) !== 'on') return

  const report = (path: string) => {
    void fetch(config.visitsEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(visitReport(site, location.origin, path, document.referrer)),
      keepalive: true,
      // No cookie or other credential goes with it.
      credentials: 'omit',
    }).catch(() => {})
  }
  report(location.pathname)
  // Moving from page to page inside the app is a page opened, too.
  useRouter().afterEach((to, from) => {
    if (to.path !== from.path) report(to.path)
  })
})
