import { readFile } from 'node:fs/promises'
import { registry } from '@omsett/registry'
import { describe, expect, it } from 'vitest'
import { detect, nameDisagrees, sizeProblem, TOO_LARGE } from './index'

const formats = registry.formats

/** The smallest valid JPEG: a 1×1 baseline image. */
const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/yQALCAABAAEBAREA/8wABgAQEAX/2gAIAQEAAD8A0s8g/9k=',
  'base64',
)

/** PNG signature plus an IHDR chunk declaring the given size. No pixel data at all. */
function pngHeader(width: number, height: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(33)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52])
  const view = new DataView(bytes.buffer)
  view.setUint32(16, width)
  view.setUint32(20, height)
  bytes.set([8, 6, 0, 0, 0], 24)
  return bytes
}

describe('detect', () => {
  it('reads the fixture as PNG with its real dimensions', async () => {
    const file = await readFile(new URL('../../../fixtures/png/sample.png', import.meta.url))
    const found = await detect(new Blob([file]), formats)
    expect(found).toMatchObject({ kind: 'known', dimensions: { width: 1200, height: 630 } })
    expect(found.kind === 'known' && found.format.id).toBe('png')
  })

  it('detects a JPEG renamed .png as JPEG', async () => {
    const file = new File([TINY_JPEG], 'photo.png', { type: 'image/png' })
    const found = await detect(file, formats)
    expect(found.kind === 'known' && found.format.id).toBe('jpeg')
    expect(found.kind === 'known' && found.dimensions).toEqual({ width: 1, height: 1 })
    expect(found.kind === 'known' && nameDisagrees(file.name, found.format)).toBe(true)
  })

  it('returns unknown for an empty file and for garbage, without throwing', async () => {
    await expect(detect(new Blob([]), formats)).resolves.toEqual({ kind: 'unknown' })
    const garbage = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    await expect(detect(new Blob([garbage]), formats)).resolves.toEqual({ kind: 'unknown' })
  })

  it('reports a real format with no registry entry as unregistered', async () => {
    const gif = new TextEncoder().encode('GIF89a\u0001\u0000\u0001\u0000\u0000\u0000\u0000;')
    await expect(detect(new Blob([gif]), formats)).resolves.toMatchObject({ kind: 'unregistered', ext: 'gif' })
  })
})

describe('size and pixel guard', () => {
  it('refuses a tiny PNG whose header declares 30000 × 30000, from the header alone', async () => {
    const bomb = new Blob([pngHeader(30000, 30000)])
    expect(bomb.size).toBeLessThan(100)
    const found = await detect(bomb, formats)
    expect(found).toMatchObject({ kind: 'known', dimensions: { width: 30000, height: 30000 } })
    expect(found.kind === 'known' && sizeProblem(bomb.size, found.dimensions)).toBe(TOO_LARGE)
  })

  it('accepts an ordinary image and refuses an oversized file', () => {
    expect(sizeProblem(50 * 1024 * 1024, { width: 6000, height: 4000 })).toBeNull()
    expect(sizeProblem(600 * 1024 * 1024, { width: 100, height: 100 })).toBe(TOO_LARGE)
  })
})
