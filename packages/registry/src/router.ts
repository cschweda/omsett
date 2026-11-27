import { dedupeWarnings, deriveEdges } from './derive'
import { canBecome, ownFirst } from './kinds'
import { lossyToLossy } from './trait-warnings'
import type { Edge, Format, Registry, Route, Router, Target } from './types'

export const MAX_HOPS = 3

interface Path {
  edges: Edge[]
  cost: number
  native: number
}

/** Lower cost wins; then fewer hops; then fewer native hops (browser over native). */
function better(a: Path, b: Path | undefined): boolean {
  if (!b) return true
  if (a.cost !== b.cost) return a.cost < b.cost
  if (a.edges.length !== b.edges.length) return a.edges.length < b.edges.length
  return a.native < b.native
}

function toRoute(path: Path, source: Format | undefined): Route {
  const warnings = path.edges.flatMap((e) => e.warnings)
  // A format that always loses detail, converted to another that does, loses it twice, by
  // whatever road. A photo going from HEIC to JPEG by way of PNG is still such a conversion,
  // though neither step is one by itself.
  if (source?.lossy === 'always' && path.edges.at(-1)?.candidates[0]?.lossy) warnings.push(lossyToLossy)
  return {
    edges: path.edges,
    tier: path.native > 0 ? 'native' : 'browser',
    lossy: path.edges.some((e) => e.candidates[0]!.lossy),
    warnings: dedupeWarnings(warnings),
    totalCost: path.cost,
  }
}

export function createRouter(registry: Registry): Router {
  const derived = deriveEdges(registry)
  const formats = new Map<string, Format>(registry.formats.map((f) => [f.id, f]))
  const outgoing = new Map<string, Edge[]>()
  for (const edge of derived.edges) {
    outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge])
  }

  // Shortest path with a hop cap. A plain Dijkstra cannot honor the cap (the cheapest way to
  // reach a node may use too many hops), so the search state is (format, hops): each round
  // extends every best-so-far path by one edge, and the best over all rounds wins.
  function route(from: string, to: string): Route | null {
    if (!formats.has(from) || !formats.has(to)) return null
    // A format to itself is one step or nothing: never a road round through another format.
    if (from === to) {
      const edge = derived.edge(from, to)
      return edge ? toRoute({ edges: [edge], cost: edge.candidates[0]!.cost, native: edge.candidates[0]!.tier === 'native' ? 1 : 0 }, formats.get(from)) : null
    }
    // A road may pass through another kind of file; it may not end at a kind the file cannot become.
    if (!canBecome(formats.get(from)!.category, formats.get(to)!.category)) return null
    // A pair that is ruled out is ruled out by any road: no going round through a third format.
    if (derived.blocked.has(`${from}>${to}`)) return null
    let frontier = new Map<string, Path>([[from, { edges: [], cost: 0, native: 0 }]])
    let best: Path | undefined
    for (let hop = 1; hop <= MAX_HOPS; hop++) {
      const next = new Map<string, Path>()
      for (const [node, path] of frontier) {
        for (const edge of outgoing.get(node) ?? []) {
          if (edge.from === edge.to || edge.to === from || path.edges.some((e) => e.from === edge.to)) continue
          const first = edge.candidates[0]!
          const extended: Path = {
            edges: [...path.edges, edge],
            cost: path.cost + first.cost,
            native: path.native + (first.tier === 'native' ? 1 : 0),
          }
          if (better(extended, next.get(edge.to))) next.set(edge.to, extended)
        }
      }
      const arrived = next.get(to)
      if (arrived && better(arrived, best)) best = arrived
      next.delete(to)
      frontier = next
    }
    return best ? toRoute(best, formats.get(from)) : null
  }

  function reasonFor(from: Format, to: Format): string {
    if (from.id === to.id) return `Already ${to.name}`
    if (!canBecome(from.category, to.category)) return `${from.name} files cannot become ${to.name}`
    if (to.readOnly) return to.readOnly
    return derived.blocked.get(`${from.id}>${to.id}`) ?? `No converter from ${from.name} to ${to.name} yet`
  }

  function targetsFor(fromIds: string[]): Target[] {
    const sources = fromIds.map((id) => formats.get(id)).filter((f): f is Format => f !== undefined)
    // Formats of another kind altogether are not listed: nobody dropping a spreadsheet needs to
    // be told it cannot become a photograph. Before there is a file, everything is listed.
    const all = registry.formats.filter(
      (format) => sources.length === 0 || sources.some((source) => canBecome(source.category, format.category)),
    )
    // For a book, the formats of books come first; otherwise the one order holds.
    const first = (format: Format) => sources.length > 0 && sources.every((source) => ownFirst(source.category) && source.category === format.category)
    const offered = [...all.filter(first), ...all.filter((format) => !first(format))]
    return offered.map((format) => {
      if (sources.length === 0 || sources.length !== fromIds.length) {
        return { format, route: null, reason: 'Drop a file first' }
      }
      const routes: Route[] = []
      for (const source of new Set(sources)) {
        const found = route(source.id, format.id)
        if (!found) return { format, route: null, reason: reasonFor(source, format) }
        routes.push(found)
      }
      // Several inputs: show the most demanding route, with every input's warnings.
      const worst = routes.reduce((a, b) => (b.totalCost > a.totalCost ? b : a))
      return {
        format,
        route: {
          ...worst,
          tier: routes.some((r) => r.tier === 'native') ? 'native' : 'browser',
          lossy: routes.some((r) => r.lossy),
          warnings: dedupeWarnings(routes.flatMap((r) => r.warnings)),
        },
      }
    })
  }

  return { route, targetsFor }
}
