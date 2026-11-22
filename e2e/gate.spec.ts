// The Phase 0 gate: a stranger drops a PNG, picks WebP, converts, and downloads a valid WebP,
// by keyboard alone, with nothing leaving the page's origin.
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { registry } from '@omsett/registry'
import { expect, test, type Page } from '@playwright/test'
import { describeDownload, expectNoSeriousViolations, expectPrivate, FIXTURE, open, watch } from './helpers'

// Accessibility work (audits, keyboard-order and focus checks, screen reader testing, and any
// fixes they call for) is deferred to the final phase. These tests are parked, not deleted:
// set this to false to bring them back.
const ACCESSIBILITY_DEFERRED = true

/** A short name for whatever has focus, and whether its focus indicator is drawn. */
async function focused(page: Page) {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null
    if (!el || el === document.body) return { name: 'body', visible: true }
    // The file input is visually hidden; its ring is drawn on its label.
    const shown = el.id === 'file-input' ? document.querySelector<HTMLElement>('label[for="file-input"]')! : el
    const style = getComputedStyle(shown)
    const outlined = style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) >= 2
    const ringed = style.boxShadow !== 'none'
    const name =
      el.id === 'file-input'
        ? 'choose-files'
        : el.getAttribute('role') === 'radio'
          ? 'picker'
          : (el.dataset.testid ?? el.textContent?.trim() ?? el.tagName)
    return { name, visible: outlined || ringed }
  })
}

test.describe('gate', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'WebKit skips buttons on Tab, as macOS does')

  test('PNG → WebP by keyboard, privately', async ({ page }) => {
    const seen = await watch(page)
    await open(page)
    expect(await page.evaluate(() => crossOriginIsolated)).toBe(true)
    // The page carries its policy with it, and that policy allows no eval of any kind.
    const policy = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')
    expect(policy).toContain("connect-src 'self' blob:")
    expect(policy).not.toContain('unsafe-eval')

    await page.locator('#file-input').setInputFiles(FIXTURE)
    await expect(page.locator('.file-card')).toHaveCount(1)
    await expect(page.getByTestId('announcer')).toHaveText('sample.png added, PNG.')

    // Tab to the picker, arrow to WebP, select.
    for (let i = 0; i < 40 && (await focused(page)).name !== 'picker'; i++) await page.keyboard.press('Tab')
    expect((await focused(page)).name).toBe('picker')
    const formats = await page.getByRole('radio').evaluateAll((tiles) => tiles.map((t) => (t as HTMLElement).dataset.format))
    for (let i = 0; i < formats.length; i++) {
      const current = await page.evaluate(() => (document.activeElement as HTMLElement).dataset.format)
      if (current === 'webp') break
      await page.keyboard.press('ArrowRight')
    }
    await page.keyboard.press('Enter')
    await expect(page.getByRole('radio', { name: /WebP/ })).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByTestId('announcer')).toHaveText('WebP selected.')

    await page.keyboard.press('Control+Enter')
    const link = page.getByTestId('download')
    await expect(link).toBeVisible()
    await expect(page.getByTestId('announcer')).toHaveText('1 file converted. Download ready.')

    const output = await describeDownload(page, async () => {
      await link.focus()
      await page.keyboard.press('Enter')
    })
    expect(output.bytes.subarray(0, 4).toString('latin1')).toBe('RIFF')
    expect(output.bytes.subarray(8, 12).toString('latin1')).toBe('WEBP')

    expectPrivate(page, seen)

    // Every worker script came with a policy of its own that keeps it on this origin.
    const workers = seen.responses.filter((r) => /\/workers\/|\/engines\/.*\.js$/.test(new URL(r.url).pathname))
    expect(workers.length).toBeGreaterThan(0)
    for (const worker of workers) expect(worker.csp, worker.url).toContain("connect-src 'self' blob:")
  })

  test('keyboard order and visible focus', async ({ page }) => {
    test.skip(ACCESSIBILITY_DEFERRED, 'accessibility work is deferred to the final phase')
    await open(page)
    await page.locator('#file-input').setInputFiles(FIXTURE)
    await page.getByRole('radio', { name: /WebP/ }).click()
    await page.getByTestId('convert').click()
    await expect(page.getByTestId('download')).toBeVisible()

    // Walk the whole page with Tab from the top, as a keyboard user would arrive.
    await page.locator('h1').click()
    await page.keyboard.press('Tab')
    const stops = [await focused(page)]
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('Tab')
      const stop = await focused(page)
      if (stop.name === 'body' || stop.name === stops[0]!.name) break
      stops.push(stop)
    }
    const names = stops.map((s) => s.name)
    const order = ['choose-files', 'picker', 'convert', 'download', 'theme-toggle']
    const positions = order.map((name) => names.indexOf(name))
    expect(positions.every((p) => p >= 0), `stops seen: ${names.join(' → ')}`).toBe(true)
    expect(positions, `stops seen: ${names.join(' → ')}`).toEqual([...positions].sort((a, b) => a - b))
    // The picker is one Tab stop, however many tiles it holds.
    expect(names.filter((n) => n === 'picker')).toHaveLength(1)
    expect(stops.filter((s) => !s.visible).map((s) => s.name), 'stops with no visible focus').toEqual([])

    // Arrow keys reach every tile, dimmed ones included.
    const tiles = page.getByRole('radio')
    const count = await tiles.count()
    await tiles.first().focus()
    const reached = new Set<string>()
    for (let i = 0; i < count; i++) {
      const state = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement
        return { format: el.dataset.format ?? '', outline: getComputedStyle(el).outlineStyle }
      })
      reached.add(state.format)
      expect(state.outline, `focus ring on ${state.format}`).not.toBe('none')
      await page.keyboard.press('ArrowRight')
    }
    expect(reached.size).toBe(count)
    expect(await page.locator('[role="radio"][aria-disabled="true"]').count()).toBeGreaterThan(0)
  })
})

