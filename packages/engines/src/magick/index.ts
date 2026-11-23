import { dimensionProblem } from '@omsett/registry'
import { magickInfo } from '../info'
import type { ConvertInput, ConvertOutput, Engine } from '../types'
import { outputName, throwIfAborted } from '../util'

/** The slice of the magick-wasm API this engine uses. */
export interface MagickImage {
  readonly width: number
  readonly height: number
  readonly hasAlpha: boolean
  backgroundColor: unknown
  alpha(action: unknown): void
  strip(): void
  write<T>(format: string, use: (data: Uint8Array) => T): T
}
export interface MagickApi {
  ImageMagick: {
    readCollection<T>(data: Uint8Array, format: string, use: (images: MagickImage[]) => T): T
  }
  /** ImageMagick's own limits. Set before every read, so that it refuses before it allocates. */
  ResourceLimits: { area: bigint; width: bigint; height: bigint; listLength: bigint; memory: bigint; disk: bigint }
  MagickFormat: Record<string, string>
  MagickColors: { White: unknown }
  AlphaAction: { Remove: unknown }
}
export interface MagickHost {
  /** Fetch and start ImageMagick. Called once; how is the host's business. */
  init(): Promise<MagickApi>
}

/** The longest side ImageMagick is allowed to read. */
const MAX_SIDE = 65_535
/** The most pictures one file may hold: an icon has a handful, a layered file some dozens. */
const MAX_PICTURES = 256
/** The most memory ImageMagick may ask for. Past it, it refuses; it is never given a disk. */
const MAX_MEMORY = 3 * 1024 * 1024 * 1024

/**
 * ImageMagick compiled to WebAssembly, for the formats nothing else here reads. A file is
 * always read as the one format it was identified as: ImageMagick is never left to guess,
 * because some of what it can guess its way into (scripts, drawings that name other files)
 * is not a picture at all.
 */
export function createMagickEngine(host: MagickHost): Engine {
  let loading: Promise<MagickApi> | undefined
  const ready = () => {
    loading ??= host.init().catch((error: unknown) => {
      loading = undefined
      throw error
    })
    return loading
  }

  /** ImageMagick's name for a registered format: its id, in capitals. Checked, never assumed. */
  function coder(magick: MagickApi, id: string): string {
    const name = id.toUpperCase()
    if (!Object.values(magick.MagickFormat).includes(name)) throw new Error(`ImageMagick has no ${name} coder`)
    return name
  }

  return {
    ...magickInfo,

    available: async () => typeof WebAssembly !== 'undefined',

    async load() {
      await ready()
    },

    async convert(input: ConvertInput): Promise<ConvertOutput[]> {
      const { blob, from, to, signal, onProgress } = input
      throwIfAborted(signal)
      const magick = await ready()
      onProgress(0.2)
      const bytes = new Uint8Array(await blob.arrayBuffer())
      throwIfAborted(signal)

      let out: Uint8Array
      try {
        // What a file says about its size up front and what its pictures really are can be two
        // things: an icon lists 16 by 16 and holds a picture of 20,000; a file of two hundred
        // thousand one-pixel pictures is "1 by 1". ImageMagick is told the limits itself, so
        // that it stops at the first picture too big or the list too long, before it has made
        // room for them, and not after.
        const most = BigInt(input.maxPixels ?? MAX_SIDE * MAX_SIDE)
        magick.ResourceLimits.width = BigInt(MAX_SIDE)
        magick.ResourceLimits.height = BigInt(MAX_SIDE)
        magick.ResourceLimits.area = most
        magick.ResourceLimits.listLength = BigInt(MAX_PICTURES)
        magick.ResourceLimits.memory = BigInt(MAX_MEMORY)
        // Nothing is ever put on a disk: there is none, and what stands in for one is memory.
        magick.ResourceLimits.disk = 0n
        out = magick.ImageMagick.readCollection(bytes, coder(magick, from.id), (images) => {
          // A file may hold several pictures. A layered file (Photoshop's) holds the finished
          // picture first and then each layer, some of them hidden and some larger than the
          // picture: the finished picture is the one to convert. An icon holds one picture at
          // several sizes: the largest is taken, and the first of equals.
          let image: MagickImage | undefined = from.traits.includes('layers') ? images[0] : undefined
          for (const candidate of image ? [] : images) {
            if (!image || candidate.width * candidate.height > image.width * image.height) image = candidate
          }
          if (!image || !(image.width > 0 && image.height > 0)) throw new Error('No picture in the file')
          if (input.maxPixels !== undefined && image.width * image.height > input.maxPixels) {
            throw new RangeError('The picture is too large')
          }
          const tooLarge = dimensionProblem(to, image.width, image.height)
          if (tooLarge) throw new RangeError(tooLarge)
          onProgress(0.6)
          // Author, location, colour profiles and comments are left out, as every engine does.
          image.strip()
          // A format without transparency gets a white ground.
          if (image.hasAlpha && !to.traits.includes('alpha')) {
            image.backgroundColor = magick.MagickColors.White
            image.alpha(magick.AlphaAction.Remove)
          }
          return image.write(coder(magick, to.id), (data) => data.slice())
        })
      } catch (error) {
        // Our own refusals keep their wording; ImageMagick's are wrapped in one that names the file.
        if (error instanceof RangeError) throw error
        throw new Error(`ImageMagick could not convert ${input.name}`, { cause: error })
      }
      throwIfAborted(signal)
      onProgress(1)
      return [{ name: outputName(input.name, to), format: to.id, blob: new Blob([out as BlobPart], { type: to.mime[0] }) }]
    },
  }
}
