// PDF to a page and to Markdown, and the line on the result that says how the structure was found.
import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'
import { describeDownload, open } from './helpers'

const fixture = (path: string) => fileURLToPath(new URL(`../fixtures/${path}`, import.meta.url))
const after = (page: Page) => page.locator('[data-testid="text-compare"][data-ready="true"] [data-side="after"] [data-testid="text-contents"]')

test('a tagged PDF says its structure was read, and becomes Markdown with that structure', async ({ page }) => {
  await open(page)
  await page.locator('#file-input').setInputFiles(fixture('pdf/sample.pdf'))
  await expect(page.locator('.file-card')).toContainText('PDF')
  await page.locator('[data-testid="convert-to"][data-target="md"]').click()
  await expect(page.locator('.file-card[data-status="done"]')).toHaveCount(1, { timeout: 30_000 })
  // Two steps, PDF to a page to Markdown: what the first found out is still told.
  await expect(page.getByTestId('result-note')).toHaveText(/^This PDF is tagged, so its headings, lists and tables were read from the PDF's own structure/)
  await expect(after(page)).toContainText('# About Omsett')
  await expect(after(page)).toContainText('- Documents and workbooks')
  await expect(after(page)).toContainText('| Format | Kind')
  const output = await describeDownload(page, () => page.getByTestId('download').click())
  expect(output.name).toBe('sample.md')
  expect(output.bytes.toString('utf8')).toContain('[omsett.com](https://omsett.com/)')
})

test('an untagged PDF says its structure was estimated', async ({ page }) => {
  await open(page)
  await page.locator('#file-input').setInputFiles(fixture('pdf/untagged.pdf'))
  await page.locator('[data-testid="convert-to"][data-target="html"]').click()
  await expect(page.locator('.file-card[data-status="done"]')).toHaveCount(1, { timeout: 30_000 })
  await expect(page.getByTestId('result-note')).toHaveText(/^This PDF has no structure marked in it, so headings, lists and paragraphs were estimated/)
  await expect(after(page)).toContainText('<h1>About Omsett</h1>')
})

test('a picture has no such note', async ({ page }) => {
  await open(page)
  await page.locator('#file-input').setInputFiles(fixture('png/sample.png'))
  await page.locator('[data-testid="convert-to"][data-target="webp"]').click()
  await expect(page.getByTestId('download')).toHaveCount(1)
  await expect(page.getByTestId('result-note')).toHaveCount(0)
})
