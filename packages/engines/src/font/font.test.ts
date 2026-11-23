import { readFile } from 'node:fs/promises'
import { formatById, registry } from '@omsett/registry'
import { describe, expect, it } from 'vitest'
import { Refusal } from '../util'
import { createFontEngine, createFontWoff2Engine } from './index'
import { checksum, readSfnt, readWoff, writeSfnt, writeWoff } from './sfnt'

const fixture = async (path: string) => new Uint8Array(await readFile(new URL(`../../../../fixtures/${path}`, import.meta.url)))

async function convert(bytes: Uint8Array, from: string, to: string) {
  const engine = from === 'woff2' || to === 'woff2' ? createFontWoff2Engine() : createFontEngine()
  const [output] = await engine.convert({
    blob: new Blob([bytes as BlobPart]),
    name: `font.${from}`,
    from: formatById(registry, from)!,
    to: formatById(registry, to)!,
    options: {},
    signal: new AbortController().signal,
    onProgress: () => {},
  })
  return new Uint8Array(await output!.blob.arrayBuffer())
}
const refusal = (work: Promise<unknown>) =>
  work.then(
    () => null,
    (error: unknown) => (error instanceof Refusal ? error.message : `not a Refusal: ${String(error)}`),
  )
const tablesOf = (font: { tables: Array<{ tag: string; data: Uint8Array }> }) =>
  Object.fromEntries(font.tables.map((table) => [table.tag, Buffer.from(table.data).toString('hex')]))

