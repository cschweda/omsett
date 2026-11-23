import { detect, gunzip, pixelCount } from '@omsett/detect'
import { dimensionProblem, registry } from '@omsett/registry'
import { resvgInfo } from '../info'
import type { ConvertInput, ConvertOutput, Engine } from '../types'
import { outputName, Refusal, throwIfAborted } from '../util'

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

// What a drawing may ask for. An SVG states its own size in a few bytes, and that is checked;
// but what it costs to draw is set by what is inside it, and none of this is in its size.

/** How deep a drawing may hold a drawing that holds a drawing, each as a picture inside the last. */
const MAX_NESTED = 3
/** The most pictures a drawing may carry inside itself. */
const MAX_EMBEDDED = 200
/** The most text, in characters. Laying text out slows sharply with its length. */
const MAX_TEXT = 50_000
/** The most layers of noise a filter may add up; each is a pass over the whole picture. */
const MAX_OCTAVES = 16
/** The furthest, in pixels, a filter may spread each pixel; and the widest grid it may weigh. */
const MAX_RADIUS = 64
const MAX_KERNEL = 9
/** How deep a pattern may be filled with a pattern filled with a pattern. Each level multiplies the work. */
const MAX_PATTERNS_DEEP = 4

const tooCostly = () => new Refusal('This drawing asks for more work than Omsett will do to draw it')
const tooLargeInside = () => new Refusal('This drawing holds a picture too large to convert in a browser')

const fromBase64 = (text: string, most: number): Uint8Array => {
  const clean = text.slice(0, Math.ceil(most / 3) * 4 + 64).replace(/\s+/g, '')
  const whole = clean.slice(0, clean.length - (clean.length % 4))
  try {
    return Uint8Array.from(atob(whole), (char) => char.codePointAt(0)!)
  } catch {
    return new Uint8Array()
  }
}

/**
 * Looks through a drawing for what would cost far more to draw than its size suggests, and
 * refuses it. Returns the pixels of every picture carried inside it, so the caller can hold
 * their sum to the same limit as any other picture.
 */
