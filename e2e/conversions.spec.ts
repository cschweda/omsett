// Every conversion the registry offers, in every browser: a real file of each format, converted
// to each other format, and the result checked from its bytes.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { detect } from '@omsett/detect'
import { deriveEdges, formatById, registry } from '@omsett/registry'
import { expect, test } from '@playwright/test'
import { describeDownload, open } from './helpers'

const samples: Record<string, string> = {
  png: 'png/sample.png',
  jpeg: 'jpeg/sample.jpg',
  webp: 'webp/sample.webp',
  gif: 'gif/sample.gif',
  tiff: 'tiff/sample.tiff',
}
const path = (id: string) => fileURLToPath(new URL(`../fixtures/${samples[id]}`, import.meta.url))

test('there is a sample for every format that can be read', () => {
  const readable = new Set(registry.capabilities.flatMap((c) => c.reads))
  expect([...readable].sort()).toEqual(Object.keys(samples).sort())
})

for (const edge of deriveEdges(registry).edges) {
  const from = formatById(registry, edge.from)!
  const to = formatById(registry, edge.to)!

  test(`${from.name} → ${to.name}`, async ({ page }) => {
    const source = await detect(new Blob([readFileSync(path(from.id))]), registry.formats)
    await open(page)
    await page.locator('#file-input').setInputFiles(path(from.id))
    await page.locator(`[role="radio"][data-format="${to.id}"]`).click()
    await page.getByTestId('convert').click()
    const link = page.getByTestId('download')
    await expect(link).toBeVisible({ timeout: 30_000 })

    const output = await describeDownload(page, () => link.click())
    expect(output.found.kind === 'known' && output.found.format.id, 'the output is the format asked for').toBe(to.id)
    expect(output.found.kind === 'known' && output.found.dimensions, 'at the size of the original').toEqual(
      source.kind === 'known' ? source.dimensions : null,
    )
    expect(output.name).toMatch(new RegExp(`\\.${to.extensions[0]}$`))
    // Only an engine the registry names for this pair may have done it.
    const engine = await page.locator('.result-card').getAttribute('data-engine')
    expect(edge.candidates.map((c) => c.engine)).toContain(engine)
  })
}
