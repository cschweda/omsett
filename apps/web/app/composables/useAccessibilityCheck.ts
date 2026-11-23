import { CHECK_PATH, checkerSite, failureReason, MAX_CHECK_BYTES, readVerdict, reportAddress, type Verdict } from '~/utils/accessibility'
import { testHook } from '~/utils/limits'

export type CheckerHealth = 'not-set-up' | 'checking' | 'up' | 'down'

export interface CheckResult {
  verdict: Verdict
  /** The saved report's address on the checker's site; null if it could not be saved. */
  report: string | null
}

/** A check that did not happen, with the reason in words for the person. */
export class CheckFailed extends Error {
  override name = 'CheckFailed'
}

/**
 * The only code that sends a file anywhere, and only when the person has asked it to
 * (see utils/accessibility.ts). It talks to this origin; the server passes it on.
 */
export function useAccessibilityCheck() {
  const config = useRuntimeConfig().public
  const health = useState<CheckerHealth>('accessibility-health', () => 'not-set-up')

  // On localhost the tests may name a checker, to show what a set-up copy does.
  const site = () => checkerSite((import.meta.client ? testHook('accessibility', location) : null) ?? config.accessibilityChecker)

  /** Whether the checker is answering. Asks this origin, and sends nothing about anyone. */
  async function refresh() {
    if (!site()) {
      health.value = 'not-set-up'
      return
    }
    health.value = 'checking'
    try {
      const response = await fetch(`${CHECK_PATH}/health`, { credentials: 'omit', cache: 'no-store' })
      const body = response.ok ? ((await response.json()) as { status?: unknown }) : null
      health.value = typeof body?.status === 'string' ? 'up' : 'down'
    } catch {
      health.value = 'down'
    }
  }

  /** Send the file and wait for its score. Called only after the person has said to. */
  async function check(file: File): Promise<CheckResult> {
    const checker = site()
    if (!checker) throw new CheckFailed(failureReason(0))
    if (file.size > MAX_CHECK_BYTES) throw new CheckFailed(failureReason(413))
    const form = new FormData()
    form.append('file', file, file.name)
    let answered: unknown
    try {
      const response = await fetch(`${CHECK_PATH}/analyze`, { method: 'POST', body: form, credentials: 'omit' })
      if (!response.ok) throw new CheckFailed(failureReason(response.status))
      answered = await response.json()
    } catch (error) {
      throw error instanceof CheckFailed ? error : new CheckFailed(failureReason(0))
    }
    const verdict = readVerdict(answered)
    if (!verdict) throw new CheckFailed(failureReason(0))

    // The report is kept by the checker so that it can be opened. The file is not.
    let report: string | null = null
    try {
      const saved = await fetch(`${CHECK_PATH}/reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report: answered }),
        credentials: 'omit',
      })
      if (saved.ok) report = reportAddress(checker.origin, ((await saved.json()) as { id?: unknown }).id)
    } catch {
      // The score stands without a saved report.
    }
    return { verdict, report }
  }

  return { site, health, refresh, check }
}
