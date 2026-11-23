// How the formats a file can become are laid out.
import { expect, test } from '@playwright/test'

test('no format name runs past the edge of its tile, at any width', async ({ page }) => {
  const docx = new URL('../fixtures/docx/sample.docx', import.meta.url).pathname
  for (const width of [1280, 1024, 800, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')
    await expect(page.getByRole('radiogroup')).toBeVisible()
    await page.locator('#file-input').setInputFiles(docx)
    const tiles = page.locator('.tile')
    await expect(tiles.first()).toBeVisible()
    const spill = await tiles.evaluateAll((all) =>
      all
        .map((tile) => {
          const name = tile.querySelector('.name')!
          return { name: name.textContent, over: Math.round(name.getBoundingClientRect().right - tile.getBoundingClientRect().right) }
        })
        .filter((found) => found.over > 0),
    )
    expect(spill, `at ${width}px`).toEqual([])
  }
})
