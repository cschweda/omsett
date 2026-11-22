import { readFile } from 'node:fs/promises'
import { registry } from '@omsett/registry'
import { describe, expect, it } from 'vitest'
import { detect, nameDisagrees, sizeProblem, TOO_LARGE } from './index'

const formats = registry.formats

/** PNG signature plus an IHDR chunk declaring the given size. No pixel data at all. */
function pngHeader(width: number, height: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(33)
  bytes.set([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52])
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
    const jpeg = await readFile(new URL('../../../fixtures/jpeg/sample.jpg', import.meta.url))
    const file = new File([jpeg], 'photo.png', { type: 'image/png' })
    const found = await detect(file, formats)
    expect(found.kind === 'known' && found.format.id).toBe('jpeg')
    expect(found.kind === 'known' && found.dimensions).toEqual({ width: 320, height: 168 })
    expect(found.kind === 'known' && nameDisagrees(file.name, found.format)).toBe(true)
  })

  it('returns unknown for an empty file and for garbage, without throwing', async () => {
    await expect(detect(new Blob([]), formats)).resolves.toEqual({ kind: 'unknown' })
    const garbage = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    await expect(detect(new Blob([garbage]), formats)).resolves.toEqual({ kind: 'unknown' })
  })

  it('reports a real format with no registry entry as unregistered', async () => {
    const icns = await readFile(new URL('../../../fixtures/icns/sample.icns', import.meta.url))
    await expect(detect(new Blob([icns]), formats)).resolves.toMatchObject({ kind: 'unregistered', ext: 'icns' })
  })

  it('recognises an SVG by its root element, whatever comes before it', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="30"/>'
    for (const [text, size] of [
      [svg, { width: 40, height: 30 }],
      [`\uFEFF<?xml version="1.0"?>\n<!-- a comment -->\n<!DOCTYPE svg [<!ENTITY a "b>">]>\n${svg}`, { width: 40, height: 30 }],
      ['<svg viewBox="0 0 64.2 32" xmlns="http://www.w3.org/2000/svg"/>', { width: 65, height: 32 }],
      ['<SVG width="12px" height="8px">', { width: 12, height: 8 }],
      ['<svg width="10mm" height="10mm" viewBox="0 0 5 5">', null],
      ['<svg>', null],
    ] as const) {
      expect(await detect(new Blob([text]), formats), text).toMatchObject({ kind: 'known', ext: 'svg', dimensions: size })
    }
    for (const text of ['<html><svg/></html>', '<svgx/>', 'svg', '<!-- <svg> -->', '<?xml version="1.0"?><root><svg/></root>', '<!DOCTYPE svg [']) {
      const found = await detect(new Blob([text]), formats)
      expect(found.kind === 'known' ? found.ext : found.kind, text).not.toBe('svg')
    }
  })

  it('reads the size of every registered format from its header', async () => {
    for (const [file, size] of [
      ['webp/sample.webp', { width: 320, height: 200 }],
      ['gif/sample.gif', { width: 320, height: 200 }],
      ['tiff/sample.tiff', { width: 320, height: 200 }],
      ['jpeg/sample.jpg', { width: 320, height: 168 }],
      ['avif/sample.avif', { width: 320, height: 200 }],
      ['jxl/sample.jxl', { width: 320, height: 200 }],
      ['svg/sample.svg', { width: 320, height: 200 }],
      ['bmp/sample.bmp', { width: 320, height: 200 }],
      ['tga/sample.tga', { width: 320, height: 200 }],
      ['pnm/sample.ppm', { width: 320, height: 200 }],
      ['pnm/sample.pgm', { width: 320, height: 200 }],
      ['pnm/sample.pbm', { width: 320, height: 200 }],
      ['pnm/sample.pam', { width: 320, height: 200 }],
      ['pcx/sample.pcx', { width: 320, height: 200 }],
      ['sgi/sample.sgi', { width: 320, height: 200 }],
      ['ras/sample.ras', { width: 320, height: 200 }],
      ['hdr/sample.hdr', { width: 320, height: 200 }],
      ['exr/sample.exr', { width: 160, height: 100 }],
      ['svgz/sample.svgz', { width: 320, height: 200 }],
      ['ico/sample.ico', { width: 256, height: 256 }],
      ['qoi/sample.qoi', { width: 320, height: 200 }],
      ['psd/sample.psd', { width: 320, height: 200 }],
      ['jp2/sample.jp2', { width: 320, height: 200 }],
    ] as const) {
      const bytes = await readFile(new URL(`../../../fixtures/${file}`, import.meta.url))
      expect(await detect(new Blob([bytes]), formats), file).toMatchObject({ kind: 'known', dimensions: size })
    }
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
