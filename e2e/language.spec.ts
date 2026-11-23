// The language option: a page made from Markdown has to say what language it is in.
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { describeDownload, FIXTURE, open } from './helpers'

const MARKDOWN = fileURLToPath(new URL('../fixtures/md/sample.md', import.meta.url))

test('appears only for a conversion that writes a page, set to the browser\'s language', async ({ page }) => {
  await open(page)
  await expect(page.getByTestId('language')).toHaveCount(0)
  await page.locator('#file-input').setInputFiles(FIXTURE)
  await page.getByRole('radio', { name: /WebP/ }).click()
  await expect(page.getByTestId('language')).toHaveCount(0)
  await page.locator('.file-card').getByRole('button', { name: /Remove/ }).click()

  await page.locator('#file-input').setInputFiles(MARKDOWN)
  await expect(page.getByTestId('language')).toHaveCount(0)
  await page.locator('[role="radio"][data-format="html"]').click()
  // The test browsers say they read American English.
  await expect(page.getByTestId('language')).toHaveValue('en')
})

test('the page is marked with the language chosen, and again when it is changed', async ({ page }) => {
  await open(page)
  await page.locator('#file-input').setInputFiles(MARKDOWN)
  await page.locator('[role="radio"][data-format="html"]').click()
  await page.getByTestId('language').selectOption('fr')
  await page.getByTestId('convert').click()
  await expect(page.locator('.file-card[data-status="done"]')).toHaveCount(1)
  const french = await describeDownload(page, () => page.getByTestId('download').click())
  expect(french.bytes.toString('utf8')).toContain('<html lang="fr">')
  await expect(page.locator('[data-side="after"] [data-testid="text-contents"]')).toContainText('<html lang="fr">')

  // Changing it afterwards converts again; a language written right to left says so.
  await page.getByTestId('language').selectOption('ar')
  await expect(page.locator('[data-side="after"] [data-testid="text-contents"]')).toContainText('<html lang="ar" dir="rtl">')
  const arabic = await describeDownload(page, () => page.getByTestId('download').click())
  expect(arabic.bytes.toString('utf8')).toContain('<html lang="ar" dir="rtl">')
})

test('a browser set to another language is offered that language first', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'de-AT' })
  const page = await context.newPage()
  await open(page)
  await page.locator('#file-input').setInputFiles(MARKDOWN)
  await page.locator('[role="radio"][data-format="html"]').click()
  await expect(page.getByTestId('language')).toHaveValue('de')
  await context.close()
})
