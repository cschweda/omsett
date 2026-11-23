// What the red-team audit of 23 November 2026 found in identification and the picture engines,
// each as a test that failed before its fix. Every file is built here, in memory, and taken
// the way the app takes one: identified, held to the size guard, then converted along the
// registry's route. The numbering is the audit's (security/audits.json).
import { readFile } from 'node:fs/promises'
import { deflateSync } from 'node:zlib'
import { detect, MAX_PIXELS, sizeProblem } from '@omsett/detect'
import { createNodeEngines } from '@omsett/engines/node'
import { createRouter, deriveEdges, formatById, registry, type Format } from '@omsett/registry'
import { describe, expect, it } from 'vitest'

const engines = createNodeEngines()
const router = createRouter(registry)
const derived = deriveEdges(registry)
const fmt = (id: string) => formatById(registry, id)!
const sample = async (path: string) => Buffer.from(await readFile(new URL(`./${path}`, import.meta.url)))

async function convert(blob: Blob, name: string, from: Format, to: Format) {
  let outputs = [{ name, format: from.id, blob }]
  for (const edge of router.route(from.id, to.id)!.edges) {
    const candidate = derived.edge(edge.from, edge.to)!.candidates.find((c) => c.engine in engines)!
    outputs = await engines[candidate.engine]!.convert({
      blob: outputs[0]!.blob,
      name,
      from: fmt(edge.from),
      to: fmt(edge.to),
      options: candidate.defaultOptions,
      maxPixels: MAX_PIXELS,
      signal: new AbortController().signal,
      onProgress: () => {},
    })
  }
  return Buffer.from(await outputs[0]!.blob.arrayBuffer())
}

interface Outcome {
  format: string
  size: string | null
  /** 'guard' where the size guard stopped it, the engine's words where the engine did, null where it converted. */
  refused: string | null
  out: Buffer | null
  outSize: string | null
  ms: number
}
async function take(bytes: Uint8Array, name: string, to = 'png'): Promise<Outcome> {
  const blob = new File([bytes as BlobPart], name)
  const found = await detect(blob, registry.formats, name)
  if (found.kind !== 'known') return { format: found.kind, size: null, refused: null, out: null, outSize: null, ms: 0 }
  const size = found.dimensions ? `${found.dimensions.width}x${found.dimensions.height}` : null
  const base = { format: found.format.id, size }
  if (sizeProblem(blob.size, found.dimensions)) return { ...base, refused: 'guard', out: null, outSize: null, ms: 0 }
  const start = performance.now()
  try {
    const out = await convert(blob, name, found.format, fmt(to))
    const after = await detect(new Blob([out as BlobPart]), registry.formats)
    const outSize = after.kind === 'known' && after.dimensions ? `${after.dimensions.width}x${after.dimensions.height}` : null
    return { ...base, refused: null, out, outSize, ms: performance.now() - start }
  } catch (error) {
    return { ...base, refused: (error as Error).message, out: null, outSize: null, ms: performance.now() - start }
  }
}

