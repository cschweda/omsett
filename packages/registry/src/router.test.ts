import { describe, expect, it } from 'vitest'
import {
  acceptAttribute,
  applySwitches,
  createRouter,
  deriveEdges,
  engineIds,
  everything,
  formatById,
  registry,
  sameKind,
  traitWarnings,
} from './index'
import type { Capability, EdgeOverride, Format, Registry } from './types'

describe('router, real registry', () => {
  const router = createRouter(registry)
  const byId = (targets: ReturnType<typeof router.targetsFor>, id: string) =>
    targets.find((t) => t.format.id === id)!

  it('offers WebP from PNG as a 1-hop browser route, canvas then vips', () => {
    const webp = byId(router.targetsFor(['png']), 'webp')
    expect(webp.route).not.toBeNull()
    expect(webp.route!.edges).toHaveLength(1)
    expect(webp.route!.tier).toBe('browser')
    expect(webp.route!.edges[0]!.candidates.map((c) => c.engine)).toEqual(['canvas', 'vips'])
  })

  it('offers every other image format from PNG, and explains why PNG itself is not', () => {
    const targets = router.targetsFor(['png'])
    for (const id of ['webp', 'jpeg', 'gif', 'tiff']) expect(byId(targets, id).route, id).not.toBeNull()
    expect(byId(targets, 'png')).toMatchObject({ route: null, reason: 'Already PNG' })
  })

  it('never gives the canvas anything but PNG to read', () => {
    // The canvas decodes with the browser's forgiving decoder, so it is given PNG only, the one
    // format whose structure the app verifies itself. Everything else is read by libvips.
    for (const edge of deriveEdges(registry).edges) {
      const engines = edge.candidates.map((c) => c.engine)
      if (edge.from !== 'png') expect(engines, `${edge.from} → ${edge.to}`).not.toContain('canvas')
      for (const engine of engines) expect(engine === 'canvas' || ['heif', 'resvg', 'magick', 'data', 'subtitle', 'markup', 'font', 'font-woff2', 'archive', 'script', 'pdf'].includes(engine) || engine.startsWith('vips')).toBe(true)
      // The data engine reads and writes data and nothing else; no picture engine touches data.
      const data = [edge.from, edge.to].map((id) => ['data', 'spreadsheet'].includes(formatById(registry, id)!.category))
      expect(data[0], `${edge.from} → ${edge.to}`).toBe(data[1])
      expect(engines.includes('data'), `${edge.from} → ${edge.to}`).toBe(data[0])
      // The same holds for subtitles and the engine that reads them.
      const subtitle = [edge.from, edge.to].map((id) => formatById(registry, id)!.category === 'subtitle')
      expect(subtitle[0], `${edge.from} → ${edge.to}`).toBe(subtitle[1])
      expect(engines.includes('subtitle'), `${edge.from} → ${edge.to}`).toBe(subtitle[0])
    }
  })

  it('lists formats in order of general usefulness, and routes every pair that can be written', () => {
    const all = createRouter(everything)
    const ids = everything.formats.map((f) => f.id)
    expect(ids).toEqual([
      'webp', 'jpeg', 'png', 'avif', 'gif', 'tiff', 'jxl', 'bmp', 'tga', 'qoi', 'pnm',
      'heic', 'apng', 'svg', 'svgz', 'psd', 'psb', 'ico', 'cur', 'jp2', 'exr', 'hdr', 'dds', 'fits', 'pcx', 'sgi', 'ras',
      'json', 'yaml', 'csv', 'xlsx', 'xml', 'toml', 'jsonl', 'tsv', 'vcf', 'ics',
      'srt', 'vtt', 'ass', 'ssa', 'ttml', 'lrc', 'sbv', 'smi', 'microdvd',
      'md', 'html', 'docx', 'pptx', 'pdf',
      'fountain', 'fdx', 'drafter',
      'woff2', 'woff', 'ttf', 'otf',
      'zip', 'tgz', 'tar',
    ])
    const readOnly = new Set(everything.formats.filter((f) => f.readOnly).map((f) => f.id))
    expect([...readOnly].sort()).toEqual(['apng', 'cur', 'dds', 'exr', 'fits', 'hdr', 'heic', 'ico', 'jp2', 'pcx', 'pdf', 'pptx', 'psb', 'psd', 'ras', 'sgi', 'svg', 'svgz'])
    // Every pair of the same kind converts, directly or through a step in between; nothing is
    // written as HEIC. A picture never becomes data, nor data a picture.
    const kind = (id: string) => formatById(everything, id)!.category
    for (const from of ids) {
      for (const to of ids) {
        // TTF and OTF hold different kinds of outline, and neither becomes the other.
        // Nor does an address book become a calendar.
        const redrawn = ['otf>ttf', 'ics>vcf'].includes([from, to].sort().join('>'))
        const impossible = from === to || readOnly.has(to) || !sameKind(kind(from), kind(to)) || redrawn
        expect(all.route(from, to) === null, `${from} → ${to}`).toBe(impossible)
      }
    }
    // Data formats convert to each other in one step, and a file is offered only its own kind.
    expect(all.route('csv', 'yaml')!.edges.map((e) => e.candidates[0]!.engine)).toEqual(['data'])
    expect(all.targetsFor(['json']).map((t) => t.format.id)).toEqual(['json', 'yaml', 'csv', 'xlsx', 'xml', 'toml', 'jsonl', 'tsv', 'vcf', 'ics'])
    expect(all.targetsFor(['png']).some((t) => t.format.category === 'data')).toBe(false)
    expect(all.targetsFor(['png', 'json']).find((t) => t.format.id === 'webp')!.reason).toBe('JSON files cannot become WebP')
    expect(all.route('yaml', 'json')!.warnings.map((w) => w.id)).toEqual(['comments-lost'])
    expect(all.route('json', 'csv')!.warnings.map((w) => w.id)).toEqual(['nesting-flattened', 'cells-exact'])
    // Whatever is written into a table carries the warning about formulas, with no exception:
    // a contact's name can be one as easily as a cell can.
    for (const to of ['csv', 'tsv']) {
      for (const format of everything.formats.filter((f) => ['data', 'spreadsheet'].includes(f.category) && f.id !== to)) {
        expect(all.route(format.id, to)!.warnings.map((w) => w.id), `${format.id} → ${to}`).toContain('cells-exact')
      }
    }
    // Fonts: only WOFF2 work uses the engine that has to be fetched, and TTF to OTF says why not.
    expect(all.route('ttf', 'woff')!.edges.map((e) => e.candidates[0]!.engine)).toEqual(['font'])
    expect(all.route('ttf', 'woff2')!.edges.map((e) => e.candidates[0]!.engine)).toEqual(['font-woff2'])
    expect(all.route('woff2', 'woff')!.edges.map((e) => e.candidates[0]!.engine)).toEqual(['font-woff2'])
    expect(all.targetsFor(['ttf']).find((t) => t.format.id === 'otf')!.reason).toMatch(/redrawing every letter/)
    expect(all.route('otf', 'woff2')!.warnings.map((w) => w.id)).toEqual(['font-licence'])
    // Markdown and HTML become each other and nothing else.
    expect(all.route('md', 'html')!.edges.map((e) => e.candidates[0]!.engine)).toEqual(['markup'])
    expect(all.targetsFor(['html']).map((t) => t.format.id)).toEqual(['md', 'html', 'docx', 'pptx', 'pdf'])
    // A Word document reaches Markdown through a page, and says what to check on the way.
    expect(all.route('docx', 'md')!.edges.map((e) => `${e.from}>${e.to}`)).toEqual(['docx>html', 'html>md'])
    expect(all.route('md', 'docx')!.warnings.map((w) => w.id)).toContain('accessibility-check')
    expect(all.route('html', 'md')!.warnings.map((w) => w.id)).toEqual(['content-only'])
    // Subtitles likewise: one step, their own kind only, and a note that styling is not kept.
    expect(all.route('ass', 'srt')!.edges.map((e) => e.candidates[0]!.engine)).toEqual(['subtitle'])
    expect(all.targetsFor(['srt']).every((t) => t.format.category === 'subtitle')).toBe(true)
    expect(all.route('ass', 'srt')!.warnings.map((w) => w.id)).toEqual(['styling-lost'])
    expect(all.route('sbv', 'lrc')!.warnings.map((w) => w.id)).toEqual(['lyrics-one-line'])
    expect(all.route('lrc', 'microdvd')!.warnings.map((w) => w.id).sort()).toEqual(['ends-guessed', 'frames-assumed'])
    // HEIC is decoded to PNG first, without loss, and goes on from there.
    expect(all.route('heic', 'png')!.edges.map((e) => e.candidates[0]!.engine)).toEqual(['heif'])
    expect(all.route('heic', 'jpeg')!.edges.map((e) => e.to)).toEqual(['png', 'jpeg'])
    // An SVG is drawn to PNG the same way, and what that costs is said for every target.
    expect(all.route('svg', 'png')!.edges.map((e) => e.candidates[0]!.engine)).toEqual(['resvg'])
    expect(all.route('svg', 'webp')!.warnings.map((w) => w.id)).toEqual(expect.arrayContaining(['svg-fonts', 'svg-linked']))
    expect(all.targetsFor(['png']).find((t) => t.format.id === 'heic')!.reason).toBe('HEIC can be read but not written')
  })

  it('removes a switched-off format everywhere at once', () => {
    const off = applySwitches(everything, { heic: { on: false, whenOff: 'Off' } })
    expect(off.formats.map((f) => f.id)).not.toContain('heic')
    expect(engineIds(off)).not.toContain('heif')
    expect(off.capabilities.flatMap((c) => [...c.reads, ...c.writes.map((w) => w.format)])).not.toContain('heic')
    expect(acceptAttribute(off)).not.toMatch(/heic|heif/)
    // Everything else is untouched.
    expect(deriveEdges(off).edges).toHaveLength(deriveEdges(everything).edges.length - 1)
    expect(applySwitches(everything, { heic: { on: true, whenOff: 'Off' } })).toBe(everything)
  })

  it('reaches AVIF and JPEG XL from the five core formats directly, and each other in two steps', () => {
    for (const core of ['png', 'jpeg', 'webp', 'gif', 'tiff']) {
      expect(router.route(core, 'avif')!.edges.map((e) => e.candidates[0]!.engine)).toEqual(['vips-heif'])
      expect(router.route('avif', core)!.edges).toHaveLength(1)
      expect(router.route(core, 'jxl')!.edges.map((e) => e.candidates[0]!.engine)).toEqual(['vips-jxl'])
    }
    // No one engine holds both modules, so the router goes through a lossless format between.
    const through = router.route('avif', 'jxl')!
    expect(through.edges).toHaveLength(2)
    expect(through.edges[0]!.candidates[0]!.lossy).toBe(false)
  })

  it('offers plain libvips, not a module, for the pairs plain libvips covers', () => {
    for (const edge of deriveEdges(registry).edges) {
      if ([edge.from, edge.to].some((id) => !['png', 'jpeg', 'webp', 'gif', 'tiff'].includes(id))) continue
      for (const c of edge.candidates) expect(['canvas', 'vips'], `${edge.from} → ${edge.to}`).toContain(c.engine)
    }
  })

  it('warns about what each conversion loses', () => {
    const lost = (from: string, to: string) => router.route(from, to)!.warnings.map((w) => w.id)
    expect(lost('png', 'jpeg')).toContain('alpha-lost')
    expect(lost('png', 'gif')).toContain('colors-reduced')
    expect(lost('jpeg', 'webp')).toContain('lossy-to-lossy')
    // By way of PNG, which loses nothing: still one lossy format to another, and said so once.
    expect(lost('heic', 'jpeg').filter((id) => id === 'lossy-to-lossy')).toHaveLength(1)
    expect(lost('heic', 'png')).not.toContain('lossy-to-lossy')
    // An animated PNG becomes its first picture, whatever it becomes, and that is said.
    for (const to of ['png', 'jpeg', 'webp', 'gif', 'avif', 'bmp']) expect(lost('apng', to), to).toContain('animation-lost')
    expect(lost('png', 'webp')).not.toContain('animation-lost')
    expect(lost('gif', 'webp')).toContain('animation-lost')
    expect(lost('tiff', 'png')).toContain('pages-lost')
    expect(lost('psd', 'png')).toContain('layers-lost')
    // every engine drops metadata, and says so wherever both formats could have carried it
    const carries = (id: string) => registry.formats.find((f) => f.id === id)!.traits.includes('metadata')
    for (const edge of deriveEdges(registry).edges) {
      if (!carries(edge.from) || !carries(edge.to)) continue
      expect(edge.warnings.map((w) => w.id), `${edge.from} → ${edge.to}`).toContain('metadata-lost')
    }
  })

  it('dims everything when nothing is dropped', () => {
    expect(router.targetsFor([]).every((t) => t.reason === 'Drop a file first')).toBe(true)
  })

  it('has no route from a format to itself', () => {
    expect(router.route('png', 'png')).toBeNull()
  })

  it('gives every engine for a pair the same defaults and the same omissions', () => {
    for (const edge of deriveEdges(registry).edges) {
      const first = edge.candidates[0]!
      for (const candidate of edge.candidates) {
        expect(candidate.defaultOptions, `${edge.from} → ${edge.to}`).toEqual(first.defaultOptions)
        expect(candidate.drops, `${edge.from} → ${edge.to}`).toEqual(first.drops)
      }
    }
  })

  it('writes WebP at the same default quality from every engine', () => {
    const edge = deriveEdges(registry).edge('png', 'webp')!
    expect(new Set(edge.candidates.map((c) => c.defaultOptions.quality))).toEqual(new Set([80]))
  })
})

