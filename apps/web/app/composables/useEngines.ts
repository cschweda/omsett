import { engineInfo, type ConvertOutput, type Detail } from '@omsett/engines'
import * as Comlink from 'comlink'
import { PREVIEW_BUDGET_MS, withTimeout, ZIP_BUDGET_MS } from '~/utils/limits'
import type { ConvertRequest, EngineWorkerApi } from '~/workers/engine.worker'
import type { ThumbnailWorkerApi } from '~/workers/thumbnail.worker'

interface Hosted<T> {
  worker: Worker
  api: Comlink.Remote<T>
  /** Rejects when the worker dies, by itself or because it was stopped. */
  crashed: Promise<never>
  /** Stop the worker, and settle everything still waiting on it. */
  stop(): void
}

function host<T>(create: () => Worker): Hosted<T> {
  const worker = create()
  // Comlink never settles a call whose worker died, so a crash is surfaced as a rejection.
  let stopped: (reason: Error) => void = () => {}
  const crashed = new Promise<never>((_, reject) => {
    stopped = reject
    worker.addEventListener('error', (event) => reject(new Error(event.message || 'The worker crashed')))
    worker.addEventListener('messageerror', () => reject(new Error('The worker sent unreadable data')))
  })
  crashed.catch(() => {})
  const stop = () => {
    worker.terminate()
    // A stopped worker never answers. Whatever was waiting on it is told so, now.
    stopped(new Error('The worker was stopped'))
  }
  return { worker, api: Comlink.wrap<T>(worker), crashed, stop }
}

let engineHost: Hosted<EngineWorkerApi> | undefined
let thumbnailHost: Hosted<ThumbnailWorkerApi> | undefined
// Reading a file's details and packing a ZIP happen beside conversions, in a worker of their
// own: one worker does one thing at a time, and a question asked of the converting worker
// would wait behind the conversion, run out of time, and take the conversion down with it.
let sideHost: Hosted<EngineWorkerApi> | undefined
/** Previews are drawn one at a time. */
let previews: Promise<unknown> = Promise.resolve()

function sideWorker(): Hosted<EngineWorkerApi> {
  sideHost ??= host<EngineWorkerApi>(
    () => new Worker(new URL('../workers/engine.worker.ts', import.meta.url), { type: 'module' }),
  )
  return sideHost
}
function stopSide(current: Hosted<EngineWorkerApi>) {
  if (sideHost !== current) return
  current.stop()
  sideHost = undefined
}

function engineWorker(): Hosted<EngineWorkerApi> {
  engineHost ??= host<EngineWorkerApi>(
    () => new Worker(new URL('../workers/engine.worker.ts', import.meta.url), { type: 'module' }),
  )
  return engineHost
}

function thumbnailWorker(): Hosted<ThumbnailWorkerApi> {
  thumbnailHost ??= host<ThumbnailWorkerApi>(
    () => new Worker(new URL('../workers/thumbnail.worker.ts', import.meta.url), { type: 'module' }),
  )
  return thumbnailHost
}

/** Engines run in a Web Worker, always. The page only moves Blobs and progress events. */
export function useEngines() {
  /** Which engines this browser can actually run, from each engine's own probe. */
  const availability = useState<Record<string, boolean>>('engine-availability', () => ({}))
  /** Engines whose code has been fetched this session. */
  const loaded = useState<string[]>('engines-loaded', () => [])

  /** Never throws: a browser that cannot start the worker simply has no engines. */
  async function probe() {
    const current = engineWorker()
    try {
      availability.value = await Promise.race([current.api.availability(), current.crashed])
    } catch (error) {
      console.warn('[omsett] the engine worker could not start', error)
      availability.value = Object.fromEntries(Object.keys(engineInfo).map((id) => [id, false]))
      if (engineHost === current) terminate()
    }
  }

  /**
   * @param budgetMs how long this conversion may run. Past it, the worker is terminated, which
   * is the only way to stop an engine that is stuck inside a file, and TimedOut is thrown.
   */
  async function convert(
    id: string,
    request: ConvertRequest,
    onProgress: (fraction: number) => void,
    budgetMs: number,
  ): Promise<ConvertOutput[]> {
    const current = engineWorker()
    try {
      const outputs = await withTimeout(
        Promise.race([current.api.convert(id, request, Comlink.proxy(onProgress)), current.crashed]),
        budgetMs,
        () => {
          if (engineHost === current) terminate()
        },
      )
      if (!loaded.value.includes(id)) loaded.value = [...loaded.value, id]
      return outputs
    } catch (error) {
      // A worker that threw may be in any state. Start the next conversion on a fresh one.
      if (engineHost === current) terminate()
      throw error
    }
  }

  /** @param own true for a picture Omsett made itself; a dropped file is checked for size first */
  function thumbnail(blob: Blob, size: number, own = false): Promise<ImageBitmap> {
    // After the one before it, whether that one worked or not.
    const next = previews.then(() => drawThumbnail(blob, size, own))
    previews = next.catch(() => {})
    return next
  }

  async function drawThumbnail(blob: Blob, size: number, own: boolean): Promise<ImageBitmap> {
    const current = thumbnailWorker()
    try {
      // On timeout the catch below terminates this worker; the next preview gets a fresh one.
      return await withTimeout(
        Promise.race([current.api.thumbnail(blob, size, own), current.crashed]),
        PREVIEW_BUDGET_MS,
        () => {},
      )
    } catch (error) {
      if (thumbnailHost === current) {
        current.stop()
        thumbnailHost = undefined
      }
      throw error
    }
  }

  /** What a file holds beside what it shows. Never throws: a file that cannot be read has none. */
  async function describe(blob: Blob, formatId: string): Promise<Detail[]> {
    const current = sideWorker()
    try {
      return await withTimeout(Promise.race([current.api.describe(blob, formatId), current.crashed]), PREVIEW_BUDGET_MS, () => stopSide(current))
    } catch {
      stopSide(current)
      return []
    }
  }

  /** Pack finished files into one ZIP, in the worker like everything else. */
  async function zip(files: Array<{ name: string; blob: Blob }>): Promise<Blob> {
    const current = sideWorker()
    try {
      return await withTimeout(Promise.race([current.api.zip(files), current.crashed]), ZIP_BUDGET_MS, () => stopSide(current))
    } catch (error) {
      stopSide(current)
      throw error
    }
  }

  /** Stop whatever the engine worker is doing. This is how a conversion is cancelled. */
  function terminate() {
    engineHost?.stop()
    engineHost = undefined
    loaded.value = []
  }

  return { info: engineInfo, availability, loaded, probe, convert, thumbnail, describe, zip, terminate }
}
