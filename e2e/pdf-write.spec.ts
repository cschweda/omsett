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

for (const [path, name] of [['docx/sample.docx', 'a Word document'], ['md/sample.md', 'Markdown'], ['doc/sample.doc', 'a Word document from before 2007'], ['pptx/sample.pptx', 'a presentation'], ['ppt/sample.ppt', 'a presentation from before 2007'], ['odt/sample.odt', 'an OpenDocument text']] as const) {
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

test('a page in Japanese is set in a Japanese typeface, fetched a piece at a time from this site', async ({ page }) => {
  const seen = await watch(page)
  await open(page)
  await page.locator('#file-input').setInputFiles({ name: 'report.html', mimeType: 'text/html', buffer: Buffer.from(`<html lang="ja"><h1>報告書</h1><p>${'これは日本語の文書です。'.repeat(8)}</p></html>`) })
  await page.locator('[role="radio"][data-format="pdf"]').click()
  await page.getByTestId('convert').click()
  const link = page.getByTestId('download')
  await expect(link).toBeVisible({ timeout: 60_000 })
  const output = await describeDownload(page, () => link.click())
  expect(output.bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-')
  // Nothing was left out, so nothing is said about letters.
  await expect(page.locator('.result-card')).not.toContainText('left out of the PDF')
  expectPrivate(page, seen)
  const pieces = seen.requests.map((request) => new URL(request.url).pathname).filter((path) => /\/engines\/noto-sans-/.test(path))
  // The face's list, the list of where its pieces are, and some of the pieces: far from all 250 of them.
  expect(pieces.filter((path) => /noto-sans-jp\.(?:ranges|pieces)\./.test(path))).toHaveLength(2)
  const fonts = pieces.filter((path) => path.endsWith('.woff'))
  expect(fonts.length).toBeGreaterThan(1)
  expect(fonts.length).toBeLessThan(60)
  expect(fonts.every((path) => path.includes('noto-sans-jp-'))).toBe(true)
})

test('a page mostly in a script no typeface here draws is refused, and says what to choose instead', async ({ page }) => {
  await open(page)
  await page.locator('#file-input').setInputFiles({ name: 'report.html', mimeType: 'text/html', buffer: Buffer.from(`<p>${'𓀀𓀁𓀂𓀃𓀄 '.repeat(10)}</p>`) })
  await page.locator('[role="radio"][data-format="pdf"]').click()
  await page.getByTestId('convert').click()
  await expect(page.locator('.file-card')).toContainText('Much of this page is in a script Omsett’s PDFs cannot draw yet'.replace('’', "'"))
  await expect(page.locator('.file-card')).toContainText('Choose DOCX or a web page, which keep every letter')
})

test('a photograph becomes a PDF of one page, by way of PNG, and says what such a PDF is', async ({ page }) => {
  await open(page)
  await page.locator('#file-input').setInputFiles(fixture('jpeg/sample.jpg'))
  const tile = page.locator('[role="radio"][data-format="pdf"]')
  await tile.click()
  await expect(page.locator('main')).toContainText('The PDF is one page with the picture on it. It holds no text')
  await page.getByTestId('convert').click()
  const link = page.getByTestId('download')
  await expect(link).toBeVisible({ timeout: 60_000 })
  const output = await describeDownload(page, () => link.click())
  expect(output.name).toBe('sample.pdf')
  expect(output.bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-')
  expect(output.bytes.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? ['one']).toHaveLength(1)
})

test('a PDF is not offered picture formats: the road goes one way', async ({ page }) => {
  await open(page)
  await page.locator('#file-input').setInputFiles(fixture('pdf/sample.pdf'))
  await expect(page.locator('[role="radio"][data-format="html"]')).toBeVisible()
  await expect(page.locator('[role="radio"][data-format="png"]')).toHaveCount(0)
  await expect(page.locator('[role="radio"][data-format="webp"]')).toHaveCount(0)
})

test('a workbook becomes a PDF with its table tagged, and a CSV becomes a Markdown table', async ({ page }) => {
  const pdf = await toPdf(page, 'xlsx/sample.xlsx')
  expect(pdf.name).toBe('sample.pdf')
  expect(pdf.bytes.toString('latin1')).toContain('/StructTreeRoot')

  await open(page)
  await page.locator('#file-input').setInputFiles(fixture('csv/sample.csv'))
  await page.locator('[role="radio"][data-format="md"]').click()
  await page.getByTestId('convert').click()
  const link = page.getByTestId('download')
  await expect(link).toBeVisible({ timeout: 30_000 })
  const output = await describeDownload(page, () => link.click())
  expect(output.name).toBe('sample.md')
  // A table in Markdown: a row of names, a row of dashes, the rows.
  expect(output.bytes.toString('utf8')).toMatch(/\| id \| name[^\n]*\|\n\| -{2,} \| -{2,}/)
})

test('a workbook set out as a page puts all its sheets on it, when asked', async ({ page }) => {
  await open(page)
  await page.locator('#file-input').setInputFiles(fixture('xlsx/sample.xlsx'))
  await page.locator('[role="radio"][data-format="html"]').click()
  await expect(page.getByTestId('language')).toBeVisible()
  await page.getByTestId('sheet').selectOption({ label: 'All sheets (2)' })
  await page.getByTestId('convert').click()
  const link = page.getByTestId('download')
  await expect(link).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('download')).toHaveCount(1)
  const output = await describeDownload(page, () => link.click())
  const text = output.bytes.toString('utf8')
  expect(text).toContain('<h2>People</h2>')
  expect(text).toContain('<h2>Totals</h2>')
  expect(text).not.toContain('Secret')
})
