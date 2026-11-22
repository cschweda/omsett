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
  avif: 'avif/sample.avif',
  jxl: 'jxl/sample.jxl',
  heic: 'heic/sample.heic',
  svg: 'svg/sample.svg',
  bmp: 'bmp/sample.bmp',
  qoi: 'qoi/sample.qoi',
  psd: 'psd/sample.psd',
  ico: 'ico/sample.ico',
  jp2: 'jp2/sample.jp2',
  tga: 'tga/sample.tga',
  pnm: 'pnm/sample.ppm',
  pcx: 'pcx/sample.pcx',
  sgi: 'sgi/sample.sgi',
  ras: 'ras/sample.ras',
  hdr: 'hdr/sample.hdr',
  exr: 'exr/sample.exr',
  svgz: 'svgz/sample.svgz',
}
const path = (id: string) => fileURLToPath(new URL(`../fixtures/${samples[id]}`, import.meta.url))

test('there is a sample for every format that can be read', () => {
  const readable = new Set(registry.capabilities.flatMap((c) => c.reads))
  // A format that is switched off is not in the registry, and needs no sample while it is.
  const expected = Object.keys(samples).filter((id) => formatById(registry, id))
  expect([...readable].sort()).toEqual(expected.sort())
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

test('a HEIC photograph becomes a JPEG in two steps: decoded to PNG, then encoded', async ({ page }) => {
  test.skip(!formatById(registry, 'heic'), 'HEIC is switched off')
  await open(page)
  await page.locator('#file-input').setInputFiles(path('heic'))
  await expect(page.locator('.file-card')).toContainText('HEIC')
  await expect(page.locator('.file-card')).toContainText('320 × 200')
  // Nothing is written as HEIC, and the picker says so.
  await page.locator('[role="radio"][data-format="jpeg"]').click()
  await page.getByTestId('convert').click()
  const link = page.getByTestId('download')
  await expect(link).toBeVisible({ timeout: 30_000 })
  const output = await describeDownload(page, () => link.click())
  expect(output.found).toMatchObject({ kind: 'known', dimensions: { width: 320, height: 200 } })
  expect(output.found.kind === 'known' && output.found.format.id).toBe('jpeg')
  expect(output.name).toBe('sample.jpg')
})
