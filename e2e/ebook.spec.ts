// E-books, in the page: a Kindle book becomes an EPUB, and a locked one is refused with the reason.
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { describeDownload, expectPrivate, open, watch } from './helpers'

const fixture = (path: string) => fileURLToPath(new URL(`../fixtures/${path}`, import.meta.url))
const row = (page: import('@playwright/test').Page, label: string) => page.getByTestId('details').locator('dl > div').filter({ has: page.locator('dt', { hasText: new RegExp(`^${label}$`) }) })

for (const [path, name] of [['azw3/sample.azw3', 'AZW3'], ['azw3/packed.azw3', 'AZW3'], ['mobi/sample.mobi', 'MOBI']] as const) {
  test(`${path} becomes an EPUB, on this device and with nothing asked of anywhere else`, async ({ page }) => {
    const seen = await watch(page)
    await open(page)
    await page.locator('#file-input').setInputFiles(fixture(path))
    await expect(page.locator('.file-card')).toContainText(name)
    await page.locator('[role="radio"][data-format="epub"]').click()
    await expect(page.locator('main')).toContainText('The pages, pictures, stylesheets, links and list of contents are kept')
    await page.getByTestId('convert').click()
    const link = page.getByTestId('download')
    await expect(link).toBeVisible({ timeout: 30_000 })
    const output = await describeDownload(page, () => link.click())
    expect(output.name).toBe(`${path.split('/')[1]!.split('.')[0]}.epub`)
    expect(output.found.kind === 'known' && output.found.format.id).toBe('epub')
    // An EPUB says what it is in its first file, stored as it is.
    expect(output.bytes.subarray(30, 58).toString('latin1')).toBe('mimetypeapplication/epub+zip')
    await expect(page.locator('.result-card')).toHaveAttribute('data-engine', 'ebook')
    expectPrivate(page, seen)
  })
}

test('a book shows its title and author, and that it is not locked, before converting', async ({ page }) => {
  await open(page)
  await page.locator('#file-input').setInputFiles(fixture('azw3/sample.azw3'))
  await page.getByTestId('details-toggle').click()
  await expect(row(page, 'Title').locator('dd')).toContainText('Sample book')
  await expect(row(page, 'Author').locator('dd')).toContainText('Omsett')
  await expect(row(page, 'Copy protection').locator('dd')).toContainText('None')
})

test('a copy-protected book is refused, with the reason, and its details say so first', async ({ page }) => {
  await open(page)
  await page.locator('#file-input').setInputFiles(fixture('_traps/copy-protected.azw3'))
  await page.getByTestId('details-toggle').click()
  await expect(row(page, 'Copy protection').locator('dd')).toContainText('Yes (DRM). Omsett does not unlock books')
  await page.locator('[role="radio"][data-format="epub"]').click()
  await page.getByTestId('convert').click()
  await expect(page.locator('.file-card')).toContainText('This book is copy-protected (DRM), and Omsett does not unlock books')
})
