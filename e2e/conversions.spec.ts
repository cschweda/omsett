// Every conversion the registry offers, in every browser: a real file of each format, converted
// to each other format, and the result checked from its bytes.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { detect } from '@omsett/detect'
import { deriveEdges, formatById, registry, writtenSize } from '@omsett/registry'
import { expect, test } from '@playwright/test'
import { describeDownload, open } from './helpers'

const samples: Record<string, string> = {
  png: 'png/sample.png',
  apng: 'apng/sample.png',
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
  psb: 'psb/sample.psb',
  cur: 'cur/sample.cur',
  icns: 'icns/sample.icns',
  dds: 'dds/sample.dds',
  fits: 'fits/sample.fits',
  dcm: 'dcm/sample.dcm',
  dng: 'dng/sample.dng',
  jp2: 'jp2/sample.jp2',
  tga: 'tga/sample.tga',
  pnm: 'pnm/sample.ppm',
  pcx: 'pcx/sample.pcx',
  sgi: 'sgi/sample.sgi',
  ras: 'ras/sample.ras',
  hdr: 'hdr/sample.hdr',
  exr: 'exr/sample.exr',
  svgz: 'svgz/sample.svgz',
  json: 'json/sample.json',
  jsonl: 'jsonl/sample.jsonl',
  yaml: 'yaml/sample.yaml',
  toml: 'toml/sample.toml',
  xml: 'xml/sample.xml',
  csv: 'csv/sample.csv',
  tsv: 'tsv/sample.tsv',
  xlsx: 'xlsx/sample.xlsx',
  xls: 'xls/sample.xls',
  ods: 'ods/sample.ods',
  vcf: 'vcf/sample.vcf',
  ics: 'ics/sample.ics',
  srt: 'srt/sample.srt',
  vtt: 'vtt/sample.vtt',
  ass: 'ass/sample.ass',
  ssa: 'ssa/sample.ssa',
  sbv: 'sbv/sample.sbv',
  lrc: 'lrc/sample.lrc',
  ttml: 'ttml/sample.ttml',
  smi: 'smi/sample.smi',
  microdvd: 'microdvd/sample.sub',
  md: 'md/sample.md',
  html: 'html/sample.html',
  docx: 'docx/sample.docx',
  doc: 'doc/sample.doc',
  ppt: 'ppt/sample.ppt',
  odt: 'odt/sample.odt',
  odp: 'odp/sample.odp',
  rtf: 'rtf/sample.rtf',
  txt: 'txt/sample.txt',
  pptx: 'pptx/sample.pptx',
  pdf: 'pdf/sample.pdf',
  fountain: 'fountain/sample.fountain',
  fdx: 'fdx/sample.fdx',
  drafter: 'drafter/sample.drafter',
  ttf: 'ttf/sample.ttf',
  otf: 'otf/sample.otf',
  woff: 'woff/sample.woff',
  woff2: 'woff2/sample.woff2',
  zip: 'zip/sample.zip',
  mp3: 'mp3/sample.mp3',
  azw3: 'azw3/sample.azw3',
  epub: 'epub/sample.epub',
  mobi: 'mobi/sample.mobi',
  wav: 'wav/sample.wav',
  flac: 'flac/sample.flac',
  aiff: 'aiff/sample.aiff',
  au: 'au/sample.au',
  tar: 'tar/sample.tar',
  tgz: 'tgz/sample.tar.gz',
}
// A web font unwraps to TTF or to OTF, whichever its letters are drawn as. The usual samples
// hold TrueType outlines; unwrapping to OTF needs one that holds PostScript outlines.
const particular: Record<string, string> = {
  'woff>otf': 'woff/postscript.woff',
  'woff2>otf': 'woff2/postscript.woff2',
  // A calendar is made from rows that are events, which the usual samples (people) are not.
  'json>ics': 'json/events.json',
  'jsonl>ics': 'jsonl/events.jsonl',
  'yaml>ics': 'yaml/events.yaml',
  'toml>ics': 'toml/events.toml',
  'xml>ics': 'xml/events.xml',
  'csv>ics': 'csv/events.csv',
  'tsv>ics': 'tsv/events.tsv',
  'xlsx>ics': 'xlsx/events.xlsx',
  'xls>ics': 'xls/events.xls',
  'ods>ics': 'ods/events.ods',
}
const path = (id: string, to?: string) =>
  fileURLToPath(new URL(`../fixtures/${particular[`${id}>${to}`] ?? samples[id]}`, import.meta.url))

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
    const source = await detect(new Blob([readFileSync(path(from.id, to.id))]), registry.formats)
    await open(page)
    await page.locator('#file-input').setInputFiles(path(from.id, to.id))
    await page.locator(`[role="radio"][data-format="${to.id}"]`).click()
    await page.getByTestId('convert').click()
    const link = page.getByTestId('download')
    await expect(link).toBeVisible({ timeout: 30_000 })

    const output = await describeDownload(page, () => link.click())
    expect(output.found.kind === 'known' && output.found.format.id, 'the output is the format asked for').toBe(to.id)
    // An icon is the one thing written at another size, and the registry says which.
    expect(output.found.kind === 'known' && output.found.dimensions, 'at the size of the original').toEqual(
      writtenSize(edge.candidates[0]!.defaultOptions, source.kind === 'known' ? source.dimensions : null),
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

test('a photograph becomes an icon in two steps, square, and the result says what sizes it holds', async ({ page }) => {
  await open(page)
  await page.locator('#file-input').setInputFiles(path('jpeg'))
  await page.locator('[role="radio"][data-format="ico"]').click()
  await page.getByTestId('convert').click()
  const link = page.getByTestId('download')
  await expect(link).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.result-card')).toContainText('The file holds the picture at')
  const output = await describeDownload(page, () => link.click())
  expect(output.found.kind === 'known' && output.found.format.id).toBe('ico')
  // The largest picture in it is square, and no larger than the photograph was.
  const source = await detect(new Blob([readFileSync(path('jpeg'))]), registry.formats)
  const longest = source.kind === 'known' && source.dimensions ? Math.max(source.dimensions.width, source.dimensions.height) : 0
  const side = Math.min(256, longest)
  expect(output.found).toMatchObject({ dimensions: { width: side, height: side } })
  expect(output.bytes.readUInt16LE(4), 'more than one size').toBeGreaterThan(1)
  expect(output.name).toBe('sample.ico')
})
