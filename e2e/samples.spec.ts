// The files the drop zone offers to try the converter with.
import { expect, test } from '@playwright/test'
import { open } from './helpers'

test('the drop zone offers a picture, a PDF and a Word document to try, each named for what it is', async ({ page }) => {
  await open(page)
  await expect(page.getByTestId('sample')).toHaveText('Try a sample PNG')
  await expect(page.getByTestId('sample-pdf')).toHaveText('Try a sample PDF')
  await expect(page.getByTestId('sample-docx')).toHaveText('Try a sample DOCX')

  await page.getByTestId('sample-pdf').click()
  await expect(page.locator('.file-card')).toHaveCount(1)
  await expect(page.locator('.file-card .format')).toHaveText('PDF')
  await page.getByTestId('sample-docx').click()
  await expect(page.locator('.file-card')).toHaveCount(2)
  await expect(page.locator('.file-card .format').nth(1)).toHaveText('DOCX')
  // Both can become a web page, and do.
  await page.getByRole('radio', { name: /HTML/ }).click()
  await page.getByTestId('convert').click()
  await expect(page.locator('.result-card')).toHaveCount(2, { timeout: 60_000 })
})
