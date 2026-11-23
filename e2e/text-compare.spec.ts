// The side-by-side view for data and subtitles: the start of the original beside the start of
// the converted file, always as text.
import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'
import { open } from './helpers'

const fixture = (path: string) => fileURLToPath(new URL(`../fixtures/${path}`, import.meta.url))

async function convert(page: Page, file: string | { name: string; mimeType: string; buffer: Buffer }, target: string) {
  await page.locator('#file-input').setInputFiles(file)
  await page.locator(`[role="radio"][data-format="${target}"]`).click()
  await page.getByTestId('convert').click()
  await expect(page.locator('.file-card[data-status="done"]')).toHaveCount(1, { timeout: 20_000 })
}

const pane = (page: Page, side: 'before' | 'after') =>
  page.locator(`[data-testid="text-compare"][data-ready="true"] [data-side="${side}"]`)

test('data: the original and the converted file are shown next to each other', async ({ page }) => {
  await open(page)
  await convert(page, fixture('csv/sample.csv'), 'json')
  await expect(pane(page, 'before').locator('.label')).toContainText('CSV')
  await expect(pane(page, 'after').locator('.label')).toContainText('JSON')
  await expect(pane(page, 'before').getByTestId('text-contents')).toContainText('1,Ada Lovelace,1815,1852')
  await expect(pane(page, 'after').getByTestId('text-contents')).toContainText('"name": "Ada Lovelace"')
  await expect(page.getByTestId('text-more')).toHaveCount(0)
  await expect(page.getByTestId('compare')).toHaveCount(0)

  // Side by side on a wide screen, one above the other on a narrow one.
  const boxes = async () => [await pane(page, 'before').boundingBox(), await pane(page, 'after').boundingBox()]
  await page.setViewportSize({ width: 1200, height: 900 })
  let [before, after] = await boxes()
  expect(Math.abs(before!.y - after!.y)).toBeLessThan(2)
  expect(after!.x).toBeGreaterThan(before!.x + before!.width - 1)
  await page.setViewportSize({ width: 420, height: 900 })
  await expect
    .poll(async () => {
      ;[before, after] = await boxes()
      return after!.y - (before!.y + before!.height)
    })
    .toBeGreaterThan(-1)
})

test('subtitles: the same view, in a fixed-width typeface', async ({ page }) => {
  await open(page)
  await convert(page, fixture('srt/sample.srt'), 'vtt')
  await expect(pane(page, 'before').getByTestId('text-contents')).toContainText('00:00:01,000 --> 00:00:04,000')
  await expect(pane(page, 'after').getByTestId('text-contents')).toContainText('WEBVTT')
  // Equal widths: a narrow letter and a wide one take the same room.
  const widths = await pane(page, 'after').getByTestId('text-contents').evaluate((pre) => {
    const measure = (text: string) => {
      const span = document.createElement('span')
      span.textContent = text
      pre.append(span)
      const width = span.getBoundingClientRect().width
      span.remove()
      return width
    }
    return [measure('iiiiiiiiii'), measure('MMMMMMMMMM')]
  })
  expect(Math.abs(widths[0]! - widths[1]!)).toBeLessThan(0.5)
})

test('a picture gets the picture comparison, not this one', async ({ page }) => {
  await open(page)
  await convert(page, fixture('png/sample.png'), 'webp')
  await expect(page.getByTestId('compare')).toBeVisible()
  await expect(page.getByTestId('text-compare')).toHaveCount(0)
})

test('markup in a file is shown as text and never run', async ({ page }) => {
  const problems: string[] = []
  page.on('dialog', (dialog) => {
    problems.push(`a dialog opened: ${dialog.message()}`)
    void dialog.dismiss()
  })
  page.on('pageerror', (error) => problems.push(error.message))
  await open(page)
  const hostile = '<img src=x onerror=alert(1)><script>alert(2)</script><style>*{display:none}</style>'
  const buffer = Buffer.from(JSON.stringify({ note: hostile, link: '</pre><h1 id="escaped">out</h1>' }))
  await convert(page, { name: 'hostile.json', mimeType: 'application/json', buffer }, 'yaml')
  for (const side of ['before', 'after'] as const) {
    const contents = pane(page, side).getByTestId('text-contents')
    await expect(contents).toContainText('<img src=x onerror=alert(1)>')
    await expect(contents).toBeVisible()
    // The whole of it is one run of text: no element was made from anything the file said.
    expect(await contents.evaluate((pre) => pre.children.length)).toBe(0)
  }
  await expect(page.locator('#escaped')).toHaveCount(0)
  expect(problems).toEqual([])
})

test('a very large file shows only its start, and the page stays quick', async ({ page }) => {
  await open(page)
  // One line of six megabytes going in; a hundred thousand short lines coming out.
  const rows: Array<Record<string, unknown>> = [{ id: 0, text: 'x'.repeat(4 * 1024 * 1024) }]
  for (let i = 1; i <= 100_000; i++) rows.push({ id: i })
  const buffer = Buffer.from(JSON.stringify(rows))
  await convert(page, { name: 'large.json', mimeType: 'application/json', buffer }, 'yaml')
  await expect(page.locator('[data-testid="text-compare"][data-ready="true"]')).toBeVisible()
  await expect(page.getByTestId('text-more')).toHaveCount(2)
  const shown = await page.getByTestId('text-contents').evaluateAll((pres) => pres.map((pre) => pre.textContent!.length))
  for (const length of shown) expect(length).toBeLessThan(200 * 502)
  // Still answering: a click lands and the page responds.
  await page.locator('.file-card').getByRole('button', { name: /Remove/ }).click()
  await expect(page.locator('.file-card')).toHaveCount(0)
})
