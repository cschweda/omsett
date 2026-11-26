// A presentation's speaker notes: left out unless the person converting asks for them.
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { open } from './helpers'

const fixture = (path: string) => fileURLToPath(new URL(`../fixtures/${path}`, import.meta.url))

for (const path of ['pptx/sample.pptx', 'ppt/sample.ppt', 'odp/sample.odp']) {
  test(`${path}: notes are offered, off, and come only when asked for, after their slide`, async ({ page }) => {
    await open(page)
    await page.locator('#file-input').setInputFiles(fixture(path))
    await page.locator('[role="radio"][data-format="md"]').click()
    const notes = page.getByTestId('speaker-notes')
    await expect(notes).not.toBeChecked()

    await page.getByTestId('convert').click()
    const results = page.locator('.result-card')
    await expect(results).toHaveCount(1, { timeout: 30_000 })
    const [first] = await Promise.all([page.waitForEvent('download'), results.getByTestId('download').click()])
    expect(await readFile(await first.path(), 'utf8')).not.toContain('SECRET-SPEAKER-NOTES')

    // Asked for, the notes follow their slide; a hidden slide is never included, notes and all.
    await notes.check()
    await expect(results.getByTestId('download')).toBeVisible({ timeout: 30_000 })
    await expect(async () => {
      const [again] = await Promise.all([page.waitForEvent('download'), results.getByTestId('download').click()])
      const text = await readFile(await again.path(), 'utf8')
      expect(text).toContain('### Speaker notes')
      expect(text).toContain('SECRET-SPEAKER-NOTES')
      expect(text).not.toContain('SECRET-HIDDEN-SLIDE')
    }).toPass({ timeout: 30_000 })
  })
}

test('a document that is not a presentation offers no such choice', async ({ page }) => {
  await open(page)
  await page.locator('#file-input').setInputFiles(fixture('docx/sample.docx'))
  await page.locator('[role="radio"][data-format="md"]').click()
  await expect(page.getByTestId('speaker-notes')).toHaveCount(0)
})
