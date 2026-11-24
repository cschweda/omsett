// What the page shows while a conversion is going on: that it is working, and where it has got to.
// `?slow=` holds each file for a moment before it is converted, so that state can be seen.
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { FIXTURE, open } from './helpers'

const fixture = (path: string) => fileURLToPath(new URL(`../fixtures/${path}`, import.meta.url))

test('one file: its bar shows work going on, and says so', async ({ page }) => {
  await open(page, '/?slow=2500')
  await page.locator('#file-input').setInputFiles(FIXTURE)
  await expect(page.getByTestId('file-progress')).toHaveCount(0)
  await page.getByRole('radio', { name: /WebP/ }).click()
  await page.getByTestId('convert').click()

  const bar = page.getByTestId('file-progress')
  await expect(bar).toHaveClass(/active/)
  await expect(page.getByTestId('file-stage')).toHaveText(/^Converting/)
  await expect(page.getByTestId('batch-line')).toHaveText(/^Converting/)
  // The band of light on the bar is moving, unless the visitor has asked for less motion.
  const moving = await bar.evaluate((element) => getComputedStyle(element, '::after').animationName)
  const reduced = await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)
  expect(moving).toBe(reduced ? 'none' : 'bar-sweep')
  // After a couple of seconds the count of them appears, and goes on counting.
  await expect(page.getByTestId('file-stage')).toHaveText(/^Converting, \d+ s$/)

  await expect(page.locator('.file-card[data-status="done"]')).toHaveCount(1, { timeout: 20_000 })
  await expect(bar).not.toHaveClass(/active/)
  await expect(bar).toHaveAttribute('aria-valuenow', '100')
  await expect(page.getByTestId('file-stage')).toHaveCount(0)
  await expect(page.getByTestId('batch')).toHaveCount(0)
})

test('several files: each says where it stands, and the batch says which it is on', async ({ page }) => {
  await open(page, '/?slow=1200')
  await page.locator('#file-input').setInputFiles([fixture('csv/sample.csv'), fixture('yaml/sample.yaml'), fixture('toml/sample.toml')])
  await expect(page.locator('.file-card')).toHaveCount(3)
  await page.locator('[role="radio"][data-format="json"]').click()
  await page.getByTestId('convert').click()

  const stages = page.getByTestId('file-stage')
  await expect(page.getByTestId('batch-line')).toHaveText(/^Converting 1 of 3/)
  await expect(stages).toHaveText([/^Converting/, 'Waiting', 'Waiting'])
  await expect(page.getByTestId('batch-line')).toHaveText(/^Converting 2 of 3/)
  // The first is finished and says nothing more; the second is being worked on.
  await expect(stages).toHaveText([/^Converting/, 'Waiting'])
  await expect(page.locator('.file-card').nth(0)).toHaveAttribute('data-status', 'done')
  await expect(page.getByTestId('batch-line')).toHaveText(/^Converting 3 of 3/)

  await expect(page.locator('.file-card[data-status="done"]')).toHaveCount(3, { timeout: 20_000 })
  await expect(page.getByTestId('batch')).toHaveCount(0)
  await expect(page.locator('.bar.active')).toHaveCount(0)
})

test('a converter that has to be fetched first says that is what is happening', async ({ page }) => {
  await open(page)
  // Hold the converter's download back, so the moment it is being fetched can be seen.
  let release = () => {}
  const held = new Promise<void>((resolve) => (release = resolve))
  await page.route('**/engines/**', async (route) => {
    await held
    await route.continue()
  })
  await page.locator('#file-input').setInputFiles(fixture('jpeg/sample.jpg'))
  await page.getByRole('radio', { name: /^PNG/ }).click()
  await page.getByTestId('convert').click()
  await expect(page.getByTestId('file-stage')).toHaveText(/^Getting the converter \(\d.* MB, once\)/)
  await expect(page.getByTestId('file-progress')).toHaveClass(/active/)
  release()
  await expect(page.locator('.file-card[data-status="done"]')).toHaveCount(1, { timeout: 30_000 })
})
