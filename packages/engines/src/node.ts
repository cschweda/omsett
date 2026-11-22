import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { createHeifEngine, type HeifModule } from './heif'
import { engineInfo, vipsModules } from './info'
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
  return engines
}
