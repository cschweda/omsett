import { describe, expect, it } from 'vitest'
import { detect, pngStructureProblem, readIcns } from '@omsett/detect'
import { formatById, iconSidesFor, registry } from '@omsett/registry'
import { createNodeEngines } from '../node'
import { encodePng } from '../png-encode'

// Writing an icon: square, never larger than the picture it came from, and at each size below.

const png = formatById(registry, 'png')!
const ico = formatById(registry, 'ico')!
const optionsFor = (id: string) => registry.capabilities.flatMap((c) => c.writes).find((w) => w.format === id)!.defaultOptions!
const options = optionsFor('ico')

async function made(id: string, width: number, height: number) {
  const [output] = await createNodeEngines().magick!.convert({
    blob: await picture(width, height),
    name: 'picture.png',
    from: png,
    to: formatById(registry, id)!,
    options: optionsFor(id),
    signal: new AbortController().signal,
    onProgress: () => {},
  })
  const bytes = new Uint8Array(await output!.blob.arrayBuffer())
  return { output: output!, bytes, view: new DataView(bytes.buffer), found: await detect(output!.blob, registry.formats) }
}

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
    expect(output.note).toBe('The file holds the picture at 256, 48, 32 and 16 pixels.')
  })

  it('never makes a picture larger than it was', async () => {
    const { entries, output } = await icon(100, 100)
    expect(entries.map((e) => e.side)).toEqual([100, 48, 32, 16])
    expect(output.note).toBe('The file holds the picture at 100, 48, 32 and 16 pixels.')
    expect((await icon(16, 16)).entries.map((e) => e.side)).toEqual([16])
  })

  it('keeps a picture smaller than any icon size as it is', async () => {
    const { entries, output } = await icon(5, 5)
    expect(entries.map((e) => [e.side, e.high])).toEqual([[5, 5]])
    expect(output.note).toBe('The file holds the picture at 5 pixels.')
  })

  it('gives a picture that is not square clear margins, and says so', async () => {
    const { entries, bytes, view, output } = await icon(600, 300)
    expect(entries.map((e) => [e.side, e.high])).toEqual([[256, 256], [48, 48], [32, 32], [16, 16]])
    expect(output.note).toBe('The file holds the picture at 256, 48, 32 and 16 pixels. The picture was not square, so it has been given clear margins.')
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

describe('writing a pointer', () => {
  it('is a pointer and not an icon, at three sizes, clicking with its top left corner', async () => {
    const { view, bytes, found, output } = await made('cur', 600, 600)
    expect(view.getUint16(2, true), 'the number that says pointer').toBe(2)
    const entries = Array.from({ length: view.getUint16(4, true) }, (_, i) => 6 + i * 16)
    expect(entries.map((at) => bytes[at])).toEqual([64, 48, 32])
    expect(entries.map((at) => [view.getUint16(at + 4, true), view.getUint16(at + 6, true)])).toEqual([[0, 0], [0, 0], [0, 0]])
    expect(found).toMatchObject({ kind: 'known', format: { id: 'cur' }, dimensions: { width: 64, height: 64 } })
    expect(output.note).toBe('The file holds the picture at 64, 48 and 32 pixels.')
  })

  it('is never larger than the picture it came from', async () => {
    const { view, bytes } = await made('cur', 40, 20)
    expect(Array.from({ length: view.getUint16(4, true) }, (_, i) => bytes[6 + i * 16])).toEqual([40, 32])
  })
})

describe('writing a Mac icon', () => {
  it('holds each size the picture is large enough for, as a sound PNG under its own name', async () => {
    const { output, bytes, view, found } = await made('icns', 600, 300)
    expect(found).toMatchObject({ kind: 'known', format: { id: 'icns' }, dimensions: { width: 512, height: 512 } })
    expect(view.getUint32(4), 'the length it gives is its length').toBe(bytes.length)
    const icon = await readIcns(output.blob)
    expect([...icon!.entries.keys()]).toEqual(['ic09', 'ic08', 'ic07', 'ic12', 'icp5', 'icp4'])
    let at = 8
    for (const size of [512, 256, 128, 64, 32, 16]) {
      const length = view.getUint32(at + 4)
      const png = bytes.subarray(at + 8, at + length)
      expect(await pngStructureProblem(new Blob([png as BlobPart]), 1024 * 1024), `the ${size}-pixel picture`).toBeNull()
      expect([new DataView(png.buffer, png.byteOffset).getUint32(16), new DataView(png.buffer, png.byteOffset).getUint32(20)]).toEqual([size, size])
      at += length
    }
    expect(at).toBe(bytes.length)
    expect(output.note).toBe('The file holds the picture at 512, 256, 128, 64, 32 and 16 pixels. The picture was not square, so it has been given clear margins.')
  })

  it('holds 1,024 pixels where the picture has them', async () => {
    const icon = await readIcns((await made('icns', 1200, 1200)).output.blob)
    expect([...icon!.entries.keys()]).toEqual(['ic10', 'ic09', 'ic08', 'ic07', 'ic12', 'icp5', 'icp4'])
  })

  it('makes a picture smaller than any Mac icon the smallest one, and says so', async () => {
    const { output, found } = await made('icns', 5, 5)
    expect(found).toMatchObject({ dimensions: { width: 16, height: 16 } })
    expect(output.note).toBe('The file holds the picture at 16 pixels. The picture was smaller than this format can hold, so it has been made larger.')
  })
})

describe('the sizes an icon is held at', () => {
  it('follows the picture where the format takes any size, and the names where it does not', () => {
    expect(iconSidesFor([256, 48, 32, 16], 600, 300)).toEqual([256, 48, 32, 16])
    expect(iconSidesFor([256, 48, 32, 16], 100, 40)).toEqual([100, 48, 32, 16])
    expect(iconSidesFor([256, 48, 32, 16], 9, 9)).toEqual([9])
    expect(iconSidesFor([1024, 512, 256, 128, 64, 32, 16], 100, 40, true)).toEqual([64, 32, 16])
    expect(iconSidesFor([1024, 512, 256, 128, 64, 32, 16], 9, 9, true)).toEqual([16])
  })
})
