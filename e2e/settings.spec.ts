// Settings: counting visits, appearance, and starting again.
import { expect, test } from '@playwright/test'

const SCRIPT = '/js/test-visits.js'

test('a copy of Omsett that is not set up to count visits counts none, and says so', async ({ page }) => {
  const asked: string[] = []
  page.on('request', (request) => asked.push(new URL(request.url()).pathname))
  await page.goto('/settings')
  await expect(page.getByTestId('visits-state')).toHaveText('Visits are not counted on this copy of Omsett. There is nothing to turn off.')
  await expect(page.getByTestId('visits-on')).toHaveCount(0)
  await expect(page.locator('[data-testid="visits-script"]')).toHaveCount(0)
  expect(asked.some((path) => path.startsWith('/js/') || path === '/api/event')).toBe(false)
})

test('where it is set up, a visit is counted through this origin and no other, and can be turned off', async ({ page, baseURL }) => {
  const home = new URL(baseURL!).origin
  const elsewhere: string[] = []
  page.on('request', (request) => {
    if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== home) elsewhere.push(request.url())
  })
  // The test names a script, as a set-up copy's build does.
  await page.goto(`/settings?visits=${SCRIPT}`)
  await expect(page.getByTestId('visits-state')).toHaveText('Your visits are counted.')
  await expect(page.locator('[data-testid="visits-script"]')).toHaveAttribute('src', SCRIPT)

  await page.getByTestId('visits-off').click()
  await expect(page.getByTestId('visits-state')).toHaveText('Your visits are not counted. You turned this off.')
  // On the next page opened, nothing is loaded for counting.
  await page.goto(`/?visits=${SCRIPT}`)
  await expect(page.getByRole('radiogroup')).toBeVisible()
  await expect(page.locator('[data-testid="visits-script"]')).toHaveCount(0)

  await page.goto(`/settings?visits=${SCRIPT}`)
  await page.getByTestId('visits-on').click()
  await expect(page.getByTestId('visits-state')).toHaveText('Your visits are counted.')
  expect(elsewhere).toEqual([])
})

test('a script named on another site is not loaded, whatever names it', async ({ page }) => {
  await page.goto('/settings?visits=https://elsewhere.example/x.js')
  await expect(page.getByTestId('visits-state')).toHaveText(/^Visits are not counted on this copy/)
  await expect(page.locator('[data-testid="visits-script"]')).toHaveCount(0)
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