test('the picker waits for a file, then offers what that file can become', async ({ page }) => {
  await open(page)
  // Nothing dropped: no choices yet, only what the app handles.
  await expect(page.getByTestId('picker-waiting')).toContainText('Drop a file to see what it can become.')
  // Listed by kind, in the registry's order.
  for (const category of new Set(registry.formats.map((f) => f.category))) {
    const names = registry.formats.filter((f) => f.category === category).map((f) => f.name)
    await expect(page.getByTestId('picker-waiting')).toContainText(names.join(', '))
  }
  await expect(page.getByRole('radio')).toHaveCount(0)

  await page.locator('#file-input').setInputFiles(FIXTURE)
  await expect(page.getByTestId('picker-waiting')).toHaveCount(0)
  for (const id of ['webp', 'jpeg', 'avif', 'gif', 'tiff', 'jxl']) {
    await expect(page.locator(`[role="radio"][data-format="${id}"]`)).toHaveAttribute('aria-disabled', 'false')
  }
  await expect(page.getByRole('radio', { name: /WebP/ })).toContainText('on your device')
  // What a conversion costs is said before it is chosen.
  await expect(page.locator('[data-format="jpeg"]')).toContainText('Transparency will be flattened to white.')
  await expect(page.locator('[data-format="gif"]')).toContainText('Reduced to 256 colours.')
  // The format the file already is stays listed, with the reason it is not a choice.
  await expect(page.locator('[data-format="png"]')).toHaveAttribute('aria-disabled', 'true')
  await expect(page.locator('[data-format="png"]')).toContainText('Already PNG')
})

test('a file that is not what its name says is named by its contents', async ({ page }) => {
  await open(page)
  const jpeg = await readFile(fileURLToPath(new URL('../fixtures/jpeg/sample.jpg', import.meta.url)))
  await page.locator('#file-input').setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: jpeg })
  await expect(page.locator('.file-card')).toContainText('JPEG')
  await expect(page.getByTestId('file-note')).toContainText('the contents are JPEG')
  await expect(page.getByTestId('convert')).toBeDisabled()

  await page.locator('#file-input').setInputFiles({ name: 'notes.bin', mimeType: 'application/octet-stream', buffer: Buffer.from('not an image at all') })
  await expect(page.getByTestId('file-note').last()).toHaveText('Unsupported format')
})

test('an image too large to decode is refused from its header', async ({ page }) => {
  await open(page)
  const header = Buffer.alloc(33)
  header.set([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52])
  header.writeUInt32BE(30000, 16)
  header.writeUInt32BE(30000, 20)
  header.set([8, 6, 0, 0, 0], 24)
  await page.locator('#file-input').setInputFiles({ name: 'bomb.png', mimeType: 'image/png', buffer: header })
  await expect(page.getByTestId('file-note')).toHaveText('This image is too large to convert in a browser')
  await expect(page.getByTestId('convert')).toBeDisabled()
})

for (const theme of ['dark', 'light'] as const) {
  test(`accessibility: axe, ${theme} theme, before and after converting`, async ({ page, browserName }) => {
    // Playwright's Firefox build segfaults its content process (signal 11) whenever an axe scan
    // and a conversion happen in the same page, in either order. Conversions alone and scans
    // alone are fine there, and the same markup is scanned in the other two browsers.
    test.skip(ACCESSIBILITY_DEFERRED, 'accessibility work is deferred to the final phase')
    test.skip(browserName === 'firefox', 'axe + worker conversion crashes Playwright Firefox')

    await open(page)
    if (theme === 'light') {
      await page.getByTestId('theme-toggle').click()
      await expect(page.locator('html')).toHaveClass(/light/)
    }
    await expectNoSeriousViolations(page, `${theme}, loaded`)

    await page.locator('#file-input').setInputFiles(FIXTURE)
    await page.getByRole('radio', { name: /WebP/ }).click()
    await page.getByTestId('convert').click()
    await expect(page.getByTestId('download')).toBeVisible()
    await expectNoSeriousViolations(page, `${theme}, converted`)
  })
}

test('phone width: no horizontal scroll', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  await open(page)
  await page.locator('#file-input').setInputFiles(FIXTURE)
  await page.getByRole('radio', { name: /WebP/ }).click()
  await page.getByTestId('convert').click()
  await expect(page.getByTestId('download')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
})

test('no server: the footer says so and nothing else does', async ({ page }) => {
  const seen = await watch(page)
  await open(page)
  await expect(page.getByTestId('status')).toHaveText('Conversions run on your device.')
  expect(seen.requests.some((r) => r.url.endsWith('/config.json'))).toBe(true)
  expect(seen.requests.some((r) => r.url.includes('/api/'))).toBe(false)
})
