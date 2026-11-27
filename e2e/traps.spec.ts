// Trap files in real browsers. fixtures/_traps/manifest.json says what must happen to each file;
// fixtures/traps.test.ts checks the same list against libvips in Node.
//
// Whatever a trap is, three things hold: the page survives, the file ends in a state the user
// can read, and a good file still converts afterwards.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'
import { detect } from '@omsett/detect'
import { formatById, registry, switches } from '@omsett/registry'
import { describeDownload, FIXTURE, open } from './helpers'

interface Trap {
  file: string
  why: string
  detect: string
  mismatch: boolean
  guard: 'ok' | 'refused'
  browser: 'none' | 'succeeds' | 'fails'
  note: string | null
  absent: string | null
  /** What it is converted to, where not the usual for its kind. */
  to: string | null
}

const dir = new URL('../fixtures/_traps/', import.meta.url)
const traps = JSON.parse(readFileSync(new URL('manifest.json', dir), 'utf8')) as Trap[]

/** The size the trap file itself declares, read from its header as the app reads it. */
async function declaredSize(file: string) {
  const found = await detect(new Blob([readFileSync(new URL(file, dir))]), registry.formats, file)
  return found.kind === 'known' ? found.dimensions : null
}

async function convertGoodFile(page: Page) {
  await page.locator('#file-input').setInputFiles(FIXTURE)
  await page.getByRole('radio', { name: /WebP/ }).click()
  await page.getByTestId('convert').click()
  await expect(page.locator('.file-card[data-status="done"]')).toHaveCount(1, { timeout: 20_000 })
  await expect(page.getByTestId('download')).toBeVisible()
}

