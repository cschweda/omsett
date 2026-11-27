import { pdfPagesInfo } from '../info'
import type { ConvertInput, ConvertOutput, Engine } from '../types'
import { qualityOption, Refusal, safeBaseName, throwIfAborted } from '../util'

// A PDF's pages as pictures: each page drawn by pdf.js onto a canvas in the worker, at 150 dots
// to the inch, on white, and written as PNG or JPEG. Only in a browser: drawing needs a canvas.
//
// pdf.js reads everything in the file, so it is set up to trust none of it. A typeface in the
// file is drawn as outlines and never installed; no typeface of the device is consulted; a
// picture inside the PDF is decoded by pdf.js's own code and never handed to the browser's
// decoder; forms that are programs (XFA) are not opened. The typefaces every reader must have,
// the tables for Chinese, Japanese and Korean, and the decoders for some kinds of picture are
// files pdf.js asks for by name. They are handed to it from bytes the worker has verified, by
// the host, and pdf.js itself fetches nothing. (One thing is made from the file: pdf.js compiles a
// PDF's small arithmetic functions, which shade colours, into WebAssembly of its own making.
// It is arithmetic only, and turning it off would turn off the picture decoders too.)
//
// pdf.js passes over what it cannot draw (a picture past the size limit, one it cannot decode,
// a typeface it cannot read) and says so only as a warning. Those warnings are counted while a
// PDF is drawn, and the result says what was left out, never a quiet blank.

/** What pdf.js may ask for: a table of characters, a typeface every reader has, or a decoder. */
export type PdfData = 'cmaps' | 'standard_fonts' | 'wasm'
export interface PdfPagesHost {
  /** The verified bytes of one of pdf.js's own files, by its name; refused if it is not one. */
  data(kind: PdfData, name: string): Promise<Uint8Array>
}

/** Larger than this is not read in a browser tab. */
const MAX_PDF_BYTES = 64 * 1024 * 1024
/** Dots to the inch: sharp on a screen and in print at the size of the page. */
const DPI = 150
/** The most pixels one page is drawn at. A page larger than this is drawn smaller to fit. */
const PAGE_MAX_PIXELS = 36_000_000
/** The most pages drawn when every page is asked for. A longer PDF is refused, with what to do. */
export const MAX_PAGES_ALL = 100
/** A picture inside the PDF larger than this is not drawn. */
const MAX_IMAGE_PIXELS = 100_000_000

/** pdf.js's warnings for what it passed over, and what each means for the person. */
const LEFT_OUT: Array<[pattern: RegExp, what: string]> = [
  [/Image exceeded maximum allowed size|Image dimensions are missing|Unable to decode image/, 'picture'],
  [/Failed to compile font|Error during font loading/, 'typeface'],
]

/** An address that loads nothing: pdf.js is never to fetch a file of its own. */
const NOWHERE = 'omsett-verified:/'

