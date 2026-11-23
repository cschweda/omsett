// The top navigation: every link in a row where there is room, and behind one button where there is not.
import { expect, test } from '@playwright/test'

test('on a wide screen every link is in view and there is no menu button', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/about')
  const nav = page.getByRole('navigation', { name: 'Site' })
  await expect(page.getByTestId('nav-menu')).toBeHidden()
  for (const name of ['About', 'Trust', 'Technical details', 'Security', 'Settings', 'GitHub']) await expect(nav.getByRole('link', { name })).toBeVisible()
})

for (const width of [820, 390]) {
  test(`at ${width} pixels the links fold behind a Menu button, open below it, and close on arriving`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    await page.goto('/')
    const nav = page.getByRole('navigation', { name: 'Site' })
    const menu = page.getByTestId('nav-menu')
    await expect(menu).toBeVisible()
    await expect(menu).toHaveText('Menu')
    await expect(menu).toHaveAttribute('aria-expanded', 'false')
    await expect(nav.getByRole('link', { name: 'Trust' })).toBeHidden()
    // Nothing spills past the edge of the screen.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

    await menu.click()
    await expect(menu).toHaveAttribute('aria-expanded', 'true')
    await expect(menu).toHaveText('Close')
    for (const name of ['About', 'Trust', 'Technical details', 'Security', 'Settings', 'GitHub']) await expect(nav.getByRole('link', { name })).toBeVisible()
    await expect(page.getByTestId('nav-status')).toBeVisible()
    await expect(page.getByTestId('theme-toggle-top')).toBeVisible()

    await nav.getByRole('link', { name: 'Trust' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Can I trust this?')
    await expect(menu).toHaveAttribute('aria-expanded', 'false')
    await expect(nav.getByRole('link', { name: 'About' })).toBeHidden()
    // And it closes by its own button.
    await menu.click()
    await menu.click()
    await expect(nav.getByRole('link', { name: 'About' })).toBeHidden()
  })
}