describe('fonts', () => {
  it('reads a TTF and writes back the same file, byte for byte', async () => {
    const ttf = await fixture('ttf/sample.ttf')
    expect(Buffer.from(writeSfnt(readSfnt(ttf, 'TTF'))).equals(Buffer.from(ttf))).toBe(true)
  })

  it('reads an OTF and writes back the same file, byte for byte', async () => {
    const otf = await fixture('otf/sample.otf')
    expect(Buffer.from(writeSfnt(readSfnt(otf, 'OTF'))).equals(Buffer.from(otf))).toBe(true)
  })

  it('wraps a TTF as WOFF and unwraps it to the same TTF', async () => {
    const ttf = await fixture('ttf/sample.ttf')
    const woff = await convert(ttf, 'ttf', 'woff')
    expect(Buffer.from(woff.subarray(0, 4)).toString('latin1')).toBe('wOFF')
    expect(woff.length).toBeLessThan(ttf.length)
    expect(Buffer.from(await convert(woff, 'woff', 'ttf')).equals(Buffer.from(ttf))).toBe(true)
  })

  it('reads a WOFF another program made, with every table as that program wrote it', async () => {
    const [woff, ttf] = [await fixture('woff/sample.woff'), await fixture('ttf/sample.ttf')]
    expect(tablesOf(await readWoff(woff))).toEqual(tablesOf(readSfnt(ttf, 'TTF')))
  })

  it('takes a font through WOFF2 and back with every letter intact', async () => {
    const ttf = await fixture('ttf/sample.ttf')
    const woff2 = await convert(ttf, 'ttf', 'woff2')
    expect(Buffer.from(woff2.subarray(0, 4)).toString('latin1')).toBe('wOF2')
    const back = readSfnt(await convert(woff2, 'woff2', 'ttf'), 'TTF')
    const original = readSfnt(ttf, 'TTF')
    // WOFF2 rearranges the outlines to pack them, so `glyf` comes back equal in meaning and
    // not always in bytes; the tables it leaves alone come back exactly.
    for (const tag of ['cmap', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post']) {
      expect(tablesOf(back)[tag], tag).toBe(tablesOf(original)[tag])
    }
    expect(back.tables.map((table) => table.tag).sort()).toEqual(original.tables.map((table) => table.tag).sort())
  })

  it('unwraps a web font to the kind of file its outlines are, and says so when asked for the other', async () => {
    const postscript = await fixture('woff/postscript.woff')
    expect(Buffer.from(await convert(postscript, 'woff', 'otf')).equals(Buffer.from(await fixture('otf/sample.otf')))).toBe(true)
    expect(await refusal(convert(postscript, 'woff', 'ttf'))).toBe(
      'This font has PostScript outlines, so it unwraps to OTF, not TTF. Choose OTF.',
    )
    expect(await refusal(convert(await fixture('woff2/sample.woff2'), 'woff2', 'otf'))).toBe(
      'This font has TrueType outlines, so it unwraps to TTF, not OTF. Choose TTF.',
    )
  })

  it('writes checksums a strict reader accepts, the whole-file one included', async () => {
    const ttf = await convert(await fixture('woff/sample.woff'), 'woff', 'ttf')
    // Every font file, summed as a whole, comes to this number.
    expect(checksum(ttf)).toBe(0xB1B0AFBA)
    expect(() => readSfnt(ttf, 'TTF')).not.toThrow()
  })

  describe('refuses', () => {
    const flip = (bytes: Uint8Array, at: number) => {
      const copy = bytes.slice()
      copy[at] = copy[at]! ^ 0xFF
      return copy
    }

    it('a font with one byte changed in a table', async () => {
      const ttf = await fixture('ttf/sample.ttf')
      expect(await refusal(convert(flip(ttf, ttf.length - 40), 'ttf', 'woff'))).toBe(
        'This font is damaged: part of it does not match its own checksum',
      )
    })

    it('a font cut short', async () => {
      const ttf = await fixture('ttf/sample.ttf')
      for (const length of [0, 5, 12, 100, ttf.length - 1]) {
        expect(await refusal(convert(ttf.subarray(0, length), 'ttf', 'woff')), `${length} bytes`).toBe('This file is not a valid TTF font')
      }
      const woff = await fixture('woff/sample.woff')
      for (const length of [0, 20, 44, 200, woff.length - 1]) {
        expect(await refusal(convert(woff.subarray(0, length), 'woff', 'ttf')), `${length} bytes`).toBe('This file is not a valid WOFF font')
      }
    })

    it('a WOFF with anything added after the font', async () => {
      const woff = await fixture('woff/sample.woff')
      const longer = new Uint8Array([...woff, 1, 2, 3, 4])
      expect(await refusal(convert(longer, 'woff', 'ttf'))).toBe('This file is not a valid WOFF font')
    })

    it('a WOFF whose table says it unpacks to more than it does, or less', async () => {
      const woff = await fixture('woff/sample.woff')
      const data = new DataView(woff.buffer, woff.byteOffset, woff.byteLength)
      // Find a table that is stored compressed, and misstate its unpacked size.
      const count = data.getUint16(12)
      const at = Array.from({ length: count }, (_, i) => 44 + 20 * i).find((entry) => data.getUint32(entry + 8) < data.getUint32(entry + 12))!
      for (const change of [1, -1, 1000]) {
        const copy = woff.slice()
        new DataView(copy.buffer).setUint32(at + 12, data.getUint32(at + 12) + change)
        expect(await refusal(convert(copy, 'woff', 'ttf')), `${change}`).toBe('This file is not a valid WOFF font')
      }
    })

    it('a WOFF that claims to unpack to gigabytes, before unpacking anything', async () => {
      const woff = (await fixture('woff/sample.woff')).slice()
      new DataView(woff.buffer).setUint32(44 + 12, 0xFFFFFFF0)
      expect(await refusal(convert(woff, 'woff', 'ttf'))).toBe('This font is too large to convert')
    })

    it('a WOFF2 that is not one', async () => {
      const woff2 = await fixture('woff2/sample.woff2')
      expect(await refusal(convert(woff2.subarray(0, 200), 'woff2', 'ttf'))).toBe('This file is not a valid WOFF2 font')
      expect(await refusal(convert(flip(woff2, 60), 'woff2', 'ttf'))).toMatch(/^This f/)
    })

    it('a file with a font\'s first bytes and nothing a font needs', async () => {
      const tables = [{ tag: 'junk', data: new Uint8Array(8) }]
      expect(await refusal(convert(writeSfnt({ flavor: 0x00010000, tables }), 'ttf', 'woff'))).toBe('This file is not a valid TTF font')
      expect(await refusal(convert(await writeWoff({ flavor: 0x00010000, tables }), 'woff', 'ttf'))).toBe('This file is not a valid WOFF font')
    })

    it('a font whose table list points outside the file, or at itself', async () => {
      const ttf = await fixture('ttf/sample.ttf')
      for (const offset of [0xFFFFFF00, 4, ttf.length - 2]) {
        const copy = ttf.slice()
        new DataView(copy.buffer).setUint32(12 + 8, offset)
        expect(await refusal(convert(copy, 'ttf', 'woff')), `${offset}`).toMatch(/not a valid TTF font|damaged/)
      }
    })
  })

  it('still converts a good WOFF2 after being given a bad one', async () => {
    const good = await fixture('woff2/sample.woff2')
    for (let i = 0; i < 3; i++) {
      expect(await refusal(convert(good.subarray(0, 100 + i * 50), 'woff2', 'ttf'))).toBe('This file is not a valid WOFF2 font')
    }
    expect(() => readSfnt(new Uint8Array(0), 'TTF')).toThrow()
    const ttf = await convert(good, 'woff2', 'ttf')
    expect(() => readSfnt(ttf, 'TTF')).not.toThrow()
  })
})
