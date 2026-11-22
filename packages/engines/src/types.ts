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
}

export interface ConvertOutput {
  /** 'photo.webp'; presets that emit several files name each one. */
  name: string
  /** Format.id */
  format: string
  blob: Blob
}

export interface Engine extends EngineInfo {
  /** Cheap runtime probe; must not download the engine. */
  available(): Promise<boolean>
  /** Idempotent; resolves immediately when cached. */
  load(): Promise<void>
  convert(input: ConvertInput): Promise<ConvertOutput[]>
}