const b32 = (value: number) => {
  const b = Buffer.alloc(4)
  b.writeUInt32BE(value)
  return b
}
const b16 = (value: number) => {
  const b = Buffer.alloc(2)
  b.writeInt16BE(value)
  return b
}
const u16 = (value: number) => {
  const b = Buffer.alloc(2)
  b.writeUInt16LE(value)
  return b
}
const u32 = (value: number) => {
  const b = Buffer.alloc(4)
  b.writeUInt32LE(value)
  return b
}
function crc(data: Buffer) {
  let c = ~0
  for (const x of data) {
    c ^= x
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xEDB88320 : c >>> 1
  }
  return ~c >>> 0
}
const chunk = (type: string, data: Buffer) => Buffer.concat([b32(data.length), Buffer.from(type), data, b32(crc(Buffer.concat([Buffer.from(type), data])))])
/** A sound one-bit PNG of any size, in a few kilobytes. */
const bigPng = (width: number, height: number) =>
  Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', Buffer.concat([b32(width), b32(height), Buffer.from([1, 0, 0, 0, 0])])),
    chunk('IDAT', deflateSync(Buffer.alloc((Math.ceil(width / 8) + 1) * height), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
const svg = (body: string, width = 100, height = 100) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${body}</svg>`)
function ico(entries: Array<{ data: Buffer }>, shared = false) {
  let at = 6 + 16 * entries.length
  const parts: Buffer[] = [Buffer.from([0, 0, 1, 0]), u16(entries.length)]
  for (const entry of entries) {
    parts.push(Buffer.from([16, 16, 0, 0, 1, 0, 32, 0]), u32(entry.data.length), u32(at))
    if (!shared) at += entry.data.length
  }
  return Buffer.concat([...parts, ...(shared ? [entries[0]!.data] : entries.map((entry) => entry.data))])
}
const COSTLY = 'This drawing asks for more work than Omsett will do to draw it'
const TOO_LARGE_INSIDE = 'This drawing holds a picture too large to convert in a browser'

describe('OMS-120: a drawing is held to what is inside it, not only to the size it states', () => {
  it('a picture of 400 megapixels inside a drawing of 100 by 100 is refused before it is decoded', async () => {
    const found = await take(svg(`<image width="100" height="100" href="data:image/png;base64,${bigPng(20_000, 20_000).toString('base64')}"/>`), 'x.svg')
    expect(found).toMatchObject({ format: 'svg', size: '100x100', refused: TOO_LARGE_INSIDE })
    expect(found.ms).toBeLessThan(2000)
  })
  it('forty pictures that are each allowed and together are not', async () => {
    const pictures = Array.from({ length: 40 }, (_, i) => `<image width="100" height="100" href="data:image/png;base64,${bigPng(8000 + i, 8000).toString('base64')}"/>`).join('')
    expect((await take(svg(pictures), 'x.svg')).refused).toBe(TOO_LARGE_INSIDE)
  })
  it('a picture inside that does not state its size', async () => {
    expect((await take(svg(`<image width="9" height="9" href="data:image/png;base64,${Buffer.from('not a picture at all').toString('base64')}"/>`), 'x.svg')).refused).toBe(TOO_LARGE_INSIDE)
  })
  it('an ordinary picture inside a drawing is drawn', async () => {
    const found = await take(svg(`<image width="100" height="100" href="data:image/png;base64,${bigPng(200, 200).toString('base64')}"/>`), 'x.svg')
    expect(found).toMatchObject({ refused: null, outSize: '100x100' })
  })
})

describe('OMS-121: a drawing that asks for unbounded work is refused, not drawn', () => {
  it.each([
    ['a hundred million layers of noise', svg('<filter id="f" x="0" y="0" width="1" height="1"><feTurbulence baseFrequency="0.01" numOctaves="100000000"/></filter><rect width="200" height="200" filter="url(#f)"/>', 200, 200)],
    ['layers of noise given as a word', svg('<filter id="f"><feTurbulence numOctaves="many"/></filter><rect width="9" height="9" filter="url(#f)"/>')],
    ['every pixel spread four hundred pixels', svg('<filter id="f"><feMorphology operator="dilate" radius="400"/></filter><rect width="1000" height="1000" filter="url(#f)"/>', 1000, 1000)],
    ['every pixel weighed against forty thousand others', svg('<filter id="f"><feConvolveMatrix order="200" kernelMatrix="1"/></filter><rect width="9" height="9" filter="url(#f)"/>')],
    ['three million characters of text', svg(`<text x="0" y="50" font-size="1">${'W'.repeat(3_000_000)}</text>`)],
  ])('%s', async (_what, file) => {
    const found = await take(file, 'x.svg')
    expect(found.refused).toBe(COSTLY)
    expect(found.ms).toBeLessThan(2000)
  })
  it('patterns filled with patterns, twelve deep', async () => {
    const pattern = (n: number, fill: string) =>
      `<pattern id="p${n}" width="10" height="10" patternUnits="userSpaceOnUse">${`<rect width="5" height="5" fill="${fill}"/>`.repeat(8)}</pattern>`
    const chain = (depth: number) => svg(`${Array.from({ length: depth }, (_, i) => pattern(i, i === 0 ? 'red' : `url(#p${i - 1})`)).join('')}<rect width="100" height="100" fill="url(#p${depth - 1})"/>`)
    const deep = await take(chain(12), 'x.svg')
    expect(deep.refused).toBe(COSTLY)
    expect(deep.ms).toBeLessThan(2000)
    expect((await take(chain(3), 'x.svg')).refused).toBeNull()
    // A pattern that is filled with itself.
    expect((await take(svg('<pattern id="a" width="9" height="9"><rect width="9" height="9" fill="url(#a)"/></pattern><rect width="9" height="9" fill="url(#a)"/>'), 'x.svg')).refused).toBe(COSTLY)
  })
  it('modest filters and a paragraph of text are drawn', async () => {
    const file = svg('<filter id="f"><feTurbulence baseFrequency="0.05" numOctaves="3"/><feMorphology radius="2"/></filter><rect width="50" height="50" filter="url(#f)"/><text x="5" y="80">Some words, and <tspan>more</tspan>.</text>')
    expect((await take(file, 'x.svg')).refused).toBeNull()
  })
})

describe('OMS-122: a drawing nested in a drawing, and an engine that survives one', () => {
  const nested = (depth: number) => {
    const wrap = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">${body}</svg>`
    let inner = wrap('<rect width="100" height="100" fill="red"/>')
    for (let i = 0; i < depth; i++) inner = wrap(`<image width="100" height="100" href="data:image/svg+xml;base64,${Buffer.from(inner).toString('base64')}"/>`)
    return Buffer.from(inner)
  }
  it('twenty-five deep is refused by a stated limit, and a sound drawing converts straight after', async () => {
    expect((await take(nested(25), 'deep.svg')).refused).toBe(COSTLY)
    expect((await take(await sample('svg/sample.svg'), 'sample.svg')).refused).toBeNull()
  })
  it('two deep is drawn', async () => {
    expect((await take(nested(2), 'two.svg')).refused).toBeNull()
  })
})

