import { createVipsEngine, type VipsModule } from './vips'
import type { Engine } from './types'

/** Engines that run in Node, called in-process: the fixture tests now, the CLI in Phase 3. */
export function createNodeEngines(): Record<string, Engine> {
  const vips = createVipsEngine({
    available: async () => true,
    async init() {
      const { default: Vips } = await import('wasm-vips')
      // No optional codec libraries: Phase 0 needs none of them.
      return (await Vips({ dynamicLibraries: [] })) as unknown as VipsModule
    },
  })
  return { [vips.id]: vips }
}
