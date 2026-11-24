import { layoutProblem, pictureOnly } from '@omsett/detect'
import { dimensionProblem, iconSidesFor, iconSizes } from '@omsett/registry'
import { magickInfo } from '../info'
import type { ConvertInput, ConvertOutput, Engine } from '../types'
import { outputName, Refusal, throwIfAborted } from '../util'

/** The slice of the magick-wasm API this engine uses. */
export interface MagickImage {
  readonly width: number
  readonly height: number
  readonly hasAlpha: boolean
  backgroundColor: unknown
  alpha(action: unknown): void
  strip(): void
  autoOrient(): void
  clone<T>(use: (copy: MagickImage) => T): T
  extent(width: number, height: number, gravity: unknown): void
  resize(width: number, height: number): void
  settings: { setDefine(name: string, value: string): void }
  write<T>(format: string, use: (data: Uint8Array) => T): T
}
export interface MagickApi {
  ImageMagick: {
    readCollection<T>(data: Uint8Array, format: string, use: (images: MagickImage[]) => T): T
  }
  /** ImageMagick's own limits. Set before every read, so that it refuses before it allocates. */
  ResourceLimits: { area: bigint; width: bigint; height: bigint; listLength: bigint; memory: bigint; disk: bigint }
  MagickFormat: Record<string, string>
  MagickColors: { White: unknown; Transparent: unknown }
  AlphaAction: { Remove: unknown; Set: unknown }
  Gravity: { Center: unknown }
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

const listed = (sizes: number[]) => (sizes.length > 1 ? `${sizes.slice(0, -1).join(', ')} and ${sizes.at(-1)}` : `${sizes[0]}`)

/**
 * Settings for ImageMagick's writer of one format, as the registry gives them: "dds:mipmaps" to
 * "0". Each is held to the shape of such a setting, and anything else is an error in the registry.
 */
function writerSettings(options: Record<string, unknown>): [string, string][] {
  const given = options.defines
  if (given === undefined) return []
  if (!given || typeof given !== 'object') throw new Error('Writer settings are not a list')
  return Object.entries(given).map(([name, value]) => {
    if (!/^[a-z0-9]+:[a-z-]+$/.test(name) || typeof value !== 'string' || !/^[a-z0-9]+$/.test(value)) throw new Error(`Not a writer setting: ${name}`)
    return [name, value]
  })
}

/** What a conversion's options say about the icon to make. Null where it makes none. */
interface IconPlan {
  sizes: number[]
  /** The format holds only the sizes it names. */
  exact: boolean
  /** A pointer: the point of the picture that does the clicking. */
  hotspot: [number, number] | null
  /** A Mac icon: the four-letter name each size is kept under. */
  names: Map<number, string> | null
}

function iconPlan(options: Record<string, unknown>): IconPlan | null {
  const sizes = iconSizes(options)
  if (!sizes) return null
  const spot = options.iconHotspot
  const hotspot = Array.isArray(spot) && spot.length === 2 && spot.every((n) => Number.isInteger(n) && n >= 0 && n < 16) ? (spot as [number, number]) : null
  const given = options.iconNames
  const names = new Map<number, string>()
  if (given && typeof given === 'object') {
    for (const [size, name] of Object.entries(given)) if (typeof name === 'string' && /^[a-z0-9]{4}$/.test(name)) names.set(Number(size), name)
  }
  if (names.size && !sizes.every((size) => names.has(size))) throw new Error('An icon size has no name')
  return { sizes, exact: options.iconExact === true, hotspot, names: names.size ? names : null }
}

/**
 * Make a picture into an icon's largest size: square, with clear margins where it was not.
 * Returns the sizes the icon is to hold, largest first, and what to tell the person.
 */
function asIcon(magick: MagickApi, image: MagickImage, plan: IconPlan): { held: number[]; note: string } {
  const longest = Math.max(image.width, image.height)
  const square = image.width === image.height
  const held = iconSidesFor(plan.sizes, image.width, image.height, plan.exact)
  if (!square) {
    // Clear margins on the short side, the picture in the middle. The ground is set on the
    // picture and not handed to `extent`, which paints the margins white when given the colour
    // itself. A test reads the margins back.
    image.alpha(magick.AlphaAction.Set)
    image.backgroundColor = magick.MagickColors.Transparent
    image.extent(longest, longest, magick.Gravity.Center)
  }
  if (held[0] !== longest) image.resize(held[0]!, held[0]!)
  const margins = square ? '' : ' The picture was not square, so it has been given clear margins.'
  const enlarged = held[0]! > longest ? ' The picture was smaller than this format can hold, so it has been made larger.' : ''
  return { held, note: `The file holds the picture at ${listed(held)} pixels.${margins}${enlarged}` }
}

/**
 * Windows keeps a pointer as an icon with two things changed: the number that says which it
 * is, and the clicking point, written where an icon's list gives its depth. ImageMagick writes
 * the icon; the two are set here.
 */
function asPointer(icon: Uint8Array, [x, y]: [number, number]): Uint8Array {
  const view = new DataView(icon.buffer, icon.byteOffset, icon.byteLength)
  view.setUint16(2, 2, true)
  for (let entry = 0; entry < view.getUint16(4, true); entry++) {
    view.setUint16(6 + entry * 16 + 4, x, true)
    view.setUint16(6 + entry * 16 + 6, y, true)
  }
  return icon
}

/** A Mac icon: its name, its whole length, and then each picture under its own name and length. */
function macIcon(pictures: { name: string; png: Uint8Array }[]): Uint8Array {
  const out = new Uint8Array(8 + pictures.reduce((total, picture) => total + 8 + picture.png.length, 0))
  const view = new DataView(out.buffer)
  const label = (at: number, name: string) => {
    for (let i = 0; i < 4; i++) out[at + i] = name.charCodeAt(i)
  }
  label(0, 'icns')
  view.setUint32(4, out.length)
  let at = 8
  for (const { name, png } of pictures) {
    label(at, name)
    view.setUint32(at + 4, 8 + png.length)
    out.set(png, at + 8)
    at += 8 + png.length
  }
  return out
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
      // ImageMagick reads some damaged files kindly: of a Photoshop file that stops halfway it
      // returns the half it found. Where a file's own lengths do not fit inside it, it is refused
      // before ImageMagick sees it.
      const damage = layoutProblem(from, bytes)
      if (damage) throw new Refusal(`This file is damaged: ${damage}`)
      // And where a file holds much beside its picture, ImageMagick is shown the picture alone.
      const shown = pictureOnly(from, bytes)

      const plan = iconPlan(input.options)
      const settings = writerSettings(input.options)
      let out: Uint8Array
      let note: string | undefined
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
        out = magick.ImageMagick.readCollection(shown, coder(magick, from.id), (images) => {
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
          // A camera held on its side writes the picture as the sensor lay and a note of which
          // way is up. The note is about to be left out with the rest, so the picture is turned
          // first.
          image.autoOrient()
          const icon = plan && asIcon(magick, image, plan)
          note = icon?.note
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
          if (icon && plan.names) {
            // Each size as a PNG of its own, from the largest, which the picture now is.
            const whole = image
            return macIcon(
              icon.held.map((size) => ({
                name: plan.names!.get(size)!,
                png: whole.clone((copy) => {
                  if (copy.width !== size) copy.resize(size, size)
                  return copy.write(coder(magick, 'png'), (data) => data.slice())
                }),
              })),
            )
          }
          for (const [name, value] of settings) image.settings.setDefine(name, value)
          if (icon && icon.held.length > 1) image.settings.setDefine('icon:auto-resize', icon.held.join(','))
          const written = image.write(coder(magick, to.id), (data) => data.slice())
          return icon && plan.hotspot ? asPointer(written, plan.hotspot) : written
        })
      } catch (error) {
        // Our own refusals keep their wording; ImageMagick's are wrapped in one that names the file.
        if (error instanceof RangeError) throw error
        throw new Error(`ImageMagick could not convert ${input.name}`, { cause: error })
      }
      throwIfAborted(signal)
      onProgress(1)
      return [{ name: outputName(input.name, to), format: to.id, blob: new Blob([out as BlobPart], { type: to.mime[0] }), ...(note ? { note } : {}) }]
    },
  }
}
