import { dimensionProblem } from '@omsett/registry'
import { vipsInfo } from '../info'
import type { ConvertInput, ConvertOutput, Engine, EngineInfo } from '../types'
import { outputName, qualityOption, throwIfAborted } from '../util'

/** The slice of the wasm-vips API this engine uses. */
export interface VipsImage {
  width: number
  height: number
  hasAlpha(): boolean
  flatten(options?: Record<string, unknown>): VipsImage
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

/**
 * libvips compiled to WebAssembly. The same code runs in a browser worker and in Node.
 * `info` says which libvips this is: plain, or with one of its optional modules.
 */
export function createVipsEngine(host: VipsHost, info: EngineInfo = vipsInfo): Engine {
  let loading: Promise<VipsModule> | undefined

  const ready = () => {
    loading ??= host.init().catch((error: unknown) => {
      loading = undefined
      throw error
    })
    return loading
  }

  return {
    ...info,

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
      let flat: VipsImage | undefined
      try {
        // libvips forgives damaged files by default and returns whatever it managed to read.
        // A converter must not hand back half a picture as if it were whole, so damage is fatal.
        image = vips.Image.newFromBuffer(bytes, '', { fail_on: 'error' })
        // The real size is known now, whatever the header claimed or the format left unsaid.
        if (input.maxPixels !== undefined && image.width * image.height > input.maxPixels) {
          throw new Error('The picture is too large')
        }
        const tooLarge = dimensionProblem(to, image.width, image.height)
        if (tooLarge) throw new Error(tooLarge)
        onProgress(0.4)
        // A format without transparency gets a white ground, as the warning on the tile says.
        if (image.hasAlpha() && !to.traits.includes('alpha')) {
          flat = image.flatten({ background: [255, 255, 255] })
        }
        // The registry's options, in libvips's names. "quality" is the one that is translated;
        // the rest (a TIFF's compression, say) are libvips's own words already.
        const { quality, ...rest } = input.options
        const encoded = (flat ?? image).writeToBuffer(`.${to.extensions[0]}`, {
          ...rest,
          ...(quality === undefined ? {} : { Q: qualityOption(input.options) }),
          // keep: 'none' leaves out EXIF, XMP and other metadata. Without it libvips copies
          // them into the output, and a photograph's location would travel with the file.
          keep: 'none',
        })
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
        flat?.delete()
        image?.delete()
      }
    },
  }
}
