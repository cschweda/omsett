import { readWoff, writeSfnt } from '../font/sfnt'
import { typstInfo } from '../info'
import { readPage } from '../markup'
import type { ConvertInput, ConvertOutput, Engine } from '../types'
import { MAX_PIXELS, pngStructureProblem, readDimensions } from '@omsett/detect'
import { outputName, Refusal, safeBaseName, throwIfAborted } from '../util'
import { MAX_PIECES, piecesFor, SCRIPTS, type ScriptId } from './scripts'
import { quoted, writeTypst } from './source'

export { SCRIPTS, type ScriptId } from './scripts'

// Writing PDF. A page is read and cleaned as any page is, written as a program for Typst (see
// source.ts), and Typst lays it out: breaks its lines and its pages, sets it in Omsett's own
// typeface, and writes a PDF that is tagged, so that a screen reader finds the headings, lists
// and tables the page had. Typst is a typesetting program in the line of TeX, built to
// WebAssembly; it is large, and is fetched only when a PDF is asked for.
//
// It is given the program, the pictures the program names, and typefaces, and nothing else.
// It has no files to read and nowhere to fetch from.
//
// Omsett's own typeface draws Latin, Greek and Cyrillic. For other scripts there are faces
// that are fetched a piece at a time, and only the pieces a document has letters for
// (scripts.ts).

/** Larger pages than this are not laid out. */
const MAX_PAGE_BYTES = 32 * 1024 * 1024
/** The width of a sheet of A4, in points: the widest page a picture is set on. */
const PAGE_WIDTH = 595.28

export interface TypstHost {
  /** Typst itself, as bytes. */
  wasm(): Promise<Uint8Array | ArrayBuffer>
  /** Omsett's own typeface, as web fonts (WOFF). They are unwrapped here. */
  fonts(): Promise<Uint8Array[]>
  /** For another script's typeface: which piece of it draws which letters. */
  pieces(script: ScriptId): Promise<Record<string, string>>
  /** One piece of such a typeface, in its regular or its bold cut, as a web font. */
  piece(script: ScriptId, name: string, weight: 400 | 700): Promise<Uint8Array>
}

interface Compiler {
  addSource(path: string, source: string): void
  mapShadow(path: string, bytes: Uint8Array): void
  resetShadow(): void
  setFonts(fonts: unknown): void
  compile(options: { mainFilePath: string; format: 1; diagnostics: 'full' }): Promise<{ result?: Uint8Array; diagnostics?: Array<{ severity?: string; message?: string }> }>
}
interface FontBuilder {
  init(options: { getModule: () => Uint8Array | ArrayBuffer }): Promise<void>
  addFontData(font: Uint8Array): Promise<void>
  build<T>(use: (fonts: unknown) => Promise<T>): Promise<T>
}

const unwrap = async (font: Uint8Array) => writeSfnt(await readWoff(font))

