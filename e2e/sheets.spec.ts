// A workbook's sheets: which of them is converted is the person's choice.
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { open } from './helpers'

const fixture = (path: string) => fileURLToPath(new URL(`../fixtures/${path}`, import.meta.url))

test('a workbook offers its sheets by name, without the hidden one, and a table that has none offers no such choice', async ({ page }) => {
  await open(page)
  await page.locator('#file-input').setInputFiles(fixture('csv/sample.csv'))
  await page.getByRole('radio', { name: /JSON$|JSON\s/ }).first().click()
  await expect(page.getByTestId('header-row')).toBeVisible()
  await expect(page.getByTestId('sheet')).toHaveCount(0)

  await page.goto('/')
  await expect(page.getByRole('radiogroup')).toBeVisible()
  await page.locator('#file-input').setInputFiles(fixture('xlsx/sample.xlsx'))
  await page.getByRole('radio', { name: /CSV/ }).click()
  const sheet = page.getByTestId('sheet')
  await expect(sheet).toHaveValue('first')
  await expect(sheet.locator('option')).toHaveText(['The first sheet with anything in it', '1. People', '2. Totals', 'All sheets (2)'])
})

test('one sheet by name, and all of them as a file each', async ({ page }) => {
  await open(page)
  await page.locator('#file-input').setInputFiles(fixture('xlsx/sample.xlsx'))
  await page.getByRole('radio', { name: /CSV/ }).click()
  await page.getByTestId('sheet').selectOption({ label: '2. Totals' })
  await page.getByTestId('convert').click()
  const results = page.locator('.result-card')
  await expect(results).toHaveCount(1, { timeout: 30_000 })
  const [download] = await Promise.all([page.waitForEvent('download'), results.getByTestId('download').click()])
  expect(await readFile(await download.path(), 'utf8')).toBe('total\r\n3\r\n')

  // Choosing again converts again: all sheets, a file for each, named for its sheet.
  await page.getByTestId('sheet').selectOption('all')
  await expect(results).toHaveCount(2, { timeout: 30_000 })
  await expect(results.locator('.name')).toHaveText(['sample - People.csv', 'sample - Totals.csv'])
})

test('all sheets in one file, each under its name, where the format can hold that', async ({ page }) => {
  await open(page)
  await page.locator('#file-input').setInputFiles(fixture('xlsx/sample.xlsx'))
  await page.getByRole('radio', { name: /JSON/ }).first().click()
  await page.getByTestId('sheet').selectOption('all')
  await page.getByTestId('convert').click()
  const results = page.locator('.result-card')
  await expect(results).toHaveCount(1, { timeout: 30_000 })
  const [download] = await Promise.all([page.waitForEvent('download'), results.getByTestId('download').click()])
  const all = JSON.parse(await readFile(await download.path(), 'utf8')) as Record<string, unknown>
  expect(Object.keys(all)).toEqual(['People', 'Totals'])
})