async function embeddedPixels(svg: string, depth: number, count: { pictures: number }): Promise<number> {
  if (depth > MAX_NESTED) throw tooCostly()

  for (const [, value] of svg.matchAll(/\bnumOctaves\s*=\s*["']([^"']*)["']/gi)) {
    if (!(Number(value) <= MAX_OCTAVES)) throw tooCostly()
  }
  for (const [tag] of svg.matchAll(/<(?:[a-z]+:)?feMorphology\b[^>]*>/gi)) {
    const radius = /\bradius\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1] ?? '0'
    if (radius.trim().split(/[\s,]+/).some((part) => !(Number(part) <= MAX_RADIUS))) throw tooCostly()
  }
  for (const [tag] of svg.matchAll(/<(?:[a-z]+:)?feConvolveMatrix\b[^>]*>/gi)) {
    const order = /\border\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1] ?? '3'
    if (order.trim().split(/[\s,]+/).some((part) => !(Number(part) <= MAX_KERNEL))) throw tooCostly()
  }

  // Patterns filled with patterns: each tile of one draws every tile of the next.
  const inside = new Map<string, string[]>()
  for (let at = svg.search(/<(?:[a-z]+:)?pattern\b/i); at >= 0; ) {
    const open = svg.indexOf('>', at)
    const close = open < 0 ? -1 : svg.indexOf('</', open)
    const end = close < 0 ? svg.length : svg.indexOf('pattern>', close)
    const id = open < 0 ? undefined : /\bid\s*=\s*["']([^"']*)["']/i.exec(svg.slice(at, open))?.[1]
    const body = svg.slice(open < 0 ? at : open, end < 0 ? svg.length : end)
    if (id !== undefined) inside.set(id, [...body.matchAll(/url\(\s*["']?#([^"')\s]+)/gi)].map((found) => found[1]!))
    const next = svg.slice(at + 1).search(/<(?:[a-z]+:)?pattern\b/i)
    at = next < 0 ? -1 : at + 1 + next
    if (inside.size > 10_000) throw tooCostly()
  }
  const levels = new Map<string, number>()
  const level = (id: string, seen: Set<string>): number => {
    if (levels.has(id)) return levels.get(id)!
    // A pattern that leads back to itself is drawn by no renderer; counted as too deep.
    if (seen.has(id) || seen.size > MAX_PATTERNS_DEEP) return MAX_PATTERNS_DEEP + 1
    seen.add(id)
    let most = 1
    for (const used of inside.get(id) ?? []) if (inside.has(used)) most = Math.max(most, 1 + level(used, seen))
    seen.delete(id)
    levels.set(id, most)
    return most
  }
  for (const id of inside.keys()) if (level(id, new Set()) > MAX_PATTERNS_DEEP) throw tooCostly()

  // Text: what is inside <text>, however it is divided into spans.
  let text = 0
  let inText = false
  for (let at = svg.indexOf('<'); at >= 0; ) {
    const close = svg.indexOf('>', at)
    if (close < 0) break
    const name = /^<\/?\s*(?:[a-z]+:)?([a-z]+)/i.exec(svg.slice(at, at + 40))?.[1]?.toLowerCase()
    if (name === 'text') inText = svg[at + 1] !== '/' && svg[close - 1] !== '/'
    const next = svg.indexOf('<', close + 1)
    if (inText) text += (next < 0 ? svg.length : next) - close - 1
    if (text > MAX_TEXT) throw tooCostly()
    at = next
  }

  let pixels = 0
  for (const [, address] of svg.matchAll(/href\s*=\s*["']([^"']*)["']/gi)) {
    const value = address!.trim()
    const comma = value.indexOf(',')
    if (!/^data:/i.test(value) || comma < 0) continue
    if (++count.pictures > MAX_EMBEDDED) throw tooCostly()
    const kind = value.slice(5, comma).toLowerCase()
    const data = value.slice(comma + 1)
    const base64 = kind.trimEnd().endsWith('base64')
    if (kind.includes('svg')) {
      // A drawing inside the drawing. Read the same way, one level further in.
      let inner: string
      if (base64) inner = new TextDecoder().decode(fromBase64(data!, MAX_SVG_BYTES))
      else {
        try {
          inner = decodeURIComponent(data!)
        } catch {
          inner = data!
        }
        inner = inner.replaceAll('&quot;', '"').replaceAll('&apos;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&')
      }
      pixels += await embeddedPixels(inner, depth + 1, count)
      continue
    }
    if (!base64) continue
    // A picture: its real size is in its first bytes, whatever size the drawing shows it at.
    const head = fromBase64(data!, 512 * 1024)
    const found = await detect(new Blob([head as BlobPart]), registry.formats)
    const size = found.kind === 'known' ? pixelCount(found.dimensions) : 0
    if (size === 0) throw tooLargeInside()
    pixels += size
  }
  return pixels
}

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

      const inside = await embeddedPixels(new TextDecoder().decode(bytes), 0, { pictures: 0 })
      if (input.maxPixels !== undefined && inside > input.maxPixels) throw tooLargeInside()

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
      } catch (error) {
        // A failure inside the WebAssembly itself (it ran out of room, or off the end of its
        // memory) leaves that copy of resvg unfit for any file after. It is let go, and the
        // next conversion starts a new one.
        const broken = (reason: unknown): boolean =>
          reason instanceof Error && (reason instanceof WebAssembly.RuntimeError || /unreachable|out of bounds|unsafe aliasing/i.test(reason.message) || broken(reason.cause))
        if (broken(error)) {
          loading = undefined
          renderer = undefined
        }
        throw error
      } finally {
        try {
          renderer?.free()
        } catch {
          // Freeing what a failed drawing left behind can itself fail. The first error is the one that matters.
        }
      }
    },
  }
}
