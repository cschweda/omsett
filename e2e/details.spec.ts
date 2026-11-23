// "Details" on a file: what it holds beside what it shows, and what converting does with each.
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { open } from './helpers'

const fixture = (path: string) => fileURLToPath(new URL(`../fixtures/${path}`, import.meta.url))
const row = (page: import('@playwright/test').Page, label: string) => page.getByTestId('details').locator('dl > div').filter({ has: page.locator('dt', { hasText: new RegExp(`^${label}$`) }) })

test('a photograph shows when, with what and where, and that all of it is removed', async ({ page }) => {
  await open(page)
  await page.locator('#file-input').setInputFiles(fixture('_cases/with-exif.jpg'))
  await expect(page.getByTestId('details')).toHaveCount(0)
  await page.getByTestId('details-toggle').click()
  // What is known without reading the file is there at once.
  await expect(row(page, 'Kind').locator('dd')).toHaveText('JPEG')
  await expect(row(page, 'Dimensions').locator('dd')).toHaveText('320 × 168 pixels')
  // What the camera wrote, read in the worker.
  await expect(row(page, 'Taken').locator('dd')).toContainText('2026-11-23 14:29:58')
  await expect(row(page, 'Camera').locator('dd')).toContainText('Omsett Phone 9')
  await expect(row(page, 'Location').locator('dd')).toContainText('39.79819, -89.65481')
  await expect(row(page, 'Location').locator('.fate')).toHaveText('removed when converted')
  await expect(page.locator('.fate[data-fate="removed"]')).toHaveCount(8)

  await page.getByTestId('details-toggle').click()
  await expect(page.getByTestId('details')).toHaveCount(0)
})

test('a picture that carries nothing says so', async ({ page }) => {
  await open(page)
  await page.locator('#file-input').setInputFiles(fixture('png/sample.png'))
  await page.getByTestId('details-toggle').click()
  await expect(page.getByTestId('details-none')).toBeVisible()
  await expect(row(page, 'Size').locator('dd')).toContainText('bytes')
})

test('a Word document shows its author and what is in it that its author may think is gone', async ({ page }) => {
  await open(page)
  await page.locator('#file-input').setInputFiles(fixture('docx/sample.docx'))
  await page.getByTestId('details-toggle').click()
  await expect(row(page, 'Title').locator('.fate')).toHaveText('kept')
  await expect(row(page, 'Author').locator('.fate')).toHaveText('removed when converted')
  await expect(row(page, 'Tracked changes').locator('dd')).toContainText('2 changes')
  await expect(row(page, 'Comments').locator('dd')).toContainText('Yes')
  await expect(row(page, 'Hidden text').locator('dd')).toContainText('Yes')
})

test('a PDF shows what made it, its pages, and whether it is tagged', async ({ page }) => {
  await open(page)
  await page.locator('#file-input').setInputFiles(fixture('pdf/untagged.pdf'))
  await page.getByTestId('details-toggle').click()
  await expect(row(page, 'Pages').locator('dd')).toHaveText('1', { timeout: 20_000 })
  await expect(row(page, 'Tagged').locator('dd')).toContainText('No: its structure will be estimated')
})

test('details are text, never markup, whatever a file says about itself', async ({ page }) => {
  const problems: string[] = []
  page.on('dialog', (dialog) => {
    problems.push(dialog.message())
    void dialog.dismiss()
  })
  await open(page)
  // The code trap for fonts carries its payload in the font's name.
  await page.locator('#file-input').setInputFiles(fixture('_traps/code.fountain'))
  await page.getByTestId('details-toggle').click()
  await expect(row(page, 'Title').locator('dd')).toContainText('<script>')
  expect(await page.getByTestId('details').locator('script, img, iframe, svg').count()).toBe(0)
  expect(problems).toEqual([])
})
