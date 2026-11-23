import { fileURLToPath } from 'node:url'
// Settings: counting visits, appearance, and starting again.
import { expect, test } from '@playwright/test'

const SITE = 'omsett.test'

test('a copy of Omsett that is not set up to count visits counts none, and says so', async ({ page }) => {
  const reports: string[] = []
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/event') reports.push(request.postData() ?? '')
  })
  await page.goto('/settings')
  await expect(page.getByTestId('visits-state')).toHaveText('Visits are not counted on this copy of Omsett. There is nothing to turn off.')
  await expect(page.getByTestId('visits-on')).toHaveCount(0)
  await page.goto('/about')
  expect(reports).toEqual([])
})

test('where it is set up, a visit is one small report to this origin, with no script loaded and nothing about a file', async ({ page, baseURL }) => {
  const home = new URL(baseURL!).origin
  const elsewhere: string[] = []
  const reports: Array<Record<string, unknown>> = []
  const scripts = new Set<string>()
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (/^https?:/.test(request.url()) && url.origin !== home) elsewhere.push(request.url())
    if (url.pathname === '/api/event') reports.push(JSON.parse(request.postData() ?? '{}') as Record<string, unknown>)
    if (request.resourceType() === 'script') scripts.add(url.pathname)
  })
  // The test names a site, as a set-up copy's build does.
  await page.goto(`/settings?visits=${SITE}`)
  await expect(page.getByTestId('visits-state')).toHaveText('Your visits are counted.')
  await expect.poll(() => reports.length).toBe(1)
  // All that is said: a page was opened, which page (without what follows "?"), and from where.
  expect(reports[0]).toEqual({ name: 'pageview', domain: SITE, url: `${home}/settings`, referrer: null })
  // Every script the page ran is one of the app's own.
  for (const path of scripts) expect(path.startsWith('/_nuxt/'), path).toBe(true)

  await page.getByTestId('visits-off').click()
  await expect(page.getByTestId('visits-state')).toHaveText('Your visits are not counted. You turned this off.')
  // On the next page opened, nothing is reported.
  await page.goto(`/?visits=${SITE}`)
  await expect(page.getByRole('radiogroup')).toBeVisible()
  expect(reports).toHaveLength(1)

  await page.goto(`/settings?visits=${SITE}`)
  await page.getByTestId('visits-on').click()
  await expect(page.getByTestId('visits-state')).toHaveText('Your visits are counted.')
  expect(elsewhere).toEqual([])
})

test('a setting that is not a plain site name counts nothing', async ({ page }) => {
  const reports: string[] = []
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/event') reports.push(request.url())
  })
  await page.goto('/settings?visits=https://elsewhere.example/x.js')
  await expect(page.getByTestId('visits-state')).toHaveText(/^Visits are not counted on this copy/)
  await page.goto('/settings?visits=/%09/elsewhere.example/x.js')
  await expect(page.getByTestId('visits-state')).toHaveText(/^Visits are not counted on this copy/)
  expect(reports).toEqual([])
})

test('appearance is chosen here and remembered', async ({ page }) => {
  await page.goto('/settings')
  await page.getByTestId('theme-light').click()
  await expect(page.locator('html')).toHaveClass(/light/)
  await page.reload()
  await expect(page.locator('html')).toHaveClass(/light/)
  await expect(page.getByTestId('theme-light')).toHaveAttribute('aria-pressed', 'true')

  // Starting again forgets it.
  await page.getByTestId('start-again').click()
  await expect(page.getByRole('radiogroup')).toBeVisible()
  await expect(page.locator('html')).toHaveClass(/dark/)
})

test('Settings is reached from the top of every page and from the foot, marked with a small gear', async ({ page }) => {
  await page.goto('/')
  for (const id of ['nav-settings', 'footer-settings']) {
    const link = page.getByTestId(id)
    await expect(link).toHaveText('Settings')
    await expect(link.locator('svg.gear')).toBeVisible()
  }
  await page.getByTestId('footer-settings').click()
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible()
  await page.goto('/about')
  await page.getByTestId('nav-settings').click()
  await expect(page).toHaveURL(/\/settings$/)
})

test('Settings says what counting visits means, whether or not this copy counts them', async ({ page }) => {
  await page.goto('/settings')
  const facts = page.getByTestId('visits-facts')
  await expect(facts).toContainText('That a page was opened, which page, and what page linked to it.')
  await expect(facts).toContainText('A file, a file\u2019s name, what you converted')
  await expect(facts).toContainText('Cookies')
  await expect(facts).toContainText('None. Nothing is stored on your device for counting')
  await expect(facts).toContainText('None runs here.')
})

test('words asked for in Settings are put before and after the names of converted files, and remembered', async ({ page }) => {
  await page.goto('/settings')
  await expect(page.getByTestId('name-example')).toContainText('report.html')
  await page.getByTestId('name-prefix').fill('omsett-')
  await page.getByTestId('name-suffix').fill('-v2/..')
  // What a file name cannot hold is left out, and the example shows the name as it will be.
  await expect(page.getByTestId('name-example')).toContainText('omsett-report-v2.html')

  await page.goto('/')
  await expect(page.getByRole('radiogroup')).toBeVisible()
  await page.locator('#file-input').setInputFiles(fileURLToPath(new URL('../fixtures/json/sample.json', import.meta.url)))
  await page.getByRole('radio', { name: /YAML/ }).click()
  await page.getByTestId('convert').click()
  const download = page.getByTestId('download')
  await expect(download).toHaveAttribute('download', 'omsett-sample-v2.yaml', { timeout: 20_000 })

  // Kept on the device, and gone when the person says to forget.
  await page.goto('/settings')
  await expect(page.getByTestId('name-prefix')).toHaveValue('omsett-')
  await page.getByTestId('start-again').click()
  // Forgetting returns to the converter; then back to look.
  await expect(page.getByRole('radiogroup')).toBeVisible()
  await page.goto('/settings')
  await expect(page.getByTestId('name-prefix')).toHaveValue('')
})
