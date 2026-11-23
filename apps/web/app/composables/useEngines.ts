import { engineInfo, type ConvertOutput } from '@omsett/engines'
import * as Comlink from 'comlink'
import { PREVIEW_BUDGET_MS, withTimeout } from '~/utils/limits'
import type { ConvertRequest, EngineWorkerApi } from '~/workers/engine.worker'
import type { ThumbnailWorkerApi } from '~/workers/thumbnail.worker'

interface Hosted<T> {
  worker: Worker
  api: Comlink.Remote<T>
  crashed: Promise<never>
}

function host<T>(create: () => Worker): Hosted<T> {
  const worker = create()
  // Comlink never settles a call whose worker died, so a crash is surfaced as a rejection.
  const crashed = new Promise<never>((_, reject) => {
    worker.addEventListener('error', (event) => reject(new Error(event.message || 'The worker crashed')))
    worker.addEventListener('messageerror', () => reject(new Error('The worker sent unreadable data')))
  })
  crashed.catch(() => {})
  return { worker, api: Comlink.wrap<T>(worker), crashed }
}

let engineHost: Hosted<EngineWorkerApi> | undefined
let thumbnailHost: Hosted<ThumbnailWorkerApi> | undefined

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

  async function thumbnail(blob: Blob, size: number): Promise<ImageBitmap> {
    const current = thumbnailWorker()
    try {
      // On timeout the catch below terminates this worker; the next preview gets a fresh one.
      return await withTimeout(
        Promise.race([current.api.thumbnail(blob, size), current.crashed]),
        PREVIEW_BUDGET_MS,
        () => {},
      )
    } catch (error) {
      if (thumbnailHost === current) {
        current.worker.terminate()
        thumbnailHost = undefined
      }
      throw error
    }
  }

  /** Pack finished files into one ZIP, in the worker like everything else. */
  async function zip(files: Array<{ name: string; blob: Blob }>): Promise<Blob> {
    const current = engineWorker()
    return Promise.race([current.api.zip(files), current.crashed])
  }

  /** Stop whatever the engine worker is doing. This is how a conversion is cancelled. */
  function terminate() {
    engineHost?.worker.terminate()
    engineHost = undefined
    loaded.value = []
  }

  return { info: engineInfo, availability, loaded, probe, convert, thumbnail, zip, terminate }
}
