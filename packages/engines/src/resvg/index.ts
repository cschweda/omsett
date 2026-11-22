import { gunzip } from '@omsett/detect'
import { dimensionProblem } from '@omsett/registry'
import { resvgInfo } from '../info'
import type { ConvertInput, ConvertOutput, Engine } from '../types'
import { outputName, throwIfAborted } from '../util'

/** The slice of the resvg API this engine uses. */
export interface ResvgRenderer {
  readonly width: number
  readonly height: number
  render(): { asPng(): Uint8Array; free(): void }
  free(): void
}
export interface ResvgHost {
  /** Fetch and start resvg, and return its renderer class. Called once. */
  init(): Promise<new (svg: Uint8Array, options: Record<string, unknown>) => ResvgRenderer>
  /** The typefaces text is drawn in. There are no others: a browser tab cannot lend its fonts. */
  fonts(): Promise<Uint8Array[]>
}

/** The most an SVGZ may unpack to. Real drawings are a small fraction of this. */
const MAX_SVG_BYTES = 64 * 1024 * 1024

/** The family name inside the font files the host supplies. */
const FAMILY = 'Inter'

/**
 * resvg, compiled to WebAssembly: it draws an SVG and returns a PNG. It runs no script, follows
 * no link, and fetches nothing: a picture the file points to elsewhere is simply left out.
 */
export function createResvgEngine(host: ResvgHost): Engine {
  let loading: ReturnType<typeof start> | undefined
  const start = async () => {
    const [Renderer, fontBuffers] = await Promise.all([host.init(), host.fonts()])
    return { Renderer, fontBuffers }
  }
  const ready = () => {
    loading ??= start().catch((error: unknown) => {
      loading = undefined
      throw error
    })
    return loading
  }

  return {
    ...resvgInfo,

    available: async () => typeof WebAssembly !== 'undefined',

    async load() {
      await ready()
    },

    async convert(input: ConvertInput): Promise<ConvertOutput[]> {
      const { blob, to, signal, onProgress } = input
      throwIfAborted(signal)
      const { Renderer, fontBuffers } = await ready()
      onProgress(0.2)
      let bytes: Uint8Array = new Uint8Array(await blob.arrayBuffer())
      // An SVGZ is inflated here, with a limit, so the renderer is never handed a file that
      // unpacks to more than it should.
      if (bytes[0] === 0x1F && bytes[1] === 0x8B) {
        const inflated = await gunzip(blob, MAX_SVG_BYTES + 1)
        if (!inflated.complete) {
          throw new Error(inflated.bytes.length > MAX_SVG_BYTES ? 'The drawing is too large' : `resvg could not read ${input.name}`)
        }
        bytes = inflated.bytes
      }
      throwIfAborted(signal)

      let renderer: ResvgRenderer | undefined
      try {
        try {
          renderer = new Renderer(bytes, {
            font: {
              fontBuffers,
              loadSystemFonts: false,
              // Whatever family the file asks for, this is what there is.
              defaultFontFamily: FAMILY,
              sansSerifFamily: FAMILY,
              serifFamily: FAMILY,
              monospaceFamily: FAMILY,
              cursiveFamily: FAMILY,
              fantasyFamily: FAMILY,
            },
          })
        } catch (error) {
          throw new Error(`resvg could not read ${input.name}`, { cause: error })
        }
        const width = Math.ceil(renderer.width)
        const height = Math.ceil(renderer.height)
        if (!(width > 0 && height > 0)) throw new Error(`resvg could not read ${input.name}`)
        // Checked before drawing: an SVG can state any size it likes in a few bytes.
        if (input.maxPixels !== undefined && width * height > input.maxPixels) {
          throw new Error('The picture is too large')
        }
        const tooLarge = dimensionProblem(to, width, height)
        if (tooLarge) throw new Error(tooLarge)
        onProgress(0.4)

        const image = renderer.render()
        let png: Uint8Array
        try {
          png = image.asPng()
        } finally {
          image.free()
        }
        throwIfAborted(signal)
        onProgress(1)
        return [{ name: outputName(input.name, to), format: to.id, blob: new Blob([png as BlobPart], { type: 'image/png' }) }]
      } finally {
        renderer?.free()
      }
    },
  }
}
