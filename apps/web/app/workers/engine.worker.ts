// The Comlink host for packages/engines. Every conversion in the browser happens here,
// off the main thread; a hostile file can at worst kill this worker.
import {
  createCanvasEngine,
  createVipsEngine,
  type ConvertOutput,
  type Engine,
  type VipsModule,
} from '@omsett/engines'
import { formatById, registry, type Format } from '@omsett/registry'
import * as Comlink from 'comlink'
import assets from '../generated/engine-assets.json'

async function sha256(buffer: ArrayBuffer): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))
  return [...digest].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Fetch libvips from this origin, check it is the file the build shipped, then start it. */
async function loadVips(): Promise<VipsModule> {
  const { script, wasm } = assets.vips
  const response = await fetch(wasm.url)
  if (!response.ok) throw new Error(`Could not fetch ${wasm.url}: ${response.status}`)
  const binary = await response.arrayBuffer()
  if ((await sha256(binary)) !== wasm.sha256) throw new Error('Engine file failed its integrity check')

  const scriptUrl = new URL(script.url, self.location.origin).href
  const { default: Vips } = (await import(/* @vite-ignore */ scriptUrl)) as {
    default: (options: Record<string, unknown>) => Promise<VipsModule>
  }
  return Vips({
    // Instantiate the bytes that were just verified, rather than letting the loader fetch its own.
    instantiateWasm(imports: WebAssembly.Imports, done: (instance: WebAssembly.Instance, module: WebAssembly.Module) => void) {
      void WebAssembly.instantiate(binary, imports).then(({ instance, module }) => done(instance, module))
      return {}
    },
    // Thread workers are started from this same-origin, content-hashed script.
    mainScriptUrlOrBlob: scriptUrl,
    // No optional codec libraries: Phase 0 needs none of them.
    dynamicLibraries: [],
  })
}

const engines: Record<string, Engine> = Object.fromEntries(
  [
    createCanvasEngine(),
    createVipsEngine({
      init: loadVips,
      // Threads need SharedArrayBuffer, which needs cross-origin isolation (and so HTTPS).
      available: async () => self.crossOriginIsolated === true && typeof SharedArrayBuffer !== 'undefined',
    }),
  ].map((engine) => [engine.id, engine]),
)

export interface ConvertRequest {
  blob: Blob
  name: string
  from: Format
  to: Format
  options: Record<string, unknown>
  maxPixels: number
}

const api = {
  /**
   * What this browser can run. Keyed by engine id, and by "engine>format" for each format the
   * registry says that engine writes, since a browser may encode one format and not another.
   */
  async availability(): Promise<Record<string, boolean>> {
    const answers: Record<string, boolean> = {}
    for (const capability of registry.capabilities) {
      const engine = engines[capability.engine]
      if (!engine) continue
      answers[engine.id] = await engine.available().catch(() => false)
      for (const write of capability.writes) {
        const target = formatById(registry, write.format)
        answers[`${engine.id}>${write.format}`] =
          answers[engine.id] === true && (await engine.available(target).catch(() => false))
      }
    }
    return answers
  },

  async load(id: string): Promise<void> {
    await engines[id]?.load()
  },

  async convert(
    id: string,
    request: ConvertRequest,
    onProgress: (fraction: number) => void,
  ): Promise<ConvertOutput[]> {
    const engine = engines[id]
    if (!engine) throw new Error(`Unknown engine: ${id}`)
    // Cancellation is the page terminating this worker; nothing here can outlive it.
    return engine.convert({ ...request, signal: new AbortController().signal, onProgress })
  },
}

export type EngineWorkerApi = typeof api

Comlink.expose(api)
