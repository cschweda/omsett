import type { Format } from '@omsett/registry'

export type Runtime = 'browser' | 'node'

export interface EngineInfo {
  /** 'canvas' | 'vips' */
  id: string
  /** 0 for canvas; shown as "downloads 8 MB once" */
  sizeBytes: number
  /** canvas: ['browser']; vips: ['browser', 'node'] */
  runtimes: Runtime[]
  /** Raster engines: the largest decoded image it will accept. */
  maxPixels?: number
  /** SPDX id of the shipped artifact. */
  license: string
  /** Where the exact source for that artifact lives. */
  sourceUrl: string
}

export interface ConvertInput {
  blob: Blob
  /** Original file name, for naming outputs. */
  name: string
  from: Format
  to: Format
  options: Record<string, unknown>
  signal: AbortSignal
  /** 0..1, called at most ~10×/s */
  onProgress: (fraction: number) => void
  /**
   * The most pixels the picture may turn out to have. An engine checks this as soon as it knows
   * the real size, because a header can lie and some formats do not state a size up front.
   */
  maxPixels?: number
}

export interface ConvertOutput {
  /** 'photo.webp'; presets that emit several files name each one. */
  name: string
  /** Format.id */
  format: string
  blob: Blob
  /**
   * Something the person should know about how this file was made, which could only be known
   * by reading the file: "The structure was read from the PDF's own tags". Shown with the result.
   */
  note?: string
}

export interface Engine extends EngineInfo {
  /**
   * Cheap runtime probe; must not download the engine. With a target, answers for writing that
   * format in particular: a browser may encode one format and not another.
   */
  available(target?: Format): Promise<boolean>
  /** Idempotent; resolves immediately when cached. */
  load(): Promise<void>
  convert(input: ConvertInput): Promise<ConvertOutput[]>
}
