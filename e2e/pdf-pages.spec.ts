// A PDF's pages, drawn as pictures by pdf.js in the worker: every page, or the first, as chosen.
import { readFile } from 'node:fs/promises'
import { deflateSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'
import { detect } from '@omsett/detect'
import { registry } from '@omsett/registry'
import { expect, test, type Page } from '@playwright/test'
import { expectPrivate, open, watch } from './helpers'

const fixture = (path: string) => fileURLToPath(new URL(`../fixtures/${path}`, import.meta.url))

/** Every result's download, in order: its name and what its bytes are. */
async function downloads(page: Page) {
  const cards = page.locator('.result-card')
  const out: Array<{ name: string; bytes: Buffer; found: Awaited<ReturnType<typeof detect>> }> = []
  for (let i = 0; i < (await cards.count()); i++) {
    const [download] = await Promise.all([page.waitForEvent('download'), cards.nth(i).getByTestId('download').click()])
    const bytes = await readFile(await download.path())
    out.push({ name: download.suggestedFilename(), bytes, found: await detect(new Blob([bytes]), registry.formats) })
  }
  return out
}

/** The colour of one pixel of a picture, read by the browser from its bytes. */
async function pixel(page: Page, bytes: Buffer, x: number, y: number): Promise<number[]> {
  return page.evaluate(
    async ([base64, x, y]) => {
      const raw = Uint8Array.from(atob(base64 as string), (letter) => letter.charCodeAt(0))
      const bitmap = await createImageBitmap(new Blob([raw]))
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
      const context = canvas.getContext('2d')!
      context.drawImage(bitmap, 0, 0)
      return [...context.getImageData(x as number, y as number, 1, 1).data.slice(0, 3)]
    },
    [bytes.toString('base64'), x, y] as const,
  )
}
const near = (found: number[], want: number[]) => found.every((value, i) => Math.abs(value - want[i]!) < 24)

async function convert(page: Page, path: string, to: string) {
  await page.locator('#file-input').setInputFiles(fixture(path))
  await page.locator(`[role="radio"][data-format="${to}"]`).click()
}

test('every page becomes a picture at 150 dots to the inch, named for its page, and a hidden layer is not drawn', async ({ page }) => {
  const seen = await watch(page)
  await open(page)
  await convert(page, 'pdf/three-pages.pdf', 'png')
  await expect(page.getByTestId('pdf-pages-all')).toBeChecked()
  // What is lost is said where the format is chosen.
  await expect(page.locator('[role="radio"][data-format="png"]')).toContainText(/can no longer be selected, searched or read aloud/)
  await page.getByTestId('convert').click()
  await expect(page.locator('.result-card')).toHaveCount(3, { timeout: 30_000 })
  const pages = await downloads(page)
  expect(pages.map((found) => found.name)).toEqual(['three-pages-page-1.png', 'three-pages-page-2.png', 'three-pages-page-3.png'])
  // US Letter, A4 on its side and a square of four inches, each at 150 to the inch.
  expect(pages.map((found) => found.found.kind === 'known' && [found.found.format.id, found.found.dimensions])).toEqual([
    ['png', { width: 1275, height: 1650 }],
    ['png', { width: 1754, height: 1239 }],
    ['png', { width: 600, height: 600 }],
  ])
  // The blue block is drawn in the corner of every page, on white.
  for (const found of pages) expect(near(await pixel(page, found.bytes, 40, 40), [0, 102, 255]), found.name).toBe(true)
  // The red square in the hidden layer, at the bottom right of the second page, is not.
  expect(await pixel(page, pages[1]!.bytes, 1754 - 100, 1239 - 100)).toEqual([255, 255, 255])
  // The typeface the file names but does not carry was handed to pdf.js from this site, verified.
  expect(seen.requests.some((request) => /\/engines\/pdfjs-standard_fonts-/.test(request.url))).toBe(true)
  expectPrivate(page, seen)
})

test('the first page alone, when that is chosen, and the result says so', async ({ page }) => {
  await open(page)
  await convert(page, 'pdf/three-pages.pdf', 'jpeg')
  await page.getByTestId('pdf-pages-first').check()
  await page.getByTestId('convert').click()
  await expect(page.locator('.result-card')).toHaveCount(1, { timeout: 30_000 })
  await expect(page.locator('.result-card')).toContainText('This PDF has 3 pages. Only the first was drawn, as chosen.')
  const [only] = await downloads(page)
  expect(only!.name).toBe('three-pages.jpg')
  expect(only!.found.kind === 'known' && [only!.found.format.id, only!.found.dimensions]).toEqual(['jpeg', { width: 1275, height: 1650 }])
})

test('to any other picture by way of PNG, every page carried through', async ({ page }) => {
  await open(page)
  await convert(page, 'pdf/three-pages.pdf', 'webp')
  await page.getByTestId('convert').click()
  await expect(page.locator('.result-card')).toHaveCount(3, { timeout: 30_000 })
  const pages = await downloads(page)
  expect(pages.map((found) => found.found.kind === 'known' && found.found.format.id)).toEqual(['webp', 'webp', 'webp'])
  expect(pages.map((found) => found.name)).toEqual(['three-pages-page-1.webp', 'three-pages-page-2.webp', 'three-pages-page-3.webp'])
})

test('a PDF is never offered a drawing, and a picture is offered no page choice', async ({ page }) => {
  await open(page)
  await page.locator('#file-input').setInputFiles(fixture('pdf/sample.pdf'))
  await expect(page.locator('[role="radio"][data-format="png"]')).toHaveCount(1)
  await expect(page.locator('[role="radio"][data-format="svg"]')).toHaveCount(0)
  await page.locator('[role="radio"][data-format="md"]').click()
  await expect(page.getByTestId('pdf-pages')).toHaveCount(0)
})

/** A PDF of one page that draws a single grey picture of this many pixels a side. */
function onePicture(side: number): Buffer {
  const pixels = deflateSync(Buffer.alloc(side * side, 0x80), { level: 9 })
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << /XObject << /I 5 0 R >> >> /Contents 4 0 R >>',
  ]
  const content = 'q 200 0 0 200 0 0 cm /I Do Q'
  const parts: Buffer[] = [Buffer.from('%PDF-1.7\n')]
  const offsets: number[] = []
  const add = (body: Buffer) => {
    offsets.push(parts.reduce((sum, part) => sum + part.length, 0))
    parts.push(Buffer.from(`${offsets.length} 0 obj\n`), body, Buffer.from('\nendobj\n'))
  }
  for (const body of objects) add(Buffer.from(body))
  add(Buffer.from(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`))
  add(Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${side} /Height ${side} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length ${pixels.length} >>\nstream\n`), pixels, Buffer.from('\nendstream')]))
  const start = parts.reduce((sum, part) => sum + part.length, 0)
  const table = `xref\n0 ${offsets.length + 1}\n0000000000 65535 f \n${offsets.map((at) => `${String(at).padStart(10, '0')} 00000 n \n`).join('')}`
  parts.push(Buffer.from(`${table}trailer\n<< /Size ${offsets.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`))
  return Buffer.concat(parts)
}

test('a picture too large to draw is left out, and the result says so instead of handing back a blank page', async ({ page }) => {
  await open(page)
  await page.locator('#file-input').setInputFiles({ name: 'large-picture.pdf', mimeType: 'application/pdf', buffer: onePicture(10_001) })
  await page.locator('[role="radio"][data-format="png"]').click()
  await page.getByTestId('convert').click()
  await expect(page.locator('.result-card')).toHaveCount(1, { timeout: 30_000 })
  await expect(page.locator('.result-card')).toContainText('One picture in this PDF could not be drawn and is missing from the result')
  // A picture under the limit is drawn, and nothing is said.
  await open(page)
  await page.locator('#file-input').setInputFiles({ name: 'small-picture.pdf', mimeType: 'application/pdf', buffer: onePicture(400) })
  await page.locator('[role="radio"][data-format="png"]').click()
  await page.getByTestId('convert').click()
  await expect(page.locator('.result-card')).toHaveCount(1, { timeout: 30_000 })
  await expect(page.locator('.result-card')).not.toContainText('could not be drawn')
  const [drawn] = await downloads(page)
  expect(near(await pixel(page, drawn!.bytes, 200, 200), [128, 128, 128])).toBe(true)
})
