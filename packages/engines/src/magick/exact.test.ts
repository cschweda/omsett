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
  expect(tga[2], 'the TGA is unpacked').toBe(2)
  const depth = tga[16]! / 8
  const fromTop = (tga[17]! & 0x20) !== 0
  const out = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = 18 + tga[0]! + ((fromTop ? y : height - 1 - y) * width + x) * depth
      out.set([tga[at + 2]!, tga[at + 1]!, tga[at]!, depth === 4 ? tga[at + 3]! : 255], (y * width + x) * 4)
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
