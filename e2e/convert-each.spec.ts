// A Convert button on every format a file can become, so that one file can be converted to
// several; and the reason an unavailable format is unavailable, on hover and on a press.
import { expect, test } from '@playwright/test'
import { FIXTURE, open } from './helpers'

test('each available format has its own Convert button, and results for several formats sit together', async ({ page }) => {
  await open(page)
  await expect(page.getByTestId('convert-to')).toHaveCount(0)
  await page.locator('#file-input').setInputFiles(FIXTURE)

  // One for every format with a way to it, none for the ones without.
  await expect(page.locator('[role="radio"][data-format="webp"]')).toBeVisible()
  const available = await page.locator('[role="radio"]:not([aria-disabled="true"])').count()
  expect(available).toBeGreaterThan(5)
  await expect(page.getByTestId('convert-to')).toHaveCount(available)
  await expect(page.locator('[data-testid="convert-to"][data-target="png"]')).toHaveCount(0)

  // One press converts, with no need to choose first.
  await page.locator('[data-testid="convert-to"][data-target="webp"]').click()
  await expect(page.getByTestId('download')).toHaveCount(1)
  await expect(page.locator('[role="radio"][data-format="webp"]')).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByTestId('download')).toHaveAttribute('download', 'sample.webp')

  // A second format adds its result beside the first.
  await page.locator('[data-testid="convert-to"][data-target="jpeg"]').click()
  await expect(page.getByTestId('download')).toHaveCount(2)
  await expect(page.getByTestId('download').nth(0)).toHaveAttribute('download', 'sample.webp')
  await expect(page.getByTestId('download').nth(1)).toHaveAttribute('download', 'sample.jpg')
  await expect(page.getByTestId('download-all')).toHaveText('Download all 2 as a ZIP')

  // The same format again replaces its own result and leaves the other alone.
  await page.locator('[data-testid="convert-to"][data-target="webp"]').click()
  await expect(page.locator('.file-card[data-status="done"]')).toHaveCount(1)
  await expect(page.getByTestId('download')).toHaveCount(2)
  await expect(page.getByTestId('download').nth(0)).toHaveAttribute('download', 'sample.webp')

  // A format from the list below the tiles works the same way.
  await page.locator('[data-testid="convert-to"][data-target="bmp"]').click()
  await expect(page.getByTestId('download')).toHaveCount(3, { timeout: 30_000 })

  // Removing the file takes its results with it.
  await page.locator('.file-card').getByRole('button', { name: /Remove/ }).click()
  await expect(page.getByTestId('download')).toHaveCount(0)
})

test('the buttons wait while a conversion is running', async ({ page }) => {
  await open(page, '/?slow=1500')
  await page.locator('#file-input').setInputFiles(FIXTURE)
  await page.locator('[data-testid="convert-to"][data-target="webp"]').click()
  await expect(page.locator('[data-testid="convert-to"][data-target="jpeg"]')).toBeDisabled()
  await expect(page.getByTestId('download')).toHaveCount(1, { timeout: 20_000 })
  await expect(page.locator('[data-testid="convert-to"][data-target="jpeg"]')).toBeEnabled()
})

test('a format that is not available says why, on hover and when pressed', async ({ page }) => {
  await open(page)
  await page.locator('#file-input').setInputFiles(FIXTURE)
  const heic = page.locator('[role="radio"][data-format="heic"]')
  await expect(heic).toHaveAttribute('aria-disabled', 'true')

  // Hovered, as with a mouse: the reason in a tooltip.
  await heic.scrollIntoViewIfNeeded()
  await heic.hover()
  await expect(page.getByRole('tooltip')).toContainText('HEIC can be read but not written')

  // Pressed, as on a phone: the reason is written out beneath the list.
  await expect(page.getByTestId('why')).toHaveCount(0)
  // The test tool will not press what is marked unavailable; a finger will.
  await heic.click({ force: true })
  await expect(page.getByTestId('why')).toHaveText('HEIC can be read but not written.')
  // Nothing was chosen by it.
  await expect(heic).toHaveAttribute('aria-checked', 'false')
  await expect(page.getByTestId('convert')).toBeDisabled()
})

test('the tooltip sits above with room, below without, stands out from the page, and wraps', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 700 })
  await open(page)
  await page.locator('#file-input').setInputFiles(FIXTURE)
  const heic = page.locator('[role="radio"][data-format="heic"]')
  const tip = page.getByRole('tooltip').locator('xpath=ancestor-or-self::*[contains(@class,"tile-tip")]').first()

  // In the middle of the window there is room above, and that is where it goes.
  await heic.evaluate((element) => element.scrollIntoView({ block: 'center' }))
  await heic.hover()
  await expect(tip).toBeVisible()
  await expect(tip).toHaveAttribute('data-side', 'top')
  // It is placed a moment after it appears, so its place is asked for until it has one.
  const rowTop = (await heic.boundingBox())!.y
  await expect.poll(async () => ((box) => box.y + box.height)((await tip.boundingBox())!)).toBeLessThanOrEqual(rowTop + 1)
  await expect.poll(async () => (await tip.boundingBox())!.y).toBeGreaterThanOrEqual(0)
  const middle = { tip: (await tip.boundingBox())! }

  // Its ground is not the page's, and it has a line round it.
  const look = await tip.evaluate((element) => {
    const style = getComputedStyle(element)
    return { ground: style.backgroundColor, page: getComputedStyle(document.body).backgroundColor, line: style.borderTopWidth, radius: style.borderTopLeftRadius }
  })
  expect(look.ground).not.toBe(look.page)
  expect(look.line).toBe('1px')
  expect(look.radius).toBe('0px')
  // A long explanation is several short lines: narrow, and taller than one line of text.
  expect(middle.tip.width).toBeLessThanOrEqual(17 * 16 + 2)
  expect(middle.tip.height).toBeGreaterThan(60)

  // At the very top of the window there is no room above, so it goes below.
  await page.mouse.move(0, 0)
  await expect(page.getByRole('tooltip')).toHaveCount(0)
  await heic.evaluate((element) => element.scrollIntoView({ block: 'start' }))
  await heic.hover()
  await expect(tip).toBeVisible()
  await expect(tip).toHaveAttribute('data-side', 'bottom')
  const row = (await heic.boundingBox())!
  await expect.poll(async () => (await tip.boundingBox())!.y).toBeGreaterThanOrEqual(row.y + row.height - 1)
  // Whichever side it is on, all of it is on the screen.
  await expect(tip).toBeInViewport({ ratio: 1 })
})
