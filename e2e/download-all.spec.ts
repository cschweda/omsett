// Several results, downloaded together as one ZIP that Omsett itself packs.
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { describeDownload, FIXTURE, open } from './helpers'

const fixture = (path: string) => fileURLToPath(new URL(`../fixtures/${path}`, import.meta.url))

test('one result has no need of it', async ({ page }) => {
  await open(page)
  await page.locator('#file-input').setInputFiles(FIXTURE)
  await page.getByRole('radio', { name: /WebP/ }).click()
  await page.getByTestId('convert').click()
  await expect(page.getByTestId('download')).toHaveCount(1)
  await expect(page.getByTestId('download-all')).toHaveCount(0)
})

test('several results come down as one ZIP, with same-named files told apart', async ({ page }) => {
  await open(page)
  // Two of these are called "sample" and will both become "sample.json".
  await page.locator('#file-input').setInputFiles([fixture('csv/sample.csv'), fixture('yaml/sample.yaml'), fixture('toml/sample.toml')])
  await expect(page.locator('.file-card')).toHaveCount(3)
  await page.locator('[role="radio"][data-format="json"]').click()
  await page.getByTestId('convert').click()
  await expect(page.locator('.file-card[data-status="done"]')).toHaveCount(3, { timeout: 20_000 })

  const all = page.getByTestId('download-all')
  await expect(all).toHaveText('Download all 3 as a ZIP')
  const output = await describeDownload(page, () => all.click())
  expect(output.name).toBe('omsett.zip')
  expect(output.found.kind === 'known' && output.found.format.id).toBe('zip')
  // Names are stored as plain text in a ZIP, once before each file and once in the list at the end.
  const text = output.bytes.toString('latin1')
  for (const name of ['sample.json', 'sample (2).json', 'sample (3).json']) {
    expect(text.split(name).length - 1, name).toBeGreaterThanOrEqual(2)
  }
  await expect(all).toBeEnabled()

  // What Omsett packed, Omsett reads: dropped back in, it is a ZIP that converts.
  await page.getByTestId('another').click()
  await page.locator('#file-input').setInputFiles({ name: 'omsett.zip', mimeType: 'application/zip', buffer: output.bytes })
  await page.locator('[role="radio"][data-format="tar"]').click()
  await page.getByTestId('convert').click()
  await expect(page.locator('.file-card[data-status="done"]')).toHaveCount(1, { timeout: 20_000 })
})
