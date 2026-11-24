import { describe, expect, it } from 'vitest'
import { formatById, registry } from '@omsett/registry'
import { createNodeEngines } from '../node'
import { encodePng } from '../png-encode'

// Writing an icon: square, never larger than the picture it came from, and at each size below.

const png = formatById(registry, 'png')!
const ico = formatById(registry, 'ico')!
const options = registry.capabilities.flatMap((c) => c.writes).find((w) => w.format === 'ico')!.defaultOptions!

/** A picture of one opaque colour. */
function picture(width: number, height: number): Promise<Blob> {
  const rgba = new Uint8Array(width * height * 4)
  for (let i = 0; i < rgba.length; i += 4) rgba.set([200, 30, 30, 255], i)
  return encodePng(rgba, width, height)
}

async function icon(width: number, height: number) {
  const [output] = await createNodeEngines().magick!.convert({
    blob: await picture(width, height),
    name: 'picture.png',
    from: png,
    to: ico,
    options,
    signal: new AbortController().signal,
    onProgress: () => {},
  })
  const bytes = new Uint8Array(await output!.blob.arrayBuffer())
  const view = new DataView(bytes.buffer)
  const entries = Array.from({ length: view.getUint16(4, true) }, (_, i) => {
    const at = 6 + i * 16
    return { side: bytes[at] || 256, high: bytes[at + 1] || 256, start: view.getUint32(at + 12, true) }
  })
  return { output: output!, bytes, view, entries }
}

describe('writing an icon', () => {
  it('asks for the sizes the registry gives', () => {
    expect(options).toEqual({ iconSizes: [16, 32, 48, 256] })
  })

  it('makes a large picture 256 pixels and each size below', async () => {
    const { entries, output } = await icon(600, 600)
    expect(entries.map((e) => [e.side, e.high])).toEqual([[256, 256], [48, 48], [32, 32], [16, 16]])
    expect(output.name).toBe('picture.ico')
    expect(output.note).toBe('This icon holds the picture at 256, 48, 32 and 16 pixels.')
  })

  it('never makes a picture larger than it was', async () => {
    const { entries, output } = await icon(100, 100)
    expect(entries.map((e) => e.side)).toEqual([100, 48, 32, 16])
    expect(output.note).toBe('This icon holds the picture at 100, 48, 32 and 16 pixels.')
    expect((await icon(16, 16)).entries.map((e) => e.side)).toEqual([16])
  })

  it('keeps a picture smaller than any icon size as it is', async () => {
    const { entries, output } = await icon(5, 5)
    expect(entries.map((e) => [e.side, e.high])).toEqual([[5, 5]])
    expect(output.note).toBe('This icon holds the picture at 5 pixels.')
  })

  it('gives a picture that is not square clear margins, and says so', async () => {
    const { entries, bytes, view, output } = await icon(600, 300)
    expect(entries.map((e) => [e.side, e.high])).toEqual([[256, 256], [48, 48], [32, 32], [16, 16]])
    expect(output.note).toBe('This icon holds the picture at 256, 48, 32 and 16 pixels. The picture was not square, so it has been given clear margins.')
    // The 16-pixel picture, as Windows keeps it: a 40-byte header, then rows from the bottom
    // up, each pixel blue, green, red and how solid it is.
    const small = entries.find((e) => e.side === 16)!
    expect(view.getUint32(small.start, true)).toBe(40)
    const pixel = (x: number, y: number) => [...bytes.subarray(small.start + 40 + ((15 - y) * 16 + x) * 4).subarray(0, 4)]
    expect(pixel(8, 0)[3], 'the margin above is clear').toBe(0)
    expect(pixel(8, 15)[3], 'the margin below is clear').toBe(0)
    expect(pixel(8, 8), 'the middle is the picture').toEqual([30, 30, 200, 255])
  })

  it('makes an icon of a picture a thousand times wider than it is tall', async () => {
    const { entries } = await icon(4000, 4)
    expect(entries.map((e) => e.side)).toEqual([256, 48, 32, 16])
  })
})
