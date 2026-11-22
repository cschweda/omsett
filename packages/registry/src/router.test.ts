import { describe, expect, it } from 'vitest'
import { createRouter, deriveEdges, registry, traitWarnings } from './index'
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

  it('reads every format but PNG with libvips alone', () => {
    // The canvas decodes with the browser's forgiving decoder, so it is given PNG only, the one
    // format whose structure the app verifies itself.
    for (const edge of deriveEdges(registry).edges) {
      const engines = edge.candidates.map((c) => c.engine)
      if (edge.from !== 'png') expect(engines, `${edge.from} → ${edge.to}`).toEqual(['vips'])
    }
  })

  it('converts between all five formats: twenty conversions', () => {
    const ids = registry.formats.map((f) => f.id)
    expect(ids).toEqual(['webp', 'jpeg', 'png', 'gif', 'tiff'])
    expect(deriveEdges(registry).edges).toHaveLength(20)
    for (const from of ids) for (const to of ids) expect(router.route(from, to) === null).toBe(from === to)
  })

  it('warns about what each conversion loses', () => {
    const lost = (from: string, to: string) => router.route(from, to)!.warnings.map((w) => w.id)
    expect(lost('png', 'jpeg')).toContain('alpha-lost')
    expect(lost('png', 'gif')).toContain('colors-reduced')
    expect(lost('jpeg', 'webp')).toContain('lossy-to-lossy')
    expect(lost('gif', 'webp')).toContain('animation-lost')
    expect(lost('tiff', 'png')).toContain('pages-lost')
    // every engine drops metadata, and says so
    for (const edge of deriveEdges(registry).edges) {
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
