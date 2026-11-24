// Sound, in the page: what a file says about itself, and that what is written is the same sound.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { describeDownload, open } from './helpers'

const fixture = (path: string) => fileURLToPath(new URL(`../fixtures/${path}`, import.meta.url))
const row = (page: import('@playwright/test').Page, label: string) => page.getByTestId('details').locator('dl > div').filter({ has: page.locator('dt', { hasText: new RegExp(`^${label}$`) }) })

async function convert(page: import('@playwright/test').Page, path: string, to: string) {
  await open(page)
  await page.locator('#file-input').setInputFiles(fixture(path))
  await page.locator(`[role="radio"][data-format="${to}"]`).click()
  await page.getByTestId('convert').click()
  const link = page.getByTestId('download')
  await expect(link).toBeVisible({ timeout: 30_000 })
  return describeDownload(page, () => link.click())
}

test('a WAV becomes an AIFF holding the very same numbers, each with its bytes turned round', async ({ page }) => {
  const output = await convert(page, 'wav/sample.wav', 'aiff')
  expect(output.name).toBe('sample.aiff')
  expect(output.found.kind === 'known' && output.found.format.id).toBe('aiff')
  // The sample's sound starts 44 bytes in and runs to its notes; the AIFF's starts 54 bytes in.
  const wav = readFileSync(fixture('wav/sample.wav'))
  const sound = wav.subarray(44, 44 + wav.readUInt32LE(40))
  const made = output.bytes.subarray(54)
  expect(made.length).toBe(sound.length)
  expect(Buffer.from(made).swap16().equals(sound), 'every number is the one the WAV held').toBe(true)
  // What the WAV said about itself is not in the result.
  expect(output.bytes.toString('latin1')).not.toMatch(/Test pattern|Omsett/)
  await expect(page.locator('.result-card')).toHaveAttribute('data-engine', 'audio')
})

test('a FLAC unpacks in the page to the very numbers it was packed from', async ({ page }) => {
  const output = await convert(page, 'flac/sample.flac', 'wav')
  expect(output.name).toBe('sample.wav')
  // The FLAC sample was packed from the WAV sample by the reference packer. Unpacked here, in
  // a browser, the sound is that WAV's sound, byte for byte.
  const wav = readFileSync(fixture('wav/sample.wav'))
  const sound = wav.subarray(44, 44 + wav.readUInt32LE(40))
  expect(output.bytes.readUInt32LE(40)).toBe(sound.length)
  expect(output.bytes.subarray(44, 44 + sound.length).equals(sound)).toBe(true)
  expect(output.bytes.toString('latin1')).not.toMatch(/Test pattern|Omsett|libFLAC/)
})

test('a WAV packed as FLAC in the page carries the checksum of its sound, and is smaller', async ({ page }) => {
  const output = await convert(page, 'wav/sample.wav', 'flac')
  expect(output.name).toBe('sample.flac')
  expect(output.found.kind === 'known' && output.found.format.id).toBe('flac')
  const wav = readFileSync(fixture('wav/sample.wav'))
  const sound = wav.subarray(44, 44 + wav.readUInt32LE(40))
  expect(output.bytes.subarray(26, 42).toString('hex')).toBe(createHash('md5').update(sound).digest('hex'))
  expect(output.bytes.length).toBeLessThan(sound.length * 0.7)
})

test('a sound file is offered sound formats and nothing else', async ({ page }) => {
  await open(page)
  await page.locator('#file-input').setInputFiles(fixture('au/sample.au'))
  await expect(page.locator('.file-card')).toContainText('AU')
  await expect(page.locator('[role="radio"][data-format="wav"]')).toBeVisible()
  await expect(page.locator('[role="radio"][data-format="aiff"]')).toBeVisible()
  await expect(page.locator('[role="radio"][data-format="flac"]')).toBeVisible()
  await expect(page.locator('[role="radio"][data-format="webp"]')).toHaveCount(0)
  await expect(page.locator('[role="radio"][data-format="zip"]')).toHaveCount(0)
})

test('telephone sound is unpacked to 16 bits, and the result says so', async ({ page }) => {
  const output = await convert(page, 'au/telephone.au', 'wav')
  await expect(page.locator('.result-card')).toContainText('The sound was stored in µ-law, a telephone code of eight bits.')
  // One channel, 8,000 a second, sixteen bits: twice the bytes the AU held.
  expect([output.bytes.readUInt16LE(20), output.bytes.readUInt16LE(22), output.bytes.readUInt32LE(24), output.bytes.readUInt16LE(34)]).toEqual([1, 1, 8000, 16])
  expect(output.bytes.readUInt32LE(40)).toBe((readFileSync(fixture('au/telephone.au')).length - 24 - 4) * 2)
})

