import type { Registry } from './types'

/**
 * Off switches. A format listed here with `on: false` is taken out of Omsett everywhere at
 * once: it is not accepted, not listed, not offered as a target, and no engine is fetched for
 * it. A file of that format is named for what it is and shown the reason below.
 *
 * To switch one off: change `on` to `false`, commit, and push to `main`. The site rebuilds
 * itself in about two minutes. Nothing else needs editing; the tests allow for either setting.
 */
export interface Switch {
  on: boolean
  /** Shown beside a file of this format while it is off. */
  whenOff: string
}

export const switches: Record<string, Switch> = {
  // HEIC is decoded with libde265, an open-source HEVC decoder. HEVC is covered by patents;
  // this switch is here in case that ever becomes a problem.
  heic: { on: true, whenOff: 'HEIC is switched off for now' },
}

/** The registry with every switched-off format, and anything that only served it, removed. */
export function applySwitches(reg: Registry, table: Record<string, Switch>): Registry {
  const off = new Set(Object.keys(table).filter((id) => !table[id]!.on))
  if (off.size === 0) return reg
  return {
    ...reg,
    formats: reg.formats.filter((f) => !off.has(f.id)),
    capabilities: reg.capabilities
      .map((c) => ({
        ...c,
        reads: c.reads.filter((id) => !off.has(id)),
        writes: c.writes.filter((w) => !off.has(w.format)),
      }))
      .filter((c) => c.reads.length > 0 && c.writes.length > 0),
    overrides: reg.overrides.filter((o) => !off.has(o.from) && !off.has(o.to)),
  }
}
