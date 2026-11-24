// The quality setting and the before/after comparison.
import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'
import { open } from './helpers'

const ALPHA = fileURLToPath(new URL('../fixtures/_cases/alpha.png', import.meta.url))

const outputBytes = async (page: Page) => Number(await page.getByTestId('output-size').getAttribute('data-bytes'))

async function convert(page: Page) {
  await open(page)
  await page.locator('#file-input').setInputFiles(ALPHA)
  await page.getByRole('radio', { name: /WebP/ }).click()
  await page.getByTestId('convert').click()
  await expect(page.locator('[data-testid="compare"][data-ready="true"]')).toBeVisible({ timeout: 15_000 })
}

test('quality appears with the target, at the registry default', async ({ page }) => {
  await open(page)
  await expect(page.getByTestId('quality')).toHaveCount(0)
  await page.locator('#file-input').setInputFiles(ALPHA)
  await expect(page.getByTestId('quality')).toHaveCount(0)
  await page.getByRole('radio', { name: /WebP/ }).click()
  await expect(page.getByTestId('quality')).toHaveValue('80')
})

test('the comparison shows both pictures, unstretched, and the divider moves', async ({ page }) => {
  await convert(page)
  const shape = await page.evaluate(() => {
    const stage = document.querySelector('.stage')!.getBoundingClientRect()
    const canvases = [...document.querySelectorAll<HTMLCanvasElement>('.stage canvas')].map((canvas) => ({
      side: canvas.dataset.side,
      ratio: canvas.width / canvas.height,
      // Sample the gradient, away from the transparent disc: a drawn canvas is opaque there.
      alpha: canvas.getContext('2d')!.getImageData(Math.floor(canvas.width * 0.05), Math.floor(canvas.height * 0.05), 1, 1).data[3],
    }))
    return { stage: stage.width / stage.height, canvases }
  })
  expect(shape.canvases.map((c) => c.side).sort()).toEqual(['after', 'before'])
  for (const canvas of shape.canvases) {
    expect(canvas.alpha, `${canvas.side} is drawn`).toBe(255)
    expect(Math.abs(canvas.ratio - 800 / 500)).toBeLessThan(0.01)
  }
  expect(Math.abs(shape.stage - 800 / 500), 'the stage has the picture’s shape').toBeLessThan(0.02)

  const control = page.getByTestId('compare-control')
  await expect(control).toHaveValue('50')
  await page.locator('.stage').scrollIntoViewIfNeeded()
  const box = (await page.locator('.stage').boundingBox())!
  await page.mouse.click(box.x + box.width * 0.25, box.y + box.height / 2)
  expect(Number(await control.inputValue())).toBeLessThan(35)
  await expect(page.locator('.tag.left')).toContainText('PNG')
  await expect(page.locator('.tag.right')).toContainText('WebP')
})

test('the handle moves once when the comparison appears, then rests at the centre', async ({ browser }) => {
  // With motion allowed, the handle shows that it is a handle.
  const context = await browser.newContext({ reducedMotion: 'no-preference' })
  const page = await context.newPage()
  await open(page)
  await page.locator('#file-input').setInputFiles(ALPHA)
  await page.getByRole('radio', { name: /WebP/ }).click()
  await page.getByTestId('convert').click()
  const control = page.getByTestId('compare-control')
  await expect(page.locator('[data-testid="compare"][data-ready="true"]')).toBeVisible({ timeout: 15_000 })
  await expect.poll(async () => Number(await control.inputValue()), { timeout: 3000, intervals: [30] }).not.toBe(50)
  await expect(control).toHaveValue('50', { timeout: 5000 })
  await context.close()
})

test('scrolling zooms toward the pointer, dragging then pans, and reset returns to life size', async ({ page }) => {
  await convert(page)
  const zoom = page.getByTestId('compare-zoom')
  const control = page.getByTestId('compare-control')
  await expect(zoom).toHaveText('100%')
  await page.locator('.stage').scrollIntoViewIfNeeded()
  const box = (await page.locator('.stage').boundingBox())!

  // Scroll up over the picture: it enlarges, and the page does not scroll.
  const scrolled = await page.evaluate(() => scrollY)
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.5)
  await page.mouse.wheel(0, -300)
  await expect(zoom).not.toHaveText('100%')
  expect(await page.evaluate(() => scrollY)).toBe(scrolled)
  const transformOf = () =>
    page.locator('.stage canvas[data-side="after"]').evaluate((c) => (c as HTMLElement).style.transform)
  expect(await transformOf()).toMatch(/scale\((?!1\))/)

  // Zoomed in, dragging away from the handle moves the picture, not the divider.
  const before = { divider: await control.inputValue(), transform: await transformOf() }
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.3)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.4, { steps: 4 })
  await page.mouse.up()
  expect(await control.inputValue()).toBe(before.divider)
  expect(await transformOf()).not.toBe(before.transform)

  // The handle still moves the divider.
  const handleX = box.x + (Number(before.divider) / 100) * box.width
  await page.mouse.move(handleX, box.y + box.height * 0.5)
  await page.mouse.down()
  await page.mouse.move(handleX + box.width * 0.2, box.y + box.height * 0.5, { steps: 4 })
  await page.mouse.up()
  expect(Number(await control.inputValue())).toBeGreaterThan(Number(before.divider) + 10)

  await page.getByTestId('zoom-in').click()
  await page.getByTestId('zoom-reset').click()
  await expect(zoom).toHaveText('100%')
  expect(await transformOf()).toContain('scale(1)')
})