export function createPdfPagesEngine(host: PdfPagesHost): Engine {
  // pdf.js constructs these itself, from the classes it is given.
  class CanvasFactory {
    create(width: number, height: number) {
      if (width <= 0 || height <= 0) throw new Error('Invalid canvas size')
      const canvas = new OffscreenCanvas(width, height)
      return { canvas, context: canvas.getContext('2d', { willReadFrequently: true }) }
    }

    reset(found: { canvas: OffscreenCanvas }, width: number, height: number) {
      found.canvas.width = width
      found.canvas.height = height
    }

    destroy(found: { canvas: OffscreenCanvas | null; context: unknown }) {
      if (found.canvas) found.canvas.width = found.canvas.height = 0
      found.canvas = null
      found.context = null
    }

    getNoAlphaContext(canvas: OffscreenCanvas) {
      return canvas.getContext('2d', { alpha: false, willReadFrequently: true })
    }
  }
  // Filters are drawn by a page's own SVG, and a worker has no page. None is drawn.
  class FilterFactory {
    addFilter() {
      return 'none'
    }

    addHCMFilter() {
      return 'none'
    }

    addAlphaFilter() {
      return 'none'
    }

    addLuminosityFilter() {
      return 'none'
    }

    addKnockoutFilter() {
      return 'none'
    }

    addHighlightHCMFilter() {
      return 'none'
    }

    addSelectionHCMFilter() {
      return 'none'
    }

    addSelectionFilter() {
      return 'none'
    }

    createSelectionStyle() {
      return null
    }

    destroy() {}
  }
  const KINDS: Record<string, PdfData> = { cMapUrl: 'cmaps', standardFontDataUrl: 'standard_fonts', wasmUrl: 'wasm' }
  class BinaryDataFactory {
    async fetch({ kind, filename }: { kind: string; filename: string }): Promise<Uint8Array> {
      const which = KINDS[kind]
      if (!which) throw new Error(`pdf.js asked for ${kind}, which it is not given`)
      return host.data(which, filename)
    }
  }

  async function convert(input: ConvertInput): Promise<ConvertOutput[]> {
    throwIfAborted(input.signal)
    if (input.blob.size > MAX_PDF_BYTES) throw new Refusal('This PDF is too large to convert in a browser')
    const mime = input.to.id === 'jpeg' ? 'image/jpeg' : input.to.id === 'png' ? 'image/png' : null
    if (!mime) throw new Error(`The pdf-pages engine does not write ${input.to.id}`)
    const bytes = new Uint8Array(await input.blob.arrayBuffer())
    const [pdfjs, parser] = await Promise.all([
      import('pdfjs-dist/legacy/build/pdf.mjs'),
      // @ts-expect-error -- the parsing half of the library ships without types of its own
      import('pdfjs-dist/legacy/build/pdf.worker.mjs') as Promise<unknown>,
    ])
    ;(globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = parser
    const task = pdfjs.getDocument({
      data: bytes,
      useSystemFonts: false,
      disableFontFace: true,
      enableXfa: false,
      isImageDecoderSupported: false,
      isOffscreenCanvasSupported: true,
      maxImageSize: MAX_IMAGE_PIXELS,
      // Every file pdf.js would load comes from the host, verified. The addresses are only names.
      useWorkerFetch: false,
      cMapUrl: NOWHERE,
      cMapPacked: true,
      standardFontDataUrl: NOWHERE,
      wasmUrl: NOWHERE,
      CanvasFactory,
      FilterFactory,
      BinaryDataFactory,
      disableWorkerRendering: true,
      stopAtErrors: false,
      // Warnings on, so that what pdf.js passes over can be counted (below), and nothing else.
      verbosity: 1,
    } as Parameters<typeof pdfjs.getDocument>[0])
    const skipped = { picture: 0, typeface: 0 }
    const warn = console.warn
    console.warn = (...words: unknown[]) => {
      const text = words.map(String).join(' ')
      const found = LEFT_OUT.find(([pattern]) => pattern.test(text))
      if (found) skipped[found[1] as keyof typeof skipped]++
    }
    try {
      let document: Awaited<typeof task.promise>
      try {
        document = await task.promise
      } catch (error) {
        const name = error instanceof Error ? error.name : ''
        if (name === 'PasswordException') throw new Refusal('This PDF is protected by a password, which Omsett cannot open')
        throw new Refusal('This file is not a valid PDF')
      }
      const count = document.numPages
      const all = input.options.pages !== 'first'
      if (all && count > MAX_PAGES_ALL) {
        throw new Refusal(`This PDF has ${count.toLocaleString('en')} pages. Omsett draws up to ${MAX_PAGES_ALL} at a time; choose the first page only, or split the PDF first`)
      }
      const wanted = all ? count : 1
      const width = String(wanted).length
      const base = safeBaseName(input.name)
      const outputs: ConvertOutput[] = []
      for (let n = 1; n <= wanted; n++) {
        throwIfAborted(input.signal)
        const page = await document.getPage(n)
        const natural = page.getViewport({ scale: DPI / 72 })
        // Drawn smaller where a page is too large to draw at the usual size.
        const fit = Math.min(1, Math.sqrt(PAGE_MAX_PIXELS / (natural.width * natural.height)))
        const viewport = page.getViewport({ scale: (DPI / 72) * fit })
        const canvas = new OffscreenCanvas(Math.max(1, Math.floor(viewport.width)), Math.max(1, Math.floor(viewport.height)))
        const context = canvas.getContext('2d')!
        // A page is paper: white beneath whatever is drawn on it.
        context.fillStyle = '#ffffff'
        context.fillRect(0, 0, canvas.width, canvas.height)
        await page.render({ canvas: canvas as unknown as HTMLCanvasElement, canvasContext: context as unknown as CanvasRenderingContext2D, viewport, annotationMode: pdfjs.AnnotationMode.ENABLE }).promise
        page.cleanup()
        const blob: Blob = await canvas.convertToBlob(mime === 'image/jpeg' ? { type: mime, quality: qualityOption(input.options) / 100 } : { type: mime })
        if (blob.type !== mime) throw new Error(`This browser wrote ${blob.type} when asked for ${mime}`)
        const name = wanted === 1 ? `${base}.${input.to.extensions[0]}` : `${base}-page-${String(n).padStart(width, '0')}.${input.to.extensions[0]}`
        outputs.push({ name, format: input.to.id, blob })
        input.onProgress(n / wanted)
      }
      const notes: string[] = []
      if (count > 1 && !all) notes.push(`This PDF has ${count.toLocaleString('en')} pages. Only the first was drawn, as chosen.`)
      if (skipped.picture) notes.push(`${skipped.picture === 1 ? 'One picture' : `${skipped.picture} pictures`} in this PDF could not be drawn and ${skipped.picture === 1 ? 'is' : 'are'} missing from the result: too large, or damaged. Check the pages against the PDF.`)
      if (skipped.typeface) notes.push(`${skipped.typeface === 1 ? 'One typeface' : `${skipped.typeface} typefaces`} in this PDF could not be read, so some words may be missing or drawn in another typeface. Check the pages against the PDF.`)
      if (outputs[0] && notes.length > 0) outputs[0].note = notes.join(' ')
      return outputs
    } catch (error) {
      if (error instanceof Refusal || (error instanceof Error && error.name === 'AbortError')) throw error
      throw error instanceof Error && /Invalid PDF|FormatError|Missing PDF/i.test(error.message) ? new Refusal('This file is not a valid PDF') : error
    } finally {
      console.warn = warn
      await task.destroy().catch(() => {})
    }
  }

  return {
    ...pdfPagesInfo,
    available: async () => typeof OffscreenCanvas !== 'undefined',
    load: async () => {},
    convert,
  }
}
