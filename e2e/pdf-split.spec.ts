// A PDF taken apart, by qpdf in the worker: every page as its own PDF, or a range as one.
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'
import { expectPrivate, open, watch } from './helpers'

const fixture = (path: string) => fileURLToPath(new URL(`../fixtures/${path}`, import.meta.url))

async function downloads(page: Page) {
  const cards = page.locator('.result-card')
  const out: Array<{ name: string; text: string }> = []
  for (let i = 0; i < (await cards.count()); i++) {
    const [download] = await Promise.all([page.waitForEvent('download'), cards.nth(i).getByTestId('download').click()])
    out.push({ name: download.suggestedFilename(), text: (await readFile(await download.path())).toString('latin1') })
  }
  return out
}

test('a PDF is offered to itself as "Split or take pages", and every page becomes a PDF with nothing hidden in it', async ({ page }) => {
  const seen = await watch(page)
  await open(page)
  await page.locator('#file-input').setInputFiles(fixture('pdf/full-of-things.pdf'))
  const tile = page.locator('[role="radio"][data-format="pdf"]')
  await expect(tile).toContainText('Split or take pages')
  await expect(tile).toContainText('accessibility tags')
  await tile.click()
  await expect(page.getByTestId('pdf-take-every')).toBeChecked()
  await page.getByTestId('convert').click()
  await expect(page.locator('.result-card')).toHaveCount(4, { timeout: 30_000 })
  const pages = await downloads(page)
  expect(pages.map((found) => found.name)).toEqual(['full-of-things-page-1.pdf', 'full-of-things-page-2.pdf', 'full-of-things-page-3.pdf', 'full-of-things-page-4.pdf'])
  for (const found of pages) {
    expect(found.text.startsWith('%PDF-'), found.name).toBe(true)
    expect(found.text, found.name).not.toContain('SECRET')
  }
  await expect(page.locator('.result-card').first()).toContainText('Left out:')
  // qpdf's binary is fetched once, under its hashed name, and verified; never by a name of its own.
  expect(seen.requests.filter((request) => /qpdf[^/]*\.wasm/.test(request.url)).map((request) => new URL(request.url).pathname)).toEqual([expect.stringMatching(/^\/engines\/qpdf\.[0-9a-f]{12}\.wasm$/)])
  expectPrivate(page, seen)
})

test('a range of pages, as one PDF in the order written; and a range that cannot be read is refused in words', async ({ page }) => {
  await open(page)
  await page.locator('#file-input').setInputFiles(fixture('pdf/full-of-things.pdf'))
  await page.locator('[role="radio"][data-format="pdf"]').click()
  await page.getByTestId('pdf-take-range').check()
  await page.getByTestId('pdf-take-pages').fill('4, 2-1')
  await page.getByTestId('pdf-take-pages').blur()
  await page.getByTestId('convert').click()
  await expect(page.locator('.result-card')).toHaveCount(1, { timeout: 30_000 })
  await expect(page.locator('.result-card')).toContainText('Pages 4, 2, 1 of 4, as one PDF.')
  const [taken] = await downloads(page)
  expect(taken!.name).toBe('full-of-things.pdf')

  await open(page)
  await page.locator('#file-input').setInputFiles(fixture('pdf/full-of-things.pdf'))
  await page.locator('[role="radio"][data-format="pdf"]').click()
  await page.getByTestId('pdf-take-range').check()
  await page.getByTestId('pdf-take-pages').fill('9')
  await page.getByTestId('pdf-take-pages').blur()
  await page.getByTestId('convert').click()
  await expect(page.locator('.file-card').getByTestId('file-note')).toHaveText('This PDF has 4 pages, so there is no page 9', { timeout: 30_000 })
})

test('a PDF that keeps a layer hidden is not split, and is told how to get its pages instead', async ({ page }) => {
  await open(page)
  await page.locator('#file-input').setInputFiles(fixture('pdf/three-pages.pdf'))
  await page.locator('[role="radio"][data-format="pdf"]').click()
  await page.getByTestId('convert').click()
  await expect(page.locator('.file-card').getByTestId('file-note')).toContainText('Make pictures of its pages instead', { timeout: 30_000 })
})

test('any other format is still never offered to itself', async ({ page }) => {
  await open(page)
  await page.locator('#file-input').setInputFiles(fixture('png/sample.png'))
  const tile = page.locator('[role="radio"][data-format="png"]')
  await expect(tile).toHaveAttribute('aria-disabled', 'true')
  await expect(tile).toContainText('Already PNG')
})