test('a sound file shows how long it runs and how it is stored, and that its title is left behind', async ({ page }) => {
  await open(page)
  await page.locator('#file-input').setInputFiles(fixture('wav/sample.wav'))
  await page.getByTestId('details-toggle').click()
  await expect(row(page, 'Kind').locator('dd')).toHaveText('WAV')
  await expect(row(page, 'Length').locator('dd')).toContainText('0.25 seconds')
  await expect(row(page, 'Rate').locator('dd')).toContainText('11,025 samples a second')
  await expect(row(page, 'Channels').locator('dd')).toContainText('2 (stereo)')
  await expect(row(page, 'Stored as').locator('dd')).toContainText('16-bit whole numbers')
  await expect(row(page, 'Title').locator('dd')).toContainText('Test pattern')
  await expect(row(page, 'Title').locator('.fate')).toHaveText('removed when converted')
  await expect(page.locator('.fate[data-fate="removed"]')).toHaveCount(3)
})

test('a WAV holding MP3 is refused, with the name of what is inside', async ({ page }) => {
  await open(page)
  await page.locator('#file-input').setInputFiles(fixture('_traps/mp3-inside.wav'))
  await page.locator('[role="radio"][data-format="aiff"]').click()
  await page.getByTestId('convert').click()
  await expect(page.locator('.file-card')).toContainText('This WAV holds its sound as MP3, which Omsett cannot read yet. It reads sound that is stored unpacked')
})

test('packing as MP3 offers how much to leave out, and the choice changes the file', async ({ page }) => {
  await open(page)
  await page.locator('#file-input').setInputFiles(fixture('flac/sample.flac'))
  // The choice is for MP3 alone: a format that keeps everything has nothing to ask.
  await page.locator('[role="radio"][data-format="wav"]').click()
  await expect(page.getByTestId('sound-quality')).toHaveCount(0)
  await page.locator('[role="radio"][data-format="mp3"]').click()
  await expect(page.getByTestId('sound-quality-standard')).toBeChecked()
  await expect(page.locator('main')).toContainText('MP3 leaves out sound to make the file small. It cannot be put back, so keep the original.')

  const sizes: number[] = []
  for (const setting of ['smaller', 'best']) {
    await page.getByTestId(`sound-quality-${setting}`).check()
    await page.getByTestId('convert').click()
    const link = page.getByTestId('download')
    await expect(link).toBeVisible({ timeout: 30_000 })
    const output = await describeDownload(page, () => link.click())
    expect(output.name).toBe('sample.mp3')
    expect(output.found.kind === 'known' && output.found.format.id).toBe('mp3')
    await expect(page.locator('.result-card')).toHaveAttribute('data-engine', 'audio-mp3')
    sizes.push(output.bytes.length)
  }
  expect(sizes[0]!).toBeLessThan(sizes[1]!)
})

test('an MP3 unpacks to a WAV of the same length, with a warning that nothing is brought back', async ({ page }) => {
  await open(page)
  await page.locator('#file-input').setInputFiles(fixture('mp3/sample.mp3'))
  await page.locator('[role="radio"][data-format="wav"]').click()
  await expect(page.locator('main')).toContainText('An MP3 has already left sound out. Converting it does not bring that back; the file only gets larger.')
  await page.getByTestId('convert').click()
  const link = page.getByTestId('download')
  await expect(link).toBeVisible({ timeout: 30_000 })
  const output = await describeDownload(page, () => link.click())
  // The same quarter of a second the MP3 was packed from: 2,756 moments, two channels, sixteen bits.
  expect([output.bytes.readUInt16LE(22), output.bytes.readUInt32LE(24), output.bytes.readUInt16LE(34), output.bytes.readUInt32LE(40)]).toEqual([2, 11025, 16, 2756 * 4])
})

test('rubbish in the middle of an MP3 is refused, where a player would skip it', async ({ page }) => {
  await open(page)
  await page.locator('#file-input').setInputFiles(fixture('_traps/rubbish-in-the-middle.mp3'))
  await page.locator('[role="radio"][data-format="wav"]').click()
  await page.getByTestId('convert').click()
  await expect(page.locator('.file-card')).toContainText('This MP3 is damaged: part-way through, it stops being MP3')
})
