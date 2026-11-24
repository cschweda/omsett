import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { formatById, registry } from '@omsett/registry'
import { createNodeEngines } from '../node'
import { encodePng } from '../png-encode'

// Formats the registry says are written without loss are held to it: a picture of noise, in
// which no two neighbours agree, goes there and back and every pixel is compared.

const engine = createNodeEngines().magick!
const optionsFor = (id: string) => registry.capabilities.flatMap((c) => c.writes).find((w) => w.format === id)!.defaultOptions ?? {}

async function convert(blob: Blob, from: string, to: string) {
  const [output] = await engine.convert({
    blob,
    name: `picture.${from}`,
    from: formatById(registry, from)!,
    to: formatById(registry, to)!,
    options: optionsFor(to),
    signal: new AbortController().signal,
    onProgress: () => {},
  })
  return output!.blob
}

/** Noise that is the same every run. */
function noise(width: number, height: number, clearSome: boolean): Uint8Array {
  const rgba = new Uint8Array(width * height * 4)
  let seed = 12345
  for (let i = 0; i < rgba.length; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7FFFFFFF
    rgba[i] = i % 4 === 3 && !clearSome ? 255 : (seed >> 16) & 255
  }
  return rgba
}

/** The pixels of a PNG as red, green, blue and how solid, read out of a TGA, which keeps them plainly. */
async function pixels(png: Blob, width: number, height: number): Promise<Uint8Array> {
  const tga = new Uint8Array(await (await convert(png, 'png', 'tga')).arrayBuffer())
  // An unpacked TGA is a header of 18 bytes and then the pixels, blue first.
  // Kind 2 is colour and kind 3 is grey, one byte to a pixel; neither is packed.
  expect([2, 3], 'the TGA is unpacked').toContain(tga[2])
  const depth = tga[16]! / 8
  const fromTop = (tga[17]! & 0x20) !== 0
  const out = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = 18 + tga[0]! + ((fromTop ? y : height - 1 - y) * width + x) * depth
      out.set(depth === 1 ? [tga[at]!, tga[at]!, tga[at]!, 255] : [tga[at + 2]!, tga[at + 1]!, tga[at]!, depth === 4 ? tga[at + 3]! : 255], (y * width + x) * 4)
    }
  }
  return out
}

describe('formats written without loss', () => {
  for (const id of ['jp2', 'dds']) {
    for (const clearSome of [false, true]) {
      it(`${id} gives back every pixel${clearSome ? ', transparency included' : ''}`, async () => {
        const [width, height] = [67, 41]
        const rgba = noise(width, height, clearSome)
        const source = await encodePng(rgba, width, height)
        expect(await pixels(source, width, height), 'the comparison itself reads pixels rightly').toEqual(rgba)
        const there = await convert(source, 'png', id)
        const back = await convert(there, id, 'png')
        expect(await pixels(back, width, height)).toEqual(rgba)
      })
    }
  }
})

describe('a scan', () => {
  const trap = (name: string) => new Blob([readFileSync(new URL(`../../../../fixtures/${name}`, import.meta.url)) as BlobPart])
  const [width, height] = [320, 200]

  it('comes out as the pixels the file holds, in colour', async () => {
    const scan = trap('dcm/sample.dcm')
    const held = new Uint8Array(await scan.arrayBuffer()).subarray(-width * height * 3)
    const got = await pixels(await convert(scan, 'dcm', 'png'), width, height)
    expect(got.filter((_, i) => i % 4 !== 3)).toEqual(held)
  })

  for (const [name, why] of [['_traps/kinds-left-out.dcm', 'written the older way'], ['_traps/a-huge-picture-inside-a-list.dcm', 'with another picture described in a list inside it'], ['_traps/code.dcm', 'with code for a patient']] as const) {
    it(`comes out the same ${why}`, async () => {
      const held = new Uint8Array(await trap('dcm/sample.dcm').arrayBuffer()).subarray(-width * height * 3)
      const got = await pixels(await convert(trap(name), 'dcm', 'png'), width, height)
      expect(got.filter((_, i) => i % 4 !== 3)).toEqual(held)
    })
  }

  it('comes out as the pixels the file holds, in grey', async () => {
    const scan = trap('_traps/grey.dcm')
    const held = new Uint8Array(await scan.arrayBuffer()).subarray(-width * height)
    const got = await pixels(await convert(scan, 'dcm', 'png'), width, height)
    expect(got.filter((_, i) => i % 4 === 0)).toEqual(held)
    expect(got.filter((_, i) => i % 4 === 1)).toEqual(held)
  })
})