for (const trap of traps) {
  test(`${trap.file}: ${trap.why}`, async ({ page, baseURL }) => {
    const home = new URL(baseURL!).origin
    const problems: string[] = []
    page.on('crash', () => problems.push('the page crashed'))
    page.on('pageerror', (error) => problems.push(`uncaught: ${error.message}`))
    page.on('dialog', (dialog) => {
      problems.push(`a dialog opened: ${dialog.message()}`)
      void dialog.dismiss()
    })
    // No trap may make the page ask another site for anything.
    page.on('request', (request) => {
      const url = request.url()
      if (/^https?:/.test(url) && new URL(url).origin !== home) {
        problems.push(`asked another site for ${url}`)
      }
    })

    await open(page)
    await page.locator('#file-input').setInputFiles(fileURLToPath(new URL(trap.file, dir)))
    const card = page.locator('.file-card')
    await expect(card).toHaveCount(1)
    const note = card.getByTestId('file-note')
    const convert = page.getByTestId('convert')

    if (switches[trap.detect]?.on === false) {
      // Its format is switched off: named for what it is, given the reason, and not converted.
      await expect(note).toHaveText(switches[trap.detect]!.whenOff)
      await expect(convert).toBeDisabled()
    } else if (trap.detect === 'unregistered') {
      // Recognised for what it is, which is something Omsett does not convert: named, and refused.
      await expect(note).toHaveText(/^[A-Z0-9.]+ is not supported yet$/)
      await expect(card.locator('.thumb')).toHaveCount(0)
      await expect(convert).toBeDisabled()
    } else if (trap.detect === 'unknown') {
      await expect(note).toHaveText('Unsupported format')
      await expect(card.locator('.thumb')).toHaveCount(0)
      await expect(convert).toBeDisabled()
    } else if (trap.guard === 'refused') {
      await expect(note).toHaveText('This image is too large to convert in a browser')
      await expect(convert).toBeDisabled()
    } else if (trap.browser === 'none') {
      // Identified, but nothing converts from this format yet.
      if (trap.mismatch) await expect(note).toContainText('the contents are')
      for (const tile of await page.getByRole('radio').all()) {
        await expect(tile).toHaveAttribute('aria-disabled', 'true')
      }
      await expect(convert).toBeDisabled()
    } else {
      // Convert it to something it is not: WebP, or PNG if it is a WebP already; for data,
      // JSON, or YAML if it is JSON already; for subtitles, SRT, or WebVTT.
      const category = formatById(registry, trap.detect)?.category
      // for Markdown and HTML, the other of the two; for fonts, WOFF, or TTF; for archives, ZIP, or TAR.
      const [usual, otherwise] =
        category === 'data' || category === 'spreadsheet'
          ? ['json', 'yaml']
          : category === 'subtitle'
            ? ['srt', 'vtt']
            : category === 'text'
              ? ['md', 'html']
              : category === 'font'
                ? ['woff', 'ttf']
                : category === 'archive'
                  ? ['zip', 'tar']
                  : category === 'document' || category === 'presentation' || category === 'pdf'
                    ? ['html', 'md']
                    : category === 'screenplay'
                      ? ['fdx', 'fountain']
                    : category === 'audio'
                      ? ['wav', 'aiff']
                    : category === 'ebook'
                      ? ['epub', 'html']
                    : ['webp', 'png']
      const target = trap.to ?? (trap.detect === usual ? otherwise : usual)
      if (trap.mismatch) await expect(note).toContainText('the contents are')
      await page.locator(`[role="radio"][data-format="${target}"]`).click()
      await convert.click()
      await expect(card).toHaveAttribute('data-status', /^(done|error)$/, { timeout: 30_000 })
      const outcome = (await card.getAttribute('data-status')) === 'done' ? 'succeeds' : 'fails'
      expect(outcome, 'conversion').toBe(trap.browser)

      if (outcome === 'fails') {
        await expect(note).toHaveText(trap.note ?? "This file couldn't be converted")
        await expect(page.getByTestId('download')).toHaveCount(0)
      } else {
        // What comes back is really the format asked for, at the size the file declared.
        const link = page.getByTestId('download')
        const output = await describeDownload(page, () => link.click())
        expect(output.found.kind === 'known' && output.found.format.id).toBe(target)
        expect(output.found.kind === 'known' && output.found.dimensions).toEqual(await declaredSize(trap.file))
        if (trap.absent) {
          expect(output.bytes.toString('latin1').includes(trap.absent), `output carries "${trap.absent}"`).toBe(false)
        }
      }
    }

    // Nothing in the file ran: no mark set, no object changed, the page's title its own.
    const marks = await page.evaluate(() => ({
      canary: (globalThis as { __omsett_canary?: unknown }).__omsett_canary ?? null,
      polluted: ({} as { polluted?: unknown }).polluted ?? null,
      added: Object.keys(Object.prototype),
      title: document.title,
    }))
    expect(marks).toEqual({ canary: null, polluted: null, added: [], title: 'Omsett' })

    // The trap is spent. A good file must still convert on the same page.
    await card.getByRole('button', { name: /Remove/ }).click()
    await expect(card).toHaveCount(0)
    await convertGoodFile(page)
    expect(problems).toEqual([])
  })
}

test('a file name is shown as text, never run as markup', async ({ page }) => {
  const dialogs: string[] = []
  page.on('dialog', (dialog) => {
    dialogs.push(dialog.message())
    void dialog.dismiss()
  })
  await open(page)
  const name = '"><img src=x onerror=alert(1)>.png'
  await page.locator('#file-input').setInputFiles({ name, mimeType: 'image/png', buffer: readFileSync(FIXTURE) })
  await expect(page.locator('.file-card .name')).toHaveText(name)
  await expect(page.locator('.file-card img')).toHaveCount(0)
  await page.getByRole('radio', { name: /WebP/ }).click()
  await page.getByTestId('convert').click()
  // The name offered back has been made safe: nothing a file system or a reader could trip on.
  await expect(page.getByTestId('download')).toHaveAttribute('download', '___img src=x onerror=alert(1)_.webp')
  expect(dialogs).toEqual([])
})