describe('router, synthetic registry', () => {
  const fmt = (id: string, extra: Partial<Format> = {}): Format => ({
    id,
    name: id.toUpperCase(),
    category: 'image',
    extensions: [id],
    mime: [`image/${id}`],
    detect: [id],
    explain: '',
    lossy: 'never',
    traits: [],
    ...extra,
  })
  const cap = (
    engine: string,
    from: string,
    to: string,
    extra: Partial<Capability> & { lossy?: boolean } = {},
  ): Capability => ({
    engine,
    tier: extra.tier ?? 'browser',
    reads: [from],
    writes: [{ format: to, lossy: extra.lossy ?? false }],
    priority: extra.priority ?? 10,
  })
  const make = (
    ids: string[],
    capabilities: Capability[],
    overrides: EdgeOverride[] = [],
    formats?: Format[],
  ): Registry => ({
    formats: formats ?? ids.map((id) => fmt(id)),
    capabilities,
    overrides,
    traitWarnings,
  })

  it('finds 2-hop and 3-hop routes and rejects a 4-hop path', () => {
    const chain = make(
      ['a', 'b', 'c', 'd', 'e'],
      [cap('x', 'a', 'b'), cap('x', 'b', 'c'), cap('x', 'c', 'd'), cap('x', 'd', 'e')],
    )
    const router = createRouter(chain)
    expect(router.route('a', 'c')!.edges).toHaveLength(2)
    expect(router.route('a', 'd')!.edges).toHaveLength(3)
    expect(router.route('a', 'e')).toBeNull()
  })

  it('prefers a lossless route over a lossy one of the same length', () => {
    const reg = make(
      ['a', 'b', 'c', 'd'],
      [
        cap('lossy', 'a', 'b', { lossy: true }),
        cap('lossy', 'b', 'd'),
        cap('clean', 'a', 'c'),
        cap('clean', 'c', 'd'),
      ],
    )
    const route = createRouter(reg).route('a', 'd')!
    expect(route.edges.map((e) => e.to)).toEqual(['c', 'd'])
    expect(route.lossy).toBe(false)
    expect(route.totalCost).toBe(2)
  })

  it('breaks a cost tie by fewer hops', () => {
    // direct lossy edge costs 3; three lossless hops also cost 3
    const reg = make(
      ['a', 'b', 'c', 'd'],
      [
        cap('direct', 'a', 'd', { lossy: true }),
        cap('x', 'a', 'b'),
        cap('x', 'b', 'c'),
        cap('x', 'c', 'd'),
      ],
    )
    expect(createRouter(reg).route('a', 'd')!.edges).toHaveLength(1)
  })

  it('prefers browser over native, and marks a route native if any hop is', () => {
    const reg = make(
      ['a', 'b'],
      [cap('desk', 'a', 'b', { tier: 'native', priority: 1 }), cap('web', 'a', 'b', { priority: 99 })],
    )
    const route = createRouter(reg).route('a', 'b')!
    expect(route.tier).toBe('browser')
    expect(route.edges[0]!.candidates.map((c) => c.engine)).toEqual(['web', 'desk'])

    const nativeOnly = make(['a', 'b', 'c'], [cap('web', 'a', 'b'), cap('desk', 'b', 'c', { tier: 'native' })])
    expect(createRouter(nativeOnly).route('a', 'c')!.tier).toBe('native')
  })

  it('says why a read-only format is not a target', () => {
    const formats = [fmt('a'), fmt('b', { readOnly: 'B can be read but not written' })]
    const reg = make([], [cap('x', 'b', 'a')], [], formats)
    const router = createRouter(reg)
    expect(router.route('b', 'a')).not.toBeNull()
    expect(router.targetsFor(['a']).find((t) => t.format.id === 'b')).toMatchObject({
      route: null,
      reason: 'B can be read but not written',
    })
  })

  it('does not offer a blocked pair and carries the reason', () => {
    const reg = make(['a', 'b'], [cap('x', 'a', 'b')], [{ from: 'a', to: 'b', block: 'A cannot become B safely' }])
    const router = createRouter(reg)
    expect(router.route('a', 'b')).toBeNull()
    expect(router.targetsFor(['a']).find((t) => t.format.id === 'b')!.reason).toBe('A cannot become B safely')
  })

  it('blocks one engine without blocking the pair', () => {
    const reg = make(
      ['a', 'b'],
      [cap('x', 'a', 'b', { priority: 1 }), cap('y', 'a', 'b', { priority: 2 })],
      [{ from: 'a', to: 'b', engine: 'x', block: 'x mangles this' }],
    )
    expect(createRouter(reg).route('a', 'b')!.edges[0]!.candidates.map((c) => c.engine)).toEqual(['y'])
  })

  it('offers a target for several inputs only if every input can reach it', () => {
    const reg = make(['a', 'b', 'c'], [cap('x', 'a', 'c'), cap('x', 'b', 'c'), cap('x', 'a', 'b')])
    const router = createRouter(reg)
    const targets = router.targetsFor(['a', 'b'])
    expect(targets.find((t) => t.format.id === 'c')!.route).not.toBeNull()
    expect(targets.find((t) => t.format.id === 'b')!).toMatchObject({ route: null, reason: 'Already B' })
  })

  it('derives warnings from traits, lossy-to-lossy, and overrides', () => {
    const formats = [
      fmt('a', { traits: ['alpha', 'animation'], lossy: 'always' }),
      fmt('b', { traits: ['alpha'] }),
    ]
    const reg = make(
      [],
      [cap('x', 'a', 'b', { lossy: true })],
      [{ from: 'a', to: 'b', warnings: [{ id: 'custom', text: 'Custom note.' }] }],
      formats,
    )
    const ids = createRouter(reg).route('a', 'b')!.warnings.map((w) => w.id)
    expect(ids).toEqual(['animation-lost', 'lossy-to-lossy', 'custom'])
  })
})

describe('dimension limits', () => {
  it('refuses a picture wider or taller than the target can hold, and says why', async () => {
    const { dimensionProblem, formatById } = await import('./index')
    const webp = formatById(registry, 'webp')!
    const png = formatById(registry, 'png')!
    expect(dimensionProblem(webp, 16383, 16383)).toBeNull()
    expect(dimensionProblem(webp, 16384, 10)).toBe('Too large for WebP, which holds 16383 pixels a side at most')
    expect(dimensionProblem(webp, 10, 20000)).not.toBeNull()
    expect(dimensionProblem(png, 100000, 100000)).toBeNull()
  })
})
