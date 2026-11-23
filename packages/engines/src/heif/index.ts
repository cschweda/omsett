import { dimensionProblem } from '@omsett/registry'
import { heifInfo } from '../info'
import { encodePng } from '../png-encode'
import type { ConvertInput, ConvertOutput, Engine } from '../types'
import { outputName, throwIfAborted } from '../util'

/** The slice of the libheif-js API this engine uses. */
export interface HeifImage {
  get_width(): number
  get_height(): number
  /** Whether this is the picture the file names as the one to show. */
  is_primary?(): boolean
  display(
    target: { data: Uint8ClampedArray; width: number; height: number },
    done: (result: { data: Uint8ClampedArray } | null | undefined) => void,
  ): void
  free(): void
}
export interface HeifModule {
  HeifDecoder: new () => { decode(bytes: Uint8Array): HeifImage[] }
}
export interface HeifHost {
  /** Fetch and start libheif. Called once; how is the host's business. */
  init(): Promise<HeifModule>
}

/**
 * libheif with the libde265 decoder, compiled to WebAssembly: it reads HEIC, which nothing else
 * here can. It decodes to plain pixels and writes them as a PNG; other engines take it from
 * there. The same code runs in a browser worker and in Node.
 */
export function createHeifEngine(host: HeifHost): Engine {
  let loading: Promise<HeifModule> | undefined
  const ready = () => {
    loading ??= host.init().catch((error: unknown) => {
      loading = undefined
      throw error
    })
    return loading
  }

  return {
    ...heifInfo,

    available: async () => typeof WebAssembly !== 'undefined' && typeof CompressionStream !== 'undefined',

    async load() {
      await ready()
    },

    async convert(input: ConvertInput): Promise<ConvertOutput[]> {
      const { blob, to, signal, onProgress } = input
      throwIfAborted(signal)
      const heif = await ready()
      onProgress(0.2)
      const bytes = new Uint8Array(await blob.arrayBuffer())
      throwIfAborted(signal)

      let images: HeifImage[] = []
      try {
        // A file libheif cannot parse comes back as an empty list, not an exception.
        images = new heif.HeifDecoder().decode(bytes)
        // A file may hold several pictures and names one as the one to show. That one is
        // converted, wherever in the file it is; the first, where the file names none.
        const image = images.find((candidate) => candidate.is_primary?.()) ?? images[0]
        if (!image) throw new Error(`libheif could not read ${input.name}`)
        const width = image.get_width()
        const height = image.get_height()
        if (!(width > 0 && height > 0)) throw new Error(`libheif could not read ${input.name}`)
        if (input.maxPixels !== undefined && width * height > input.maxPixels) {
          throw new Error('The picture is too large')
        }
        const tooLarge = dimensionProblem(to, width, height)
        if (tooLarge) throw new Error(tooLarge)
        onProgress(0.3)

        // A picture that cannot be decoded in full comes back as nothing at all.
        const pixels = await new Promise<Uint8ClampedArray | null>((resolve) => {
          image.display({ data: new Uint8ClampedArray(width * height * 4), width, height }, (result) =>
            resolve(result?.data ?? null),
          )
        })
        if (!pixels) throw new Error(`libheif could not decode ${input.name}`)
        throwIfAborted(signal)
        onProgress(0.7)

        const out = await encodePng(pixels, width, height)
        throwIfAborted(signal)
        onProgress(1)
        return [{ name: outputName(input.name, to), format: to.id, blob: out }]
      } finally {
        for (const image of images) image.free()
      }
    },
  }
}
