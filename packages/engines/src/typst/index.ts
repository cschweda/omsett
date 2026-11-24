import { readWoff, writeSfnt } from '../font/sfnt'
import { typstInfo } from '../info'
import { readPage } from '../markup'
import type { ConvertInput, ConvertOutput, Engine } from '../types'
import { outputName, Refusal, throwIfAborted } from '../util'
import { writeTypst } from './source'

// Writing PDF. A page is read and cleaned as any page is, written as a program for Typst (see
// source.ts), and Typst lays it out: breaks its lines and its pages, sets it in Omsett's own
// typeface, and writes a PDF that is tagged, so that a screen reader finds the headings, lists
// and tables the page had. Typst is a typesetting program in the line of TeX, built to
// WebAssembly; it is large, and is fetched only when a PDF is asked for.
//
// It is given the program, the pictures the program names, and the typeface, and nothing else.
// It has no files to read and nowhere to fetch from.

/** Larger pages than this are not laid out. */
const MAX_PAGE_BYTES = 32 * 1024 * 1024

export interface TypstHost {
  /** Typst itself, as bytes. */
  wasm(): Promise<Uint8Array | ArrayBuffer>
  /** The typeface's files, as web fonts (WOFF). They are unwrapped here. */
  fonts(): Promise<Uint8Array[]>
}

interface Compiler {
  addSource(path: string, source: string): void
  mapShadow(path: string, bytes: Uint8Array): void
  resetShadow(): void
  compile(options: { mainFilePath: string; format: 1; diagnostics: 'full' }): Promise<{ result?: Uint8Array; diagnostics?: Array<{ severity?: string; message?: string }> }>
}

export function createTypstEngine(host: TypstHost): Engine {
  let started: Promise<Compiler> | null = null
  const start = () =>
    (started ??= (async () => {
      const [{ createTypstCompiler }, { loadFonts }, wasm, fonts] = await Promise.all([
        import('@myriaddreamin/typst.ts/compiler'),
        import('@myriaddreamin/typst.ts/options.init'),
        host.wasm(),
        host.fonts(),
      ])
      // A web font is a font in a wrapping. Typst wants it unwrapped, which Omsett's own code does.
      const plain = await Promise.all(fonts.map(async (font) => writeSfnt(await readWoff(font))))
      const compiler = createTypstCompiler()
      // No fonts but these: by default the library would fetch its own from another site.
      await compiler.init({ getModule: () => wasm, beforeBuild: [loadFonts(plain, { assets: false })] })
      return compiler as unknown as Compiler
    })().catch((error: unknown) => {
      started = null
      throw error
    }))

  return {
    ...typstInfo,
    available: async () => typeof WebAssembly !== 'undefined',
    load: async () => void (await start()),
    async convert(input: ConvertInput): Promise<ConvertOutput[]> {
      throwIfAborted(input.signal)
      if (input.blob.size > MAX_PAGE_BYTES) throw new Refusal('This page is too large to lay out as a PDF')
      let text: string
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(await input.blob.arrayBuffer()))
      } catch {
        throw new Refusal('This file is not text in UTF-8, the encoding Omsett reads text in')
      }
      const page = await readPage(text, input.name)
      const written = writeTypst(page.tree, page.title, page.language)
      // Letters the typeface cannot draw are left out of the PDF altogether. A few are named in
      // the result; a page that is mostly such letters would come out blank, and is refused.
      if (written.undrawn > 20 && written.undrawn > written.letters * 0.1) {
        throw new Refusal(`Omsett's PDFs are set in a typeface that draws Latin, Greek and Cyrillic letters. Much of this page is in another script (${written.missing.slice(0, 6).join(' ')}), which would be left out. Choose DOCX or a web page, which keep every letter`)
      }
      input.onProgress(0.2)
      const compiler = await start()
      throwIfAborted(input.signal)
      input.onProgress(0.4)
      compiler.resetShadow()
      compiler.addSource('/main.typ', written.source)
      for (const [name, bytes] of written.files) compiler.mapShadow(name, bytes)
      let made: Awaited<ReturnType<Compiler['compile']>>
      try {
        made = await compiler.compile({ mainFilePath: '/main.typ', format: 1, diagnostics: 'full' })
      } catch {
        throw new Refusal('This page could not be laid out as a PDF')
      }
      if (!made.result || made.result.length < 8) throw new Refusal('This page could not be laid out as a PDF')
      input.onProgress(1)
      const notes: string[] = []
      if (written.missing.length) notes.push(`The PDF is set in a typeface that draws Latin, Greek and Cyrillic letters. It has no drawing for ${written.undrawn === 1 ? 'one letter' : `${written.undrawn} letters`} on this page (${written.missing.slice(0, 6).join(' ')}), and they are left out of the PDF. Check the result, or choose DOCX, which keeps every letter.`)
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
