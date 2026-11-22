import { lossyToLossy } from './trait-warnings'
import type { Candidate, Edge, EdgeOverride, Format, Registry, Warning } from './types'

const key = (from: string, to: string) => `${from}>${to}`

function candidateCost(lossy: boolean, native: boolean): number {
  return (lossy ? 3 : 1) + (native ? 5 : 0)
}

function dedupe(warnings: Warning[]): Warning[] {
  const seen = new Set<string>()
  return warnings.filter((w) => (seen.has(w.id) ? false : (seen.add(w.id), true)))
}

export interface Derived {
  edges: Edge[]
  /** Pairs an override removed entirely, with the reason to show. */
  blocked: Map<string, string>
  edge(from: string, to: string): Edge | undefined
}

/** capabilities + formats + overrides → edges. Nobody writes an edge by hand. */
export function deriveEdges(registry: Registry): Derived {
  const formats = new Map<string, Format>(registry.formats.map((f) => [f.id, f]))
  const overridesFor = (from: string, to: string): EdgeOverride[] =>
    registry.overrides.filter((o) => o.from === from && o.to === to)

  const ranked = new Map<string, Array<Candidate & { priority: number }>>()
  const blocked = new Map<string, string>()

  for (const capability of registry.capabilities) {
    for (const from of capability.reads) {
      for (const write of capability.writes) {
        const to = write.format
        if (from === to) continue
        if (!formats.has(from) || !formats.has(to)) {
          throw new Error(`Capability "${capability.engine}" names an unregistered format: ${from} → ${to}`)
        }
        const block = overridesFor(from, to).find(
          (o) => o.block !== undefined && (o.engine === undefined || o.engine === capability.engine),
        )
        if (block?.block !== undefined) {
          if (block.engine === undefined) blocked.set(key(from, to), block.block)
          continue
        }
        const list = ranked.get(key(from, to)) ?? []
        list.push({
          engine: capability.engine,
          tier: capability.tier,
          lossy: write.lossy,
          cost: candidateCost(write.lossy, capability.tier === 'native'),
          defaultOptions: { ...write.defaultOptions },
          drops: write.drops ?? [],
          priority: capability.priority,
        })
        ranked.set(key(from, to), list)
      }
    }
  }

  const edges: Edge[] = []
  for (const [pair, list] of ranked) {
    const [from, to] = pair.split('>') as [string, string]
    const source = formats.get(from)!
    const target = formats.get(to)!
    list.sort((a, b) => a.cost - b.cost || a.priority - b.priority)
    const candidates: Candidate[] = list.map((c) => ({
      engine: c.engine,
      tier: c.tier,
      lossy: c.lossy,
      cost: c.cost,
      defaultOptions: c.defaultOptions,
      drops: c.drops,
    }))
    const first = candidates[0]!

    const warnings: Warning[] = []
    for (const trait of source.traits) {
      // Lost because the target cannot hold it, or because the engine that will run leaves it out.
      if (!target.traits.includes(trait) || first.drops.includes(trait)) {
        warnings.push(registry.traitWarnings[trait])
      }
    }
    if (source.lossy === 'always' && first.lossy) warnings.push(lossyToLossy)
    for (const override of overridesFor(from, to)) {
      if (override.warnings) warnings.push(...override.warnings)
    }
    edges.push({ from, to, candidates, warnings: dedupe(warnings) })
    blocked.delete(pair)
  }

  const byPair = new Map(edges.map((e) => [key(e.from, e.to), e]))
  return { edges, blocked, edge: (from, to) => byPair.get(key(from, to)) }
}

export { dedupe as dedupeWarnings }