export function createTypstEngine(host: TypstHost): Engine {
  let started: Promise<{ compiler: Compiler; own: Uint8Array[]; builder: () => Promise<FontBuilder> }> | null = null
  const start = () =>
    (started ??= (async () => {
      const [{ createTypstCompiler, createTypstFontBuilder }, { loadFonts }, wasm, fonts] = await Promise.all([
        import('@myriaddreamin/typst.ts/compiler'),
        import('@myriaddreamin/typst.ts/options.init'),
        host.wasm(),
        host.fonts(),
      ])
      // A web font is a font in a wrapping. Typst wants it unwrapped, which Omsett's own code does.
      const own = await Promise.all(fonts.map(unwrap))
      const compiler = createTypstCompiler()
      // No fonts but these: by default the library would fetch its own from another site.
      await compiler.init({ getModule: () => wasm, beforeBuild: [loadFonts(own, { assets: false })] })
      const builder = async () => {
        const made = createTypstFontBuilder() as unknown as FontBuilder
        await made.init({ getModule: () => wasm })
        return made
      }
      return { compiler: compiler as unknown as Compiler, own, builder }
    })().catch((error: unknown) => {
      started = null
      throw error
    }))

  /** Pieces of other typefaces already fetched and unwrapped, kept for the next document that wants them. */
  const kept = new Map<string, Promise<Uint8Array>>()
  const pieceOf = (script: ScriptId, name: string, weight: 400 | 700) => {
    const key = `${script}:${name}:${weight}`
    if (!kept.has(key)) kept.set(key, host.piece(script, name, weight).then(unwrap))
    return kept.get(key)!
  }

  /** A picture, set on a page of its own that is the shape of the picture. */
  async function picturePage(input: ConvertInput): Promise<ConvertOutput[]> {
    const bytes = new Uint8Array(await input.blob.arrayBuffer())
    // The picture is checked as any PNG is before a decoder sees it, and its size taken from itself.
    const problem = await pngStructureProblem(input.blob, input.maxPixels ?? MAX_PIXELS)
    if (problem) throw new Refusal('This picture is damaged, and cannot be set on a page')
    const size = readDimensions('png', bytes.subarray(0, 65536))
    if (!size || size.width < 1 || size.height < 1) throw new Refusal('This picture does not say how large it is')
    if (input.maxPixels !== undefined && size.width * size.height > input.maxPixels) throw new Refusal('This image is too large to convert in a browser')
    // At 96 pixels to the inch, and no wider than a sheet of A4: a scan becomes a page, not a poster.
    const wide = Math.min(PAGE_WIDTH, size.width * 0.75)
    const high = (wide * size.height) / size.width
    const { compiler } = await start()
    throwIfAborted(input.signal)
    input.onProgress(0.5)
    compiler.resetShadow()
    compiler.addSource('/main.typ', `#set document(title: ${quoted(safeBaseName(input.name))}, author: (), date: none)\n#set page(width: ${wide.toFixed(2)}pt, height: ${high.toFixed(2)}pt, margin: 0pt)\n#image("/picture.png", width: 100%, height: 100%, fit: "stretch")`)
    compiler.mapShadow('/picture.png', bytes)
    let made: Awaited<ReturnType<Compiler['compile']>>
    try {
      made = await compiler.compile({ mainFilePath: '/main.typ', format: 1, diagnostics: 'full' })
    } catch {
      throw new Refusal('This picture could not be set on a page')
    }
    if (!made.result || made.result.length < 8) throw new Refusal('This picture could not be set on a page')
    input.onProgress(1)
    return [{ name: outputName(input.name, input.to), format: input.to.id, blob: new Blob([made.result as BlobPart], { type: input.to.mime[0] }) }]
  }

  return {
    ...typstInfo,
    available: async () => typeof WebAssembly !== 'undefined',
    load: async () => void (await start()),
    async convert(input: ConvertInput): Promise<ConvertOutput[]> {
      throwIfAborted(input.signal)
      if (input.from.category === 'image') return picturePage(input)
      if (input.blob.size > MAX_PAGE_BYTES) throw new Refusal('This page is too large to lay out as a PDF')
      let text: string
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(await input.blob.arrayBuffer()))
      } catch {
        throw new Refusal('This file is not text in UTF-8, the encoding Omsett reads text in')
      }
      const page = await readPage(text, input.name)
      const written = writeTypst(page.tree, page.title, page.language)
      input.onProgress(0.15)

      // The letters Omsett's own typeface cannot draw: which pieces of which other faces draw
      // them, and which no face here draws at all.
      const found = written.outside.size > 0 ? await piecesFor(written.outside.keys(), page.language, host.pieces) : { pieces: [], undrawn: [] }
      // Those are left out of the PDF by Typst, not shown as boxes. A few are named in the
      // result; a page that is mostly such letters would come out blank, and is refused.
      const lost = found.undrawn.reduce((sum, code) => sum + (written.outside.get(code) ?? 0), 0)
      const named = found.undrawn.slice(0, 6).map((code) => String.fromCodePoint(code)).join(' ')
      if (lost > 20 && lost > written.letters * 0.1) {
        throw new Refusal(`Much of this page is in a script Omsett's PDFs cannot draw yet (${named}), and it would be left out. Choose DOCX or a web page, which keep every letter`)
      }
      if (found.pieces.length > MAX_PIECES) throw new Refusal('This page uses more of its typefaces than Omsett will fetch for one PDF')
      throwIfAborted(input.signal)

      const { compiler, own, builder } = await start()
      input.onProgress(0.35)
      const families = [...new Set(found.pieces.map((piece) => SCRIPTS[piece.script].family))]
      const lay = async () => {
        compiler.resetShadow()
        compiler.addSource('/main.typ', written.program(families))
        for (const [name, bytes] of written.files) compiler.mapShadow(name, bytes)
        return compiler.compile({ mainFilePath: '/main.typ', format: 1, diagnostics: 'full' })
      }
      let made: Awaited<ReturnType<Compiler['compile']>>
      try {
        if (found.pieces.length === 0) made = await lay()
        else {
          // Each piece in its regular and its bold cut, fetched together.
          const extra = await Promise.all(found.pieces.flatMap((piece) => [pieceOf(piece.script, piece.name, 400), pieceOf(piece.script, piece.name, 700)]))
          throwIfAborted(input.signal)
          input.onProgress(0.6)
          const fonts = await builder()
          for (const font of [...own, ...extra]) await fonts.addFontData(font)
          made = await fonts.build(async (set) => {
            compiler.setFonts(set)
            return lay()
          })
          // The next document starts from Omsett's own typeface again.
          const plain = await builder()
          for (const font of own) await plain.addFontData(font)
          await plain.build(async (set) => compiler.setFonts(set))
        }
      } catch (error) {
        if (error instanceof Refusal || (error as Error)?.name === 'AbortError') throw error
        throw new Refusal('This page could not be laid out as a PDF')
      }
      if (!made.result || made.result.length < 8) throw new Refusal('This page could not be laid out as a PDF')
      input.onProgress(1)
      const notes: string[] = []
      if (lost > 0) notes.push(`${lost === 1 ? 'One letter on this page has' : `${lost} letters on this page have`} no drawing in any typeface Omsett has (${named}), and ${lost === 1 ? 'is' : 'are'} left out of the PDF. Check the result, or choose DOCX, which keeps every letter.`)
      if (written.elsewhere) notes.push(`${written.elsewhere === 1 ? 'One picture lives' : `${written.elsewhere} pictures live`} on a website and not in the page, and Omsett fetches nothing: the description is written in its place.`)
      return [
        {
          name: outputName(input.name, input.to),
          format: input.to.id,
          blob: new Blob([made.result as BlobPart], { type: input.to.mime[0] }),
          ...(notes.length ? { note: notes.join(' ') } : {}),
        },
      ]
    },
  }
}
