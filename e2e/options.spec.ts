// The Convert button once there is something to convert, and the choices a table offers.
import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'
import { FIXTURE, open } from './helpers'

const fixture = (path: string) => fileURLToPath(new URL(`../fixtures/${path}`, import.meta.url))
const after = (page: Page) => page.locator('[data-testid="text-compare"][data-ready="true"] [data-side="after"] [data-testid="text-contents"]')

test('the Convert button says what it will do and stays in sight once a format is chosen', async ({ page }) => {
  // A short window, so the list of formats is longer than what can be seen at once.
  await page.setViewportSize({ width: 1100, height: 520 })
  await open(page)
  const convert = page.getByTestId('convert')
  await expect(convert).toHaveText('Convert')
  await expect(page.getByTestId('convert-summary')).toHaveCount(0)

  await page.locator('#file-input').setInputFiles(FIXTURE)
  // Chosen from the top of the list, with the button far below it.
  const target = page.locator('[role="radio"][data-format="webp"]')
  await target.scrollIntoViewIfNeeded()
  await target.click()
  await expect(convert).toHaveText('Convert to WebP')
  await expect(page.getByTestId('convert-summary')).toHaveText('sample.png → WebP')
  await expect(convert).toBeInViewport({ ratio: 1 })
  // Still there with the top of the list in view.
  await page.locator('#pick-heading').scrollIntoViewIfNeeded()
  await expect(convert).toBeInViewport({ ratio: 1 })

  await convert.click()
  await expect(page.locator('.file-card[data-status="done"]')).toHaveCount(1, { timeout: 20_000 })
})

test('several files are counted on the button\'s line', async ({ page }) => {
  await open(page)
  await page.locator('#file-input').setInputFiles([fixture('csv/sample.csv'), fixture('yaml/sample.yaml')])
  await expect(page.locator('.file-card')).toHaveCount(2)
  await page.locator('[role="radio"][data-format="json"]').click()
  await expect(page.getByTestId('convert-summary')).toHaveText('2 files → JSON')
})

test('a table offers its two choices, and only a table does', async ({ page }) => {
  await open(page)
  await page.locator('#file-input').setInputFiles(FIXTURE)
  await page.locator('[role="radio"][data-format="webp"]').click()
  await expect(page.getByTestId('header-row')).toHaveCount(0)
  await page.locator('.file-card').getByRole('button', { name: /Remove/ }).click()

  await page.locator('#file-input').setInputFiles(fixture('yaml/sample.yaml'))
  await page.locator('[role="radio"][data-format="json"]').click()
  await expect(page.getByTestId('header-row')).toHaveCount(0)
  await page.locator('.file-card').getByRole('button', { name: /Remove/ }).click()

  await page.locator('#file-input').setInputFiles(fixture('xlsx/sample.xlsx'))
  await page.locator('[role="radio"][data-format="json"]').click()
  await expect(page.getByTestId('header-row')).toBeChecked()
  await expect(page.getByTestId('shape')).toHaveValue('records')
  // A table to a table has one shape, so only the first choice is offered.
  await page.locator('[role="radio"][data-format="csv"]').click()
  await expect(page.getByTestId('header-row')).toBeChecked()
  await expect(page.getByTestId('shape')).toHaveCount(0)
})

test('a workbook with no row of names keeps every row, and the result can be reshaped', async ({ page }) => {
  await open(page)
  await page.locator('#file-input').setInputFiles(fixture('xlsx/sample.xlsx'))
  await page.locator('[role="radio"][data-format="json"]').click()
  await page.getByTestId('convert').click()
  await expect(after(page)).toContainText('"name": "Ada Lovelace"')

  // Changing a choice converts again. With no row of names, the first row is data like the rest.
  await page.getByTestId('header-row').uncheck()
  await expect(after(page)).toContainText('"column_A": "id"')
  await expect(after(page)).toContainText('"column_B": "Ada Lovelace"')

  await page.getByTestId('shape').selectOption('rows')
  await expect(after(page)).not.toContainText('column_A')
  await expect(after(page)).toContainText(/^\[\s+\[\s+"id",\s+"name",/)

  // With the names back, columns: each name once, with its values together.
  await page.getByTestId('header-row').check()
  await page.getByTestId('shape').selectOption('columns')
  await expect(after(page)).toContainText(/"name": \[\s+"Ada Lovelace",\s+"Grace Hopper",/)
})
