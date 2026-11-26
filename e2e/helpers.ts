import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import AxeBuilder from '@axe-core/playwright'
import { detect } from '@omsett/detect'
import { registry } from '@omsett/registry'
import { expect, type Page } from '@playwright/test'

export const FIXTURE = fileURLToPath(new URL('../fixtures/png/sample.png', import.meta.url))

/** Records everything the page asks the network for, and every CSP complaint. */
export async function watch(page: Page) {
  const requests: Array<{ url: string; method: string; hasBody: boolean }> = []
  const violations: string[] = []
  const responses: Array<{ url: string; csp: string }> = []
  page.on('response', (response) => {
    responses.push({ url: response.url(), csp: response.headers()['content-security-policy'] ?? '' })
  })
  page.on('request', (request) => {
    requests.push({ url: request.url(), method: request.method(), hasBody: request.postData() !== null })
  })
  page.on('console', (message) => {
    if (/content security policy|content-security-policy/i.test(message.text())) violations.push(message.text())
  })
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => {
      console.error(`Content Security Policy violation: ${event.violatedDirective} ${event.blockedURI}`)
    })
  })
  return { requests, violations, responses }
}

/** Nothing leaves the origin: no request elsewhere, no request with a body, no CSP violation. */
export function expectPrivate(page: Page, seen: Awaited<ReturnType<typeof watch>>) {
  const origin = new URL(page.url()).origin
  const elsewhere = seen.requests.filter((r) => /^https?:/.test(r.url) && new URL(r.url).origin !== origin)
  expect(elsewhere, 'requests to another origin').toEqual([])
  expect(
    seen.requests.filter((r) => r.hasBody),
    'requests carrying a body',
  ).toEqual([])
  expect(seen.violations, 'CSP violations').toEqual([])
}

export async function open(page: Page, path = '/') {
  await page.goto(path)
  // The picker is live once the engine worker has answered its availability probe.
  await expect(page.getByRole('radiogroup')).toBeVisible()
  await expect(page.getByTestId('sample')).toHaveText(/Try a sample \w+/)
}

/** Read a finished download and describe it from its bytes alone. */
export async function describeDownload(page: Page, click: () => Promise<void>) {
  const [download] = await Promise.all([page.waitForEvent('download'), click()])
  const path = await download.path()
  const bytes = await readFile(path)
  // Markdown, Fountain and plain text are known by name alone, so for those the name is given.
  const name = download.suggestedFilename()
  const found = await detect(new Blob([bytes]), registry.formats, /\.(?:md|fountain|txt)$/.test(name) ? name : undefined)
  return { name, bytes, found }
}

export async function describeFixture() {
  const bytes = await readFile(FIXTURE)
  return { bytes, found: await detect(new Blob([bytes]), registry.formats) }
}

export async function expectNoSeriousViolations(page: Page, label: string) {
  const { violations } = await new AxeBuilder({ page }).analyze()
  const serious = violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)
  expect(serious, `axe, ${label}`).toEqual([])
}
