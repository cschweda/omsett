// The information pages and the two navigations.
import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { expectPrivate, watch } from './helpers'

const traps = JSON.parse(readFileSync(new URL('../fixtures/_traps/manifest.json', import.meta.url), 'utf8')) as unknown[]

const pages = [
  { path: '/about', heading: 'About' },
  { path: '/technical', heading: 'Technical details' },
  { path: '/whats-new', heading: 'What’s new' },
  { path: '/security', heading: 'Security' },
  { path: '/status', heading: 'Status' },
]

for (const { path, heading } of pages) {
  test(`${path} opens directly, with its policy, and sends nothing elsewhere`, async ({ page }) => {
    const seen = await watch(page)
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 })).toContainText(heading)
    // Every page is its own HTML file, and every one of them carries the policy.
    const policy = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')
    expect(policy).toContain("connect-src 'self' blob:")
    expect(policy).not.toContain('unsafe-eval')
    expect(await page.evaluate(() => crossOriginIsolated)).toBe(true)
    await expect(page.getByTestId('nav-status')).toHaveText('Ready on this device')
    expectPrivate(page, seen)
  })
}

test('both navigations reach every page, the repository, and the changelog', async ({ page }) => {
  await page.goto('/')
  const top = page.getByRole('navigation', { name: 'Site' })
  const bottom = page.getByRole('navigation', { name: 'Footer' })
  for (const { path, heading } of pages.filter((p) => p.path !== '/status')) {
    await expect(top.getByRole('link', { name: heading })).toHaveAttribute('href', path)
    await expect(bottom.getByRole('link', { name: heading })).toHaveAttribute('href', path)
  }
  await expect(top.getByRole('link', { name: 'GitHub' })).toHaveAttribute('href', 'https://github.com/cschweda/omsett')
  await expect(bottom.getByRole('link', { name: 'GitHub repository' })).toHaveAttribute(
    'href',
    'https://github.com/cschweda/omsett',
  )
  await expect(bottom.getByRole('link', { name: 'Changelog' })).toHaveAttribute('href', /CHANGELOG\.md$/)

  await top.getByRole('link', { name: 'About' }).click()
  await expect(page).toHaveURL(/\/about$/)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('About')
  // Off the converter, the wordmark in the navigation leads back to it.
  await top.getByRole('link', { name: 'omsett.' }).click()
  await expect(page.getByRole('button', { name: 'Convert', exact: true })).toBeVisible()
})

test('the theme toggle in the navigation switches the theme', async ({ page }) => {
  await page.goto('/')
  const html = page.locator('html')
  const before = (await html.getAttribute('class')) ?? ''
  await page.getByTestId('theme-toggle-top').click()
  await expect(html).not.toHaveClass(before)
  await expect(html).toHaveClass(/dark|light/)
})

test('technical details counts its traps from the repository and draws its diagrams', async ({ page }) => {
  const seen = await watch(page)
  await page.goto('/technical')
  await expect(page.getByTestId('count-traps')).toHaveText(String(traps.length))
  await expect(page.getByTestId('count-formats')).toHaveText(/^\d+$/)
  // Mermaid runs under the page's policy, which allows no eval.
  const diagrams = page.getByTestId('diagram')
  await expect(diagrams).toHaveCount(3)
  for (const diagram of await diagrams.all()) {
    await expect(diagram).toHaveAttribute('data-drawn', 'true', { timeout: 20_000 })
    await expect(diagram.locator('svg')).toBeVisible()
  }
  expectPrivate(page, seen)
})

test('what’s new is the changelog', async ({ page }) => {
  const changelog = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8')
  const releases = changelog.split('\n').filter((line) => line.startsWith('## '))
  await page.goto('/whats-new')
  await expect(page.getByTestId('release')).toHaveCount(releases.length)
  await expect(page.getByRole('heading', { level: 2 }).first()).toHaveText(/Latest|Version/)
  await expect(page.getByTestId('release').first()).toContainText('Compare slider')
})

test('security lists every audit, newest open and the rest collapsed', async ({ page }) => {
  const audits = JSON.parse(readFileSync(new URL('../security/audits.json', import.meta.url), 'utf8')) as Array<{
    title: string
    findings: Array<{ id: string; title: string; severity: string }>
  }>
  await page.goto('/security')
  const sections = page.getByTestId('audit')
  await expect(sections).toHaveCount(audits.length)
  await expect(sections.first()).toHaveAttribute('open', '')
  for (let i = 1; i < audits.length; i++) await expect(sections.nth(i)).not.toHaveAttribute('open', '')

  // The open audit shows every finding with its severity, identification and mitigation.
  const latest = audits[0]!
  const shown = sections.first().getByTestId('finding')
  await expect(shown).toHaveCount(latest.findings.length)
  await expect(shown.first()).toContainText(latest.findings[0]!.id)
  await expect(shown.first()).toContainText('Identification')
  await expect(shown.first()).toContainText('Mitigation')
  await expect(shown.first().locator('.severity')).toHaveText(new RegExp(latest.findings[0]!.severity, 'i'))

  // An older audit keeps its findings out of sight until it is opened.
  const older = sections.nth(1)
  await expect(older.getByTestId('finding').first()).toBeHidden()
  await older.locator('summary').click()
  await expect(older.getByTestId('finding').first()).toBeVisible()
  await expect(page.getByTestId('count-audits')).toHaveText(String(audits.length))
})

test('status reports what this browser can do', async ({ page }) => {
  await page.goto('/status')
  await expect(page.getByTestId('readiness')).toHaveText('Ready on this device.')
  await expect(page.getByTestId('check-secure')).toHaveText('Yes')
  await expect(page.getByTestId('check-isolated')).toHaveText('Yes')
  await expect(page.getByTestId('check-engine-vips')).toHaveText('Yes')
  await expect(page.getByRole('heading', { name: 'Server' })).toBeVisible()
})

test('phone width: no page scrolls sideways', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  for (const path of ['/', ...pages.map((p) => p.path)]) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await page.waitForTimeout(path === '/technical' ? 2500 : 300)
    expect(await page.evaluate(() => document.documentElement.scrollWidth), path).toBeLessThanOrEqual(375)
  }
})
