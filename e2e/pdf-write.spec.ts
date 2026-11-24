// Writing PDF, in the page: a document becomes a tagged PDF, and nothing is fetched from anywhere else to do it.
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { describeDownload, expectPrivate, open, watch } from './helpers'

const fixture = (path: string) => fileURLToPath(new URL(`../fixtures/${path}`, import.meta.url))

async function toPdf(page: import('@playwright/test').Page, path: string) {
  await open(page)
  await page.locator('#file-input').setInputFiles(fixture(path))
  await page.locator('[role="radio"][data-format="pdf"]').click()
  await page.getByTestId('convert').click()
  const link = page.getByTestId('download')
  await expect(link).toBeVisible({ timeout: 60_000 })
  return describeDownload(page, () => link.click())
}

for (const [path, name] of [['docx/sample.docx', 'a Word document'], ['md/sample.md', 'Markdown'], ['doc/sample.doc', 'a Word document from before 2007'], ['pptx/sample.pptx', 'a presentation']] as const) {
  test(`${name} becomes a PDF that is tagged and says its title`, async ({ page }) => {
    const output = await toPdf(page, path)
    expect(output.name).toBe('sample.pdf')
    expect(output.found.kind === 'known' && output.found.format.id).toBe('pdf')
    const text = output.bytes.toString('latin1')
    expect(text.startsWith('%PDF-1.')).toBe(true)
    // The marks a screen reader goes by: a tree of what each part is, and the word that it is to be believed.
    expect(text).toContain('/StructTreeRoot')
    expect(text).toMatch(/\/MarkInfo\s*<<[^>]*\/Marked true/)
    expect(text).toMatch(/\/Lang \(/)
    // No date and no name: a PDF says nothing of when or by whom it was made.
    expect(text).not.toMatch(/\/CreationDate|\/Author/)
    await expect(page.locator('.result-card')).toHaveAttribute('data-engine', 'typst')
  })
}

test('PDF is offered among the first formats for a document, with what it keeps and what it does not', async ({ page }) => {
  await open(page)
  await page.locator('#file-input').setInputFiles(fixture('docx/sample.docx'))
  const tile = page.locator('[role="radio"][data-format="pdf"]')
  await expect(tile).toBeVisible()
  await expect(tile).not.toHaveAttribute('aria-disabled', 'true')
  await tile.click()
  await expect(page.locator('main')).toContainText('The PDF is laid out afresh, on plain pages in one typeface, and is tagged')
})

test('writing a PDF asks nothing of any other site: the typesetter and its typeface come from this one', async ({ page }) => {
  const seen = await watch(page)
  const output = await toPdf(page, 'docx/sample.docx')
  expect(output.bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-')
  expectPrivate(page, seen)
  // And it did fetch what it needs, from here: the typesetter, and the typeface in several files.
  const fetched = seen.requests.map((request) => new URL(request.url).pathname)
  expect(fetched.filter((path) => /\/engines\/typst\.[0-9a-f]+\.wasm$/.test(path))).toHaveLength(1)
  expect(fetched.filter((path) => /\/engines\/inter-.*\.woff$/.test(path)).length).toBeGreaterThan(20)
})

test('a page mostly in a script the typeface cannot draw is refused, and says what to choose instead', async ({ page }) => {
  await open(page)
  await page.locator('#file-input').setInputFiles({ name: 'report.html', mimeType: 'text/html', buffer: Buffer.from(`<h1>報告</h1><p>${'これは日本語の文書です。'.repeat(8)}</p>`) })
  await page.locator('[role="radio"][data-format="pdf"]').click()
  await page.getByTestId('convert').click()
  await expect(page.locator('.file-card')).toContainText('Much of this page is in another script')
  await expect(page.locator('.file-card')).toContainText('Choose DOCX or a web page, which keep every letter')
})
