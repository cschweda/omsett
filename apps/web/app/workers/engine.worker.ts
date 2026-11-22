// The Comlink host for packages/engines. Every conversion in the browser happens here,
// off the main thread; a hostile file can at worst kill this worker.
import {
  createCanvasEngine,
  createVipsEngine,
  engineInfo,
  vipsModules,
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

/** Fetch a file from this origin and check it is the one the build shipped. */
async function verified(asset: { url: string; sha256: string }): Promise<ArrayBuffer> {
  const response = await fetch(asset.url)
  if (!response.ok) throw new Error(`Could not fetch ${asset.url}: ${response.status}`)
  const bytes = await response.arrayBuffer()
  if ((await sha256(bytes)) !== asset.sha256) throw new Error('Engine file failed its integrity check')
  return bytes
}

/**
 * Start libvips, with any of its optional modules. Every file is fetched from this origin and
 * checked against the hash recorded at build time before a byte of it runs.
 */
async function loadVips(moduleNames: string[]): Promise<VipsModule> {
  const { script, wasm, modules } = assets.vips
  const binary = await verified(wasm)

  // libvips asks for a module by name. It is handed the verified bytes, as a local address.
  const local: Record<string, string> = {}
  for (const name of moduleNames) {
    const asset = (modules as Record<string, { url: string; sha256: string }>)[name]
    if (!asset) throw new Error(`Unknown libvips module: ${name}`)
    local[name] = URL.createObjectURL(new Blob([await verified(asset)], { type: 'application/wasm' }))
  }

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
    locateFile: (file: string) => local[file] ?? new URL(`/engines/${file}`, self.location.origin).href,
    // Thread workers are started from this same-origin, content-hashed script.
    mainScriptUrlOrBlob: scriptUrl,
    dynamicLibraries: moduleNames,
  })
}

// Threads need SharedArrayBuffer, which needs cross-origin isolation (and so HTTPS).
const threadsAvailable = async () => self.crossOriginIsolated === true && typeof SharedArrayBuffer !== 'undefined'

const engines: Record<string, Engine> = Object.fromEntries(
  [
    createCanvasEngine(),
    // Plain libvips, and libvips with each optional module. Each starts only when first needed.
    ...Object.entries(vipsModules).map(([id, modules]) =>
      createVipsEngine({ init: () => loadVips(modules), available: threadsAvailable }, engineInfo[id]),
    ),
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
