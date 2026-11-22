// Browser engines × fixtures, in every browser. This is where the path most users get is tested:
// the Node suite can only reach engines that run in Node.
import { expect, test } from '@playwright/test'
import { describeDownload, describeFixture, FIXTURE, open } from './helpers'

async function convertFixture(page: import('@playwright/test').Page, path: string) {
  await open(page, path)
  await page.locator('#file-input').setInputFiles(FIXTURE)
  await page.getByRole('radio', { name: /WebP/ }).click()
  await page.getByTestId('convert').click()
  const link = page.getByTestId('download')
  await expect(link).toBeVisible()
  const engine = await page.locator('.result-card').getAttribute('data-engine')
  const output = await describeDownload(page, () => link.click())
  return { engine, output }
}

async function expectRealWebp(output: Awaited<ReturnType<typeof describeDownload>>) {
  const source = await describeFixture()
  expect(output.bytes.subarray(0, 4).toString('latin1')).toBe('RIFF')
  expect(output.bytes.subarray(8, 12).toString('latin1')).toBe('WEBP')
  expect(output.found.kind === 'known' && output.found.format.id).toBe('webp')
  expect(output.found.kind === 'known' && output.found.dimensions).toEqual(
    source.found.kind === 'known' ? source.found.dimensions : null,
  )
  expect(output.name).toBe('sample.webp')
}

test('PNG → WebP with whichever engine this browser gets', async ({ page, browserName }) => {
  const { engine, output } = await convertFixture(page, '/')
  await expectRealWebp(output)
  console.log(`[fixtures] ${browserName}: png → webp ran on "${engine}" (${output.bytes.length} bytes)`)
  test.info().annotations.push({ type: 'engine', description: `${browserName}: ${engine}` })
  expect(['canvas', 'vips']).toContain(engine)
})

test('PNG → WebP forced through vips', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'the forced-engine run is specified for Chromium')
  const { engine, output } = await convertFixture(page, '/?engine=vips')
  expect(engine).toBe('vips')
  await expectRealWebp(output)
  console.log(`[fixtures] ${browserName}: png → webp forced on "vips" (${output.bytes.length} bytes)`)
})