describe('OMS-123: ImageMagick is told the limits, and stops before it makes room', () => {
  it('an icon that lists 16 by 16 and holds a picture of 20,000 by 20,000', async () => {
    const found = await take(ico([{ data: bigPng(20_000, 20_000) }]), 'x.ico')
    expect(found.format).toBe('ico')
    expect(found.refused).not.toBeNull()
    // It took eight seconds, and gigabytes, when the size was checked after decoding.
    expect(found.ms).toBeLessThan(3000)
  })
  it('two hundred thousand one-pixel pictures in one file', async () => {
    const unit = Buffer.from('P4 1 1\n\0')
    const many = Buffer.alloc(unit.length * 200_000)
    for (let i = 0; i < 200_000; i++) unit.copy(many, i * unit.length)
    const found = await take(many, 'x.pbm')
    expect(found.refused).not.toBeNull()
    expect(found.ms).toBeLessThan(3000)
  })
  it('sound files of every kind it reads still convert', async () => {
    for (const path of ['ico/sample.ico', 'psd/sample.psd', 'pnm/sample.ppm', 'tga/sample.tga', 'exr/sample.exr', 'jp2/sample.jp2', 'hdr/sample.hdr', 'bmp/sample.bmp', 'qoi/sample.qoi']) {
      expect((await take(await sample(path), path.split('/')[1]!)).refused, path).toBeNull()
    }
  })
})

describe('OMS-124: the size a file states is read the way the engine will read it', () => {
  const n = 20_000
  it('a Netpbm comment ended the old Macintosh way', async () => {
    expect(await take(Buffer.concat([Buffer.from(`P4\n#c\r${n} ${n}\n1 1\n`), Buffer.alloc(64)]), 'x.pbm')).toMatchObject({ size: `${n}x${n}`, refused: 'guard' })
  })
  it('a PAM that gives its width and height twice', async () => {
    const file = Buffer.concat([Buffer.from(`P7\nWIDTH 1\nHEIGHT 1\nWIDTH ${n}\nHEIGHT ${n}\nDEPTH 1\nMAXVAL 1\nTUPLTYPE BLACKANDWHITE\nENDHDR\n`), Buffer.alloc(64)])
    expect(await take(file, 'x.pam')).toMatchObject({ size: `${n}x${n}`, refused: 'guard' })
  })
  it('a bitmap with the oldest kind of header, which was always turned away as too large', async () => {
    const file = Buffer.concat([Buffer.from('BM'), u32(74), u32(0), u32(26), u32(12), u16(4), u16(4), u16(1), u16(24), Buffer.alloc(48, 200)])
    expect(await take(file, 'os2.bmp')).toMatchObject({ format: 'bmp', size: '4x4', refused: null, outSize: '4x4' })
  })
})

describe('OMS-125: a Photoshop file becomes its finished picture, never one of its layers', () => {
  it('a hidden layer larger than the picture is not what comes out', async () => {
    const canvas = 8
    const layer = 64
    const channel = (value: number) => Buffer.concat([b16(0), Buffer.alloc(layer * layer, value)])
    const channels = [channel(255), channel(0), channel(0)] // a red layer, 64 by 64
    const record = Buffer.concat([
      b32(0), b32(0), b32(layer), b32(layer), b16(3),
      ...[0, 1, 2].map((i) => Buffer.concat([b16(i), b32(channels[i]!.length)])),
      Buffer.from('8BIMnorm'), Buffer.from([255, 0, 2 /* hidden */, 0]), b32(12), b32(0), b32(0), Buffer.from('\x03sec'),
    ])
    const info = Buffer.concat([b16(1), record, ...channels])
    const layers = Buffer.concat([b32(info.length), info, b32(0)])
    const psd = Buffer.concat([Buffer.from('8BPS'), b16(1), Buffer.alloc(6), b16(3), b32(canvas), b32(canvas), b16(8), b16(3), b32(0), b32(0), b32(layers.length), layers, b16(0), Buffer.alloc(3 * canvas * canvas, 255)])
    const found = await take(psd, 'layers.psd', 'pnm')
    expect(found).toMatchObject({ format: 'psd', size: '8x8', refused: null, outSize: '8x8' })
    // White, as the finished picture is: all three colours full. The hidden layer is red,
    // which came out as full, none, none.
    const [red, green, blue] = found.out!.subarray(-3)
    expect(red).toBeGreaterThan(0)
    expect([green, blue]).toEqual([red, red])
  })
})

