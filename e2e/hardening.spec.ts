// Limits and clean-up that keep a hostile file, name, or link from tying the app up or
// leaving something misleading behind. Found and fixed in the red/blue audit of 2026-11-22.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { FIXTURE, open } from './helpers'

const TINY = readFileSync(fileURLToPath(new URL('../fixtures/_cases/tiny-1x1.png', import.meta.url)))

// Settings in the address bar are honored on localhost only, so the tests that rely on one
// cannot run against a public address. That they are ignored there is itself the fix for OMS-010.
const remote = Boolean(process.env.BASE_URL) && !/\/\/(?:localhost|127\.0\.0\.1)[:/]/.test(`${process.env.BASE_URL}/`)

test('a conversion that runs past its time limit is stopped, and the page carries on', async ({ page }) => {
  test.skip(remote, 'a public address ignores ?timeout')
  // ?timeout shortens the limit to one millisecond; it is honored on localhost only.
  await open(page, '/?timeout=1')
  await page.locator('#file-input').setInputFiles(FIXTURE)
  await page.getByRole('radio', { name: /WebP/ }).click()
  await page.getByTestId('convert').click()
  const card = page.locator('.file-card')
  await expect(card).toHaveAttribute('data-status', 'error', { timeout: 15_000 })
  await expect(card.getByTestId('file-note')).toHaveText('Stopped: this file took too long to convert')
  await expect(page.getByTestId('download')).toHaveCount(0)
  // Not stuck: the button is usable again and the file can be removed.
  await expect(page.getByTestId('convert')).toBeEnabled()
  await card.getByRole('button', { name: /Remove/ }).click()
  await expect(card).toHaveCount(0)
})

test('a link cannot force a nonexistent engine', async ({ page }) => {
  await open(page, '/?engine=does-not-exist')
  await page.locator('#file-input').setInputFiles(FIXTURE)
  await page.getByRole('radio', { name: /WebP/ }).click()
  await page.getByTestId('convert').click()
  await expect(page.getByTestId('download')).toBeVisible()
})

const names: Array<[given: string, offered: string, why: string]> = [
  ['invoice‮gnp.exe.png', 'invoicegnp.exe.webp', 'a right-to-left override that makes a name read backwards'],
  ['../../etc/passwd.png', 'passwd.webp', 'folders'],
  ['..\\..\\windows\\system.png', 'system.webp', 'Windows folders'],
  [`${'a'.repeat(3000)}.png`, `${'a'.repeat(120)}.webp`, 'an absurd length'],
  ['tab\there\nnewline.png', 'tab here newline.webp', 'control characters'],
  ['.hidden.png', 'hidden.webp', 'a leading dot'],
]
for (const [given, offered, why] of names) {
  test(`the download name is cleaned of ${why}`, async ({ page }) => {
    const dialogs: string[] = []
    page.on('dialog', (dialog) => {
      dialogs.push(dialog.message())
      void dialog.dismiss()
    })
    await open(page)
    await page.locator('#file-input').setInputFiles({ name: given, mimeType: 'image/png', buffer: readFileSync(FIXTURE) })
    await page.getByRole('radio', { name: /WebP/ }).click()
    await page.getByTestId('convert').click()
    await expect(page.getByTestId('download')).toHaveAttribute('download', offered)
    await expect(page.locator('.result-card .name')).toHaveText(offered)
    expect(dialogs).toEqual([])
  })
}

test('no more than a hundred files are taken at once', async ({ page }) => {
  await open(page)
  const files = Array.from({ length: 105 }, (_, i) => ({ name: `f${i}.png`, mimeType: 'image/png', buffer: TINY }))
  await page.locator('#file-input').setInputFiles(files)
  await expect(page.getByTestId('notice')).toHaveText('Only the first 100 files were added.', { timeout: 30_000 })
  await expect(page.locator('.file-card')).toHaveCount(100)
})

test('metadata is declared as removed before converting', async ({ page }) => {
  await open(page)
  await page.locator('#file-input').setInputFiles(FIXTURE)
  await expect(page.getByRole('radio', { name: /WebP/ })).toContainText('Author, location and other metadata are removed.')
})
