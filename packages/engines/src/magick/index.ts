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
  MagickFormat: Record<string, string>
  MagickColors: { White: unknown }
  AlphaAction: { Remove: unknown }
}
export interface MagickHost {
  /** Fetch and start ImageMagick. Called once; how is the host's business. */
  init(): Promise<MagickApi>
}

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
        out = magick.ImageMagick.readCollection(bytes, coder(magick, from.id), (images) => {
          // A file may hold several pictures: an icon at several sizes, or a Photoshop file's
          // merged picture followed by its layers. The largest is taken, and the first of equals.
          let image: MagickImage | undefined
          for (const candidate of images) {
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