describe('OMS-126: a photograph comes out the way up it was taken', () => {
  it.each(['png', 'webp', 'tiff', 'avif'])('a portrait stored sideways, to %s', async (to) => {
    const base = await sample('jpeg/sample.jpg')
    const tiff = Buffer.alloc(26)
    tiff.write('II')
    tiff.writeUInt16LE(42, 2)
    tiff.writeUInt32LE(8, 4)
    tiff.writeUInt16LE(1, 8)
    tiff.writeUInt16LE(0x0112, 10) // Orientation
    tiff.writeUInt16LE(3, 12)
    tiff.writeUInt32LE(1, 14)
    tiff.writeUInt16LE(6, 18) // turned a quarter
    const body = Buffer.concat([Buffer.from('Exif\0\0'), tiff])
    const turned = Buffer.concat([base.subarray(0, 2), Buffer.from([0xFF, 0xE1, (body.length + 2) >> 8, (body.length + 2) & 255]), body, base.subarray(2)])
    expect(await take(base, 'plain.jpg', to)).toMatchObject({ size: '320x168', outSize: '320x168' })
    const found = await take(turned, 'turned.jpg', to)
    expect(found).toMatchObject({ refused: null, outSize: '168x320' })
    expect(found.out!.includes('Exif')).toBe(false)
  })
})

describe('OMS-128: a file that is text all through is not taken for a picture or a program', () => {
  it.each([
    ['bmi.csv', 'BMI,weight,height\n22.1,70,178\n', 'csv'],
    ['bmw.yaml', 'BMW: fast\nAudi: also\n', 'yaml'],
    ['notes.md', 'BM meeting notes\n\nhello\n', 'md'],
    ['p1.md', 'P1 incidents this week\n\n- one\n', 'md'],
    ['gif.csv', 'GIF89a,b\n1,2\n', 'csv'],
    ['qoif.csv', 'qoif,a,b,c,d\n1,2,3,4,5\n', 'csv'],
    ['radiance.md', '#?RADIANCE is the header of an HDR file\n', 'md'],
    ['ftyp.md', 'Why ftypheic matters\n', 'md'],
    ['mz.csv', 'MZ,code\n1,2\n', 'csv'],
    ['id3.csv', 'ID3,name\n1,2\n', 'csv'],
  ])('%s', async (name, text, format) => {
    const found = await detect(new File([text], name), registry.formats, name)
    expect(found.kind === 'known' && found.format.id).toBe(format)
  })
  it('and the pictures that are written as text are still pictures', async () => {
    const plain = await detect(new File(['P1\n# a comment\n2 2\n0 1\n1 0\n'], 'x.pbm'), registry.formats, 'x.pbm')
    expect(plain).toMatchObject({ kind: 'known', dimensions: { width: 2, height: 2 } })
    expect(plain.kind === 'known' && plain.format.id).toBe('pnm')
    for (const path of ['pnm/sample.pam', 'pnm/sample.pbm', 'hdr/sample.hdr', 'svg/sample.svg', 'pdf/sample.pdf', 'bmp/sample.bmp', 'gif/sample.gif']) {
      const found = await detect(new File([await sample(path)], path), registry.formats, path)
      expect(found.kind, path).toBe('known')
    }
  })
})

describe('OMS-127: a HEIC file becomes the picture it names as the one to show', () => {
  it('where that picture is not the first in the file', async () => {
    const original = await sample('heic/sample.heic')
    const changed = Buffer.from(original)
    changed.write('free', changed.indexOf('auxl')) // the second picture is no longer an accessory to the first
    changed[changed.indexOf('infe', 170) + 7] = 0 // nor hidden
    changed.writeUInt16BE(2, changed.indexOf('pitm') + 8) // and is named as the one to show
    const first = await take(original, 'first.heic', 'pnm')
    const second = await take(changed, 'second.heic', 'pnm')
    expect(first.refused).toBeNull()
    expect(second.refused).toBeNull()
    // Before the fix both came out as the first picture, byte for byte.
    expect(first.out!.equals(second.out!)).toBe(false)
  })
})
