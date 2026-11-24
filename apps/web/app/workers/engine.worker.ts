// The Comlink host for packages/engines. Every conversion in the browser happens here,
// off the main thread; a hostile file can at worst kill this worker.
import {
  createCanvasEngine,
  createDataEngine,
  createSubtitleEngine,
  createMarkupEngine,
  createArchiveEngine,
  createScriptEngine,
  createPdfEngine,
  describeFile,
  listSheets,
  zipFiles,
  createFontEngine,
  createIconEngine,
  createFontWoff2Engine,
  createHeifEngine,
  createMagickEngine,
  createResvgEngine,
  createVipsEngine,
  engineInfo,
  vipsModules,
  type ConvertOutput,
  type Detail,
  type Engine,
  type HeifModule,
  type MagickApi,
  type ResvgHost,
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
 * checked against the hash recorded at build time. The WebAssembly is run from the very bytes
 * that were checked. The script that loads it has to be imported by its address (a worker's
 * policy lets it run scripts from this origin and from nowhere else, a blob included), so it
 * is checked and then imported: the check catches a file that is wrong, not a server that
 * answers the second request differently from the first.
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

  await verified(script)
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

/**
 * Start libheif. Its loader is an ordinary script, not a module, so the verified text is run
 * here directly; the worker's policy allows that for exactly this kind of engine, and nothing
 * runs that did not match its recorded hash.
 */
async function loadHeif(): Promise<HeifModule> {
  const [script, wasmBinary] = await Promise.all([verified(assets.heif.script), verified(assets.heif.wasm)])
  const text = new TextDecoder().decode(script)
  const factory = new Function(`${text}\n;return libheif`)() as (options: object) => HeifModule
  return factory({ wasmBinary })
}

/** Start resvg from its verified binary. Its small loader is part of this worker's own code. */
async function loadResvg() {
  const [resvg, wasm] = await Promise.all([import('@resvg/resvg-wasm'), verified(assets.resvg.wasm)])
  await resvg.initWasm(wasm)
  return resvg.Resvg as unknown as Awaited<ReturnType<ResvgHost['init']>>
}
const resvgFonts = () => Promise.all(assets.resvg.fonts.map(async (font) => new Uint8Array(await verified(font))))

/** Start ImageMagick from its verified binary. Its loader is part of this worker's own code. */
async function loadMagick() {
  const [magick, wasm] = await Promise.all([import('@imagemagick/magick-wasm'), verified(assets.magick.wasm)])
  await magick.initializeImageMagick(new Uint8Array(wasm))
  return magick as unknown as MagickApi
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
    createHeifEngine({ init: loadHeif }),
    createResvgEngine({ init: loadResvg, fonts: resvgFonts }),
    createMagickEngine({ init: loadMagick }),
    createDataEngine(),
    createSubtitleEngine(),
    createMarkupEngine(),
    createArchiveEngine(),
    createScriptEngine(),
    createPdfEngine(),
    createIconEngine(),
    createFontEngine(),
    createFontWoff2Engine(),
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

  /** What a file holds beside what it shows: who made it, when, with what. Read here, never on the page. */
  async describe(blob: Blob, formatId: string): Promise<Detail[]> {
    const format = formatById(registry, formatId)
    return format ? describeFile(blob, format) : []
  },

  /** The names of a workbook's sheets, as its tabs show them. None for a file that has no sheets. */
  async sheets(blob: Blob): Promise<string[]> {
    if (blob.size > 64 * 1024 * 1024) return []
    return listSheets(new Uint8Array(await blob.arrayBuffer()))
  },

  /** Several finished files → one ZIP, so a batch can be downloaded in one go. */
  async zip(files: Array<{ name: string; blob: Blob }>): Promise<Blob> {
    const read = await Promise.all(
      files.map(async (file) => ({ name: file.name, data: new Uint8Array(await file.blob.arrayBuffer()) })),
    )
    return new Blob([(await zipFiles(read)) as BlobPart], { type: 'application/zip' })
  },
}

export type EngineWorkerApi = typeof api

Comlink.expose(api)
