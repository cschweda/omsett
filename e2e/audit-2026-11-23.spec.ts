// What the audit of 23 November 2026 found in the page itself, each as a test.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { FIXTURE, open } from './helpers'

const fixture = (path: string) => fileURLToPath(new URL(`../fixtures/${path}`, import.meta.url))

test('OMS-117: a batch left behind by "Convert another" brings nothing into the new session', async ({ page }) => {
  await open(page, '/?slow=3000')
  const png = readFileSync(FIXTURE)
  await page.locator('#file-input').setInputFiles({ name: 'first-session.png', mimeType: 'image/png', buffer: png })
  await page.getByRole('radio', { name: /WebP/ }).click()
  await page.getByTestId('convert').click()
  await expect(page.locator('.file-card[data-status="done"]')).toHaveCount(1, { timeout: 20_000 })
  // Convert again, and leave while it is still held.
  await page.getByTestId('convert').click()
  await expect(page.getByTestId('file-stage')).toHaveText(/^Converting/)
  await page.getByTestId('another').click()
  await expect(page.locator('.file-card')).toHaveCount(0)

  await page.locator('#file-input').setInputFiles({ name: 'second-session.png', mimeType: 'image/png', buffer: png })
  await expect(page.locator('.file-card')).toHaveCount(1)
  // Long enough for the batch that was left to have finished, had it gone on.
  await page.waitForTimeout(5000)
  await expect(page.locator('.result-card')).toHaveCount(0)
  await expect(page.locator('.file-card')).toHaveCount(1)
  // And the new session converts as usual.
  await page.getByRole('radio', { name: /WebP/ }).click()
  await page.getByTestId('convert').click()
  await expect(page.locator('.result-card')).toHaveCount(1, { timeout: 20_000 })
  await expect(page.locator('.result-card')).toContainText('second-session.webp')
})

test('OMS-118: a file\'s details are read in a worker of their own, beside a conversion and not in its way', async ({ page }) => {
  const engines = () => page.workers().filter((worker) => /engine\.worker/.test(worker.url())).length
  await open(page, '/?slow=2500')
  await page.locator('#file-input').setInputFiles(fixture('json/sample.json'))
  await expect.poll(engines).toBe(1)
  await page.getByRole('radio', { name: /YAML/ }).click()
  await page.getByTestId('convert').click()
  await expect(page.getByTestId('file-stage')).toHaveText(/^Converting/)
  // Asked for while the conversion is under way.
  await page.getByTestId('details-toggle').click()
  await expect(page.getByTestId('details')).toBeVisible()
  await expect(page.getByTestId('details-reading')).toHaveCount(0)
  await expect.poll(engines).toBe(2)
  await expect(page.locator('.file-card[data-status="done"]')).toHaveCount(1, { timeout: 20_000 })
  await expect(page.locator('.result-card')).toHaveCount(1)
})

test('OMS-119: a picture that does not state its size up front is not handed to the browser to draw, and still converts', async ({ page }) => {
  await open(page)
  const sound = readFileSync(fixture('jpeg/sample.jpg'))
  // Nine blocks of padding ahead of the part of a JPEG that gives its size, so that the size is
  // further into the file than is read to identify it.
  const block = Buffer.concat([Buffer.from([0xFF, 0xE1, 0xFF, 0xFF]), Buffer.alloc(65_533)])
  const padded = Buffer.concat([sound.subarray(0, 2), ...Array.from({ length: 9 }, () => block), sound.subarray(2)])

  await page.locator('#file-input').setInputFiles([
    { name: 'plain.jpg', mimeType: 'image/jpeg', buffer: sound },
    { name: 'size-out-of-sight.jpg', mimeType: 'image/jpeg', buffer: padded },
  ])
  const cards = page.locator('.file-card')
  await expect(cards).toHaveCount(2)
  await expect(cards.nth(0).locator('canvas')).toBeVisible()
  // Time enough for a preview to have been drawn, had one been asked for.
  await page.waitForTimeout(1500)
  await expect(cards.nth(1).locator('canvas')).toBeHidden()

  await page.getByRole('radio', { name: /PNG/ }).click()
  await page.getByTestId('convert').click()
  await expect(page.locator('.file-card[data-status="done"]')).toHaveCount(2, { timeout: 30_000 })
})