test('the quality slider beside the comparison changes the result as it moves', async ({ page }) => {
  await convert(page)
  const before = await outputBytes(page)
  const live = page.getByTestId('compare-quality')
  await expect(live).toHaveValue('80')
  await live.fill('15')
  await expect.poll(() => outputBytes(page), { timeout: 15_000 }).toBeLessThan(before)
  // It is the same setting as the one above the Convert button.
  await expect(page.getByTestId('quality')).toHaveValue('15')
  // The comparison was updated in place, not rebuilt.
  await expect(page.locator('[data-testid="compare"]')).toHaveCount(1)
})

test('lowering the quality converts again and the file gets smaller', async ({ page }) => {
  await convert(page)
  const before = await outputBytes(page)
  await page.getByTestId('quality').fill('20')
  await expect.poll(() => outputBytes(page), { timeout: 15_000 }).toBeLessThan(before)
  // The comparison stays where it was instead of being rebuilt.
  await expect(page.locator('[data-testid="compare"]')).toHaveCount(1)

  await page.getByTestId('quality-reset').click()
  await expect(page.getByTestId('quality')).toHaveValue('80')
  await expect.poll(() => outputBytes(page), { timeout: 15_000 }).toBe(before)
})

test('phone width: the comparison fits', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  await convert(page)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
})

test('the result is brought into view when a conversion is done, and stays put while the quality is moved', async ({ page }) => {
  await open(page)
  await page.locator('#file-input').setInputFiles(ALPHA)
  await page.getByRole('radio', { name: /WebP/ }).click()
  // The list of formats is longer than the window, so the result starts out of sight below it.
  expect(await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight * 1.5)).toBe(true)
  await page.getByTestId('convert').click()
  await expect(page.locator('[data-testid="compare"][data-ready="true"]')).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('#results-heading')).toBeInViewport()
  await expect(page.getByTestId('compare')).toBeInViewport()
  await expect(page.getByTestId('compare-title')).toHaveText('Before and after')
  // From anywhere in the list of formats, the bar at the foot of the window goes to the result.
  await page.locator('[role="radio"][data-format="webp"]').scrollIntoViewIfNeeded()
  await page.getByTestId('to-result').click()
  await expect(page.locator('#results-heading')).toBeInViewport()
  // Moving the quality beside the comparison converts again; the page does not jump for that.
  // Wait for the glide to finish: the same place twice running.
  let before = -1
  await expect.poll(async () => {
    const now = await page.evaluate(() => window.scrollY)
    const still = now === before
    before = now
    return still
  }, { intervals: [300], timeout: 10_000 }).toBe(true)
  const size = await outputBytes(page)
  await page.getByTestId('compare-quality').fill('30')
  await expect.poll(() => outputBytes(page), { timeout: 15_000 }).toBeLessThan(size)
  // A browser may nudge the page to show the control being used; it does not go back to the heading.
  expect(Math.abs((await page.evaluate(() => window.scrollY)) - before)).toBeLessThan(60)
  await expect(page.getByTestId('compare')).toBeInViewport()
})

test('the comparison is there before converting: a preview of what the result will be', async ({ page, browserName }) => {
  await open(page)
  await page.locator('#file-input').setInputFiles(ALPHA)
  await expect(page.getByTestId('preview')).toHaveCount(0)
  await page.locator('[role="radio"][data-format="jpeg"]').click()
  // Chromium and Firefox write a JPEG with what the browser has. Where a converter would
  // have to be fetched first, the page asks, and fetches nothing until told to.
  if (browserName === 'webkit' && (await page.getByTestId('preview-fetch').count())) await page.getByTestId('preview-fetch').click()
  const preview = page.locator('[data-testid="preview-compare"][data-ready="true"]')
  await expect(preview).toBeVisible({ timeout: 30_000 })
  await expect(preview.getByTestId('compare-title')).toHaveText('Preview: before and after')
  await expect(preview).toContainText('Nothing is saved until you press Convert.')
  // Nothing has been converted as far as the page is concerned: no result, nothing to download.
  await expect(page.getByTestId('download')).toHaveCount(0)
  await expect(page.locator('#results-heading')).toHaveCount(0)
  // The preview follows the quality, and says how large the result would be.
  const label = () => preview.locator('.tag.right').innerText()
  const before = await label()
  await preview.getByTestId('compare-quality').fill('10')
  await expect.poll(label, { timeout: 15_000 }).not.toBe(before)
  await expect(page.getByTestId('quality')).toHaveValue('10')
  // Converting gives the real result, with the same setting, and the preview makes way for it.
  await page.getByTestId('convert').click()
  await expect(page.locator('[data-testid="compare"][data-ready="true"]')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('preview')).toHaveCount(0)
  await expect(page.getByTestId('compare-quality')).toHaveValue('10')
})

test('a preview never fetches a converter unasked', async ({ page }) => {
  const fetched: string[] = []
  page.on('request', (request) => {
    if (/\.wasm(?:$|\?)/.test(request.url())) fetched.push(request.url())
  })
  await open(page)
  await page.locator('#file-input').setInputFiles(ALPHA)
  // AVIF is written by a converter of several megabytes, which nobody has asked for yet.
  await page.locator('[role="radio"][data-format="avif"]').click()
  await expect(page.getByTestId('preview')).toHaveAttribute('data-state', 'needs')
  await expect(page.getByTestId('preview')).toContainText('means fetching its converter first')
  await page.waitForTimeout(800)
  expect(fetched).toEqual([])
  await page.getByTestId('preview-fetch').click()
  await expect(page.locator('[data-testid="preview-compare"][data-ready="true"]')).toBeVisible({ timeout: 60_000 })
  expect(fetched.length).toBeGreaterThan(0)
})
