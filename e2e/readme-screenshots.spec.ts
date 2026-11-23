// Makes the pictures in README.md, from the built site. Not part of the test run:
//
//     pnpm build && README_SCREENSHOTS=1 pnpm e2e e2e/readme-screenshots.spec.ts --project=chromium
import { fileURLToPath } from 'node:url'
import { test } from '@playwright/test'

const out = (name: string) => fileURLToPath(new URL(`../docs/screenshots/${name}.png`, import.meta.url))
const fixture = (path: string) => fileURLToPath(new URL(`../fixtures/${path}`, import.meta.url))
const CHECKER = `accessibility=${encodeURIComponent('https://audit.icjia.app')}`

test.skip(!process.env.README_SCREENSHOTS, 'made on request, with README_SCREENSHOTS=1')
test.use({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2, colorScheme: 'dark' })

test('converter', async ({ page }) => {
  await page.goto(`/?${CHECKER}`)
  await page.getByRole('radiogroup').waitFor()
  await page.getByTestId('whats-new-dismiss').click().catch(() => {})
  await page.locator('#file-input').setInputFiles(fixture('docx/sample.docx'))
  await page.getByRole('radio', { name: /Markdown/ }).click()
  await page.waitForTimeout(400)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: out('converter') })
})

test('compare', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('radiogroup').waitFor()
  await page.locator('#file-input').setInputFiles(fileURLToPath(new URL('../brand/og.png', import.meta.url)))
  await page.getByRole('radio', { name: /WebP/ }).click()
  await page.getByTestId('convert').click()
  const card = page.locator('.result-card')
  await card.waitFor()
  await page.waitForTimeout(1500)
  await card.screenshot({ path: out('compare') })
})

test('details', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('radiogroup').waitFor()
  await page.locator('#file-input').setInputFiles(fixture('docx/sample.docx'))
  await page.getByTestId('details-toggle').click()
  await page.waitForTimeout(800)
  await page.locator('.file-card').screenshot({ path: out('details') })
})

test('accessibility', async ({ page }) => {
  await page.goto(`/?${CHECKER}`)
  await page.getByRole('radiogroup').waitFor()
  await page.locator('#file-input').setInputFiles(fixture('docx/sample.docx'))
  await page.getByTestId('check-toggle').click()
  await page.waitForTimeout(300)
  await page.locator('.file-card').screenshot({ path: out('accessibility') })
})

test('trust', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 760 })
  await page.goto('/trust')
  await page.waitForTimeout(400)
  await page.screenshot({ path: out('trust') })
})
