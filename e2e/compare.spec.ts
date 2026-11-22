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
