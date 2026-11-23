import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { createDataEngine } from './data'
import { createSubtitleEngine } from './subtitle'
import { createMarkupEngine } from './markup'
import { createFontEngine, createFontWoff2Engine } from './font'
import { createArchiveEngine } from './archive'
import { createScriptEngine } from './script'
import { createHeifEngine, type HeifModule } from './heif'
import { engineInfo, resvgFonts, vipsModules } from './info'
import { createResvgEngine, type ResvgHost } from './resvg'
import { createMagickEngine, type MagickApi } from './magick'
import { createVipsEngine, type VipsModule } from './vips'
import type { Engine } from './types'

/** Engines that run in Node, called in-process: the fixture tests now, the CLI in Phase 3. */
export function createNodeEngines(): Record<string, Engine> {
  const engines: Record<string, Engine> = {}
  // Plain libvips, and libvips with each optional module: one instance apiece, started on demand.
  for (const [id, modules] of Object.entries(vipsModules)) {
    engines[id] = createVipsEngine(
      {
        available: async () => true,
        async init() {
          const { default: Vips } = await import('wasm-vips')
          return (await Vips({ dynamicLibraries: modules })) as unknown as VipsModule
        },
      },
      engineInfo[id],
    )
  }
  const require = createRequire(import.meta.url)
  engines.heif = createHeifEngine({
    async init() {
      const factory = require('libheif-js/libheif-wasm/libheif.js') as (options: object) => HeifModule
      const wasmBinary = await readFile(require.resolve('libheif-js/libheif-wasm/libheif.wasm'))
      return factory({ wasmBinary })
    },
  })
  engines.magick = createMagickEngine({
    async init() {
      const magick = await import('@imagemagick/magick-wasm')
      await magick.initializeImageMagick(await readFile(require.resolve('@imagemagick/magick-wasm/magick.wasm')))
      return magick as unknown as MagickApi
    },
  })
  engines.resvg = createResvgEngine({
    async init() {
      const resvg = require('@resvg/resvg-wasm') as {
        initWasm(wasm: Uint8Array): Promise<void>
        Resvg: Awaited<ReturnType<ResvgHost['init']>>
      }
      await resvg.initWasm(await readFile(require.resolve('@resvg/resvg-wasm/index_bg.wasm')))
      return resvg.Resvg
    },
    fonts: () =>
      Promise.all(resvgFonts.map(async (file) => new Uint8Array(await readFile(require.resolve(`@fontsource/inter/files/${file}`))))),
  })
  engines.data = createDataEngine()
  engines.subtitle = createSubtitleEngine()
  engines.markup = createMarkupEngine()
  engines.archive = createArchiveEngine()
  engines.script = createScriptEngine()
  engines.font = createFontEngine()
  engines['font-woff2'] = createFontWoff2Engine()
  return engines
}
