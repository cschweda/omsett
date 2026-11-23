// The Trust page's account of trap files, and the About page's opening.
import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'

const traps = JSON.parse(readFileSync(new URL('../fixtures/_traps/manifest.json', import.meta.url), 'utf8')) as Array<{ file: string; why: string }>

test('Trust says what a trap file is, and lists every one, each leading to what it is', async ({ page }) => {
  await page.goto('/trust')
  const definition = page.getByTestId('trust-trap-definition')
  await expect(definition).toContainText('A trap file is a file made on purpose to be wrong in one particular way')
  for (const heading of ['What they are made to do', 'What must happen to each', 'Every trap file']) await expect(definition.getByRole('heading', { name: heading })).toBeVisible()
  // Every file in the list the tests read is here, and no other.
  const listed = await page.getByTestId('trust-trap').allTextContents()
  expect(listed.map((name) => name.trim()).sort()).toEqual(traps.map((trap) => trap.file).sort())

  // One of them, followed: it arrives at that file's own entry.
  const chosen = traps.find((trap) => trap.file === 'hidden-every-other-way.docx')!
  // Its kind is folded shut until it is opened.
  const kind = page.locator('details.kind', { has: page.locator('a', { hasText: chosen.file }) })
  await expect(kind.locator('a', { hasText: chosen.file })).toBeHidden()
  await kind.locator('summary').click()
  await kind.locator('a', { hasText: chosen.file }).click()
  await expect(page).toHaveURL(/\/traps#trap-hidden-every-other-way\.docx$/)
  const row = page.locator('tr.arrived')
  await expect(row).toContainText(chosen.why)
  await expect(row).toBeInViewport()
  // And from there the file itself can be had.
  await expect(row.getByRole('link', { name: chosen.file })).toHaveAttribute('href', /github\.com\/cschweda\/omsett\/blob\/main\/fixtures\/_traps\/hidden-every-other-way\.docx$/)
})

test('a trap file with marks in its name is still reached by its link', async ({ page }) => {
  const odd = traps.find((trap) => /[^a-z0-9.-]/i.test(trap.file))
  test.skip(!odd, 'no trap has such a name')
  await page.goto(`/traps#trap-${encodeURIComponent(odd!.file)}`)
  await expect(page.locator('tr.arrived')).toContainText(odd!.why)
})

test('About opens with what the name means', async ({ page }) => {
  await page.goto('/about')
  await expect(page.getByRole('heading', { level: 2 }).first()).toHaveText('The name')
  await expect(page.getByTestId('definition')).toContainText('To translate')
})
