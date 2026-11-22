import { vipsInfo } from '../info'
import type { ConvertInput, ConvertOutput, Engine } from '../types'
import { outputName, qualityOption, throwIfAborted } from '../util'

/** The slice of the wasm-vips API this engine uses. */
export interface VipsImage {
  width: number
  height: number
  writeToBuffer(suffix: string, options?: Record<string, unknown>): Uint8Array
  delete(): void
}
export interface VipsModule {
  Image: {
    newFromBuffer(data: Uint8Array, stringOptions?: string, options?: Record<string, unknown>): VipsImage
  }
}

export interface VipsHost {
  /** Fetch and instantiate libvips. Called once; how is the host's business (URL or node_modules). */
  init(): Promise<VipsModule>
  /** Whether this runtime can run it at all (threads need cross-origin isolation in a browser). */
  available(): Promise<boolean>
}

/** libvips compiled to WebAssembly. The same code runs in a browser worker and in Node. */
export function createVipsEngine(host: VipsHost): Engine {
  let loading: Promise<VipsModule> | undefined

  const ready = () => {
    loading ??= host.init().catch((error: unknown) => {
      loading = undefined
      throw error
    })
    return loading
  }

  return {
    ...vipsInfo,

    available: () => host.available(),

    async load() {
      await ready()
    },

    async convert(input: ConvertInput): Promise<ConvertOutput[]> {
      const { blob, to, signal, onProgress } = input
      throwIfAborted(signal)
      const vips = await ready()
      onProgress(0.2)
      const bytes = new Uint8Array(await blob.arrayBuffer())
      throwIfAborted(signal)
      let image: VipsImage | undefined
      try {
        // libvips forgives damaged files by default and returns whatever it managed to read.
        // A converter must not hand back half a picture as if it were whole, so damage is fatal.
        image = vips.Image.newFromBuffer(bytes, '', { fail_on: 'error' })
        onProgress(0.4)
        const encoded = image.writeToBuffer(`.${to.extensions[0]}`, { Q: qualityOption(input.options) })
        throwIfAborted(signal)
        onProgress(1)
        // Copy out of the WASM heap: the view is only valid until the next allocation.
        const out = new Blob([encoded.slice()], { type: to.mime[0] })
        return [{ name: outputName(input.name, to), format: to.id, blob: out }]
      } catch (error) {
        // Some libvips failures surface as a raw WebAssembly exception, which is not an Error
        // and cannot cross a worker boundary. Every failure leaves here as an ordinary Error.
        if (error instanceof Error) throw error
        throw new Error(`libvips could not convert ${input.name}`, { cause: error })
      } finally {
        image?.delete()
      }
    },
  }
}
