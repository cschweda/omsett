export type Tier = 'browser' | 'native'

export type Category =
  | 'image'
  | 'vector'
  | 'pdf'
  | 'document'
  | 'spreadsheet'
  | 'presentation'
  | 'text'
  | 'data'
  | 'ebook'
  | 'audio'
  | 'subtitle'
  | 'archive'
  | 'font'
  | 'video'

/** Things a format can carry. A warning is derived whenever the source has one the target lacks. */
export type Trait =
  | 'alpha'
  | 'animation'
  | 'metadata'
  | 'multi-page'
  | 'layers'
  | 'full-color'
  // Data: values held inside other values, and notes written beside them.
  | 'nesting'
  | 'comments'
  // Subtitles: how the text looks and where it sits.
  | 'styling'

export interface Format {
  /** 'png' */
  id: string
  /** 'PNG' */
  name: string
  category: Category
  /** ['png'] */
  extensions: string[]
  /** ['image/png'] */
  mime: string[]
  /** `file-type` ext values that resolve to this format: ['png'] */
  detect: string[]
  /** One paragraph, for the tile tooltip, written for non-experts. */
  explain: string
  /** PNG never, JPEG always, WebP optional. */
  lossy: 'never' | 'always' | 'optional'
  /** What the format can carry. PNG: ['alpha', 'metadata'] */
  traits: Trait[]
  /** The largest width or height, in pixels, the format can hold. WebP: 16383. */
  maxDimension?: number
  /**
   * Set when Omsett reads this format but will not write it, with the reason in a sentence.
   * Shown wherever the format would otherwise be offered as a target.
   */
  readOnly?: string
}

export interface Warning {
  /** 'alpha-lost' */
  id: string
  /** 'Transparency will be flattened to white.' */
  text: string
}

/** What one engine can do. This is the only authored statement of what converts to what. */
export interface Capability {
  /** Engine.id */
  engine: string
  tier: Tier
  /** Format.id */
  reads: string[]
  writes: WriteSpec[]
  /** Lower is tried first when several engines cover the same pair. */
  priority: number
}

export interface WriteSpec {
  /** Format.id */
  format: string
  /** True if the default options lose data. */
  lossy: boolean
  defaultOptions?: Record<string, unknown>
  /**
   * Things the format could carry that this engine leaves out on purpose. Metadata is the
   * usual one: author, location and camera details are removed, not copied into the output.
   */
  drops?: Trait[]
}

/** A pair that needs saying something the reads/writes lists can't. */
export interface EdgeOverride {
  from: string
  to: string
  /** Omit to apply to every engine. */
  engine?: string
  /** A reason; the pair is not offered. */
  block?: string
  /** Added to the derived ones. */
  warnings?: Warning[]
}

// Everything below is derived. Nobody writes one of these by hand.

export interface Candidate {
  engine: string
  tier: Tier
  lossy: boolean
  /** lossless = 1, lossy = 3, native = +5 */
  cost: number
  defaultOptions: Record<string, unknown>
  drops: Trait[]
}

export interface Edge {
  from: string
  to: string
  /** Ordered by cost, then priority; never empty. */
  candidates: Candidate[]
  /** Trait losses + lossy-to-lossy + overrides. */
  warnings: Warning[]
}

export interface Route {
  /** 1–3 hops */
  edges: Edge[]
  /** 'native' if any hop's first candidate is native. */
  tier: Tier
  lossy: boolean
  /** Union, deduplicated by id. */
  warnings: Warning[]
  /** Sum of each hop's first-candidate cost. */
  totalCost: number
}

export interface Registry {
  formats: Format[]
  capabilities: Capability[]
  overrides: EdgeOverride[]
  traitWarnings: Record<Trait, Warning>
}

export interface Target {
  format: Format
  route: Route | null
  reason?: string
}

export interface Router {
  /** Every format the files could become or be refused as; formats of another kind are left out. */
  targetsFor(fromIds: string[]): Target[]
  route(from: string, to: string): Route | null
}
