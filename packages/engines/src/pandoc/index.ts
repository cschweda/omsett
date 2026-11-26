import { pandocInfo } from '../info'
import { LANGUAGES } from '../markup/doc-read'
import { officeToHtml } from '../markup/index'
import type { ConvertInput, ConvertOutput, Engine } from '../types'
import { outputName, Refusal, throwIfAborted } from '../util'
import { prepareRtf, TABLE_MARK_ON_PAGE } from './rtf'

// Pandoc, the document converter, built to WebAssembly by the Pandoc project and shipped as it
// is (GPL-2.0-or-later). It is fetched only when a conversion needs it, and given nothing but
// the file: no network, no files of the computer, only a file system that lives in memory.
//
// It reads RTF; Omsett writes RTF itself (markup/rtf-write.ts), with real lists, which Pandoc's
// writer does not make. What Pandoc reads is never trusted: the RTF is first walked by Omsett's
// own code (rtf.ts), which takes out words deleted with changes tracked and refuses what nests
// too deep; and the page Pandoc makes is cleaned as every page is (`officeToHtml`), its
// pictures checked to be what they say.

/** The most text an RTF file may hold. Pictures are written into it as text, two letters to a byte. */
const MAX_RTF_BYTES = 64 * 1024 * 1024

interface Pandoc {
  convert(options: Record<string, unknown>, stdin: string, files: Record<string, string | Blob>): Promise<{ stdout: string; stderr: string; files: Record<string, Blob> }>
}
export interface PandocHost {
  /** Pandoc itself, as bytes: verified in a browser, read from the package in Node. */
  wasm(): Promise<Uint8Array>
  /** The package's own loader, which starts Pandoc from those bytes and fetches nothing. */
  core(): Promise<{ createPandocInstance(wasm: Uint8Array): Promise<Pandoc> }>
}

const SIGNATURES: Record<string, number[]> = {
  png: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A],
  jpeg: [0xFF, 0xD8, 0xFF],
  gif: [0x47, 0x49, 0x46, 0x38],
}

/** Pictures Pandoc carried into the page: kept only where their bytes are what they say; never with a description Pandoc made up. */
function checkedPictures(html: string): string {
  return html.replace(/<img\b[^>]*>/gi, (tag) => {
    const src = /\ssrc="data:image\/(png|jpeg|gif);base64,([a-z0-9+/=]+)"/i.exec(tag)
    // "image" is what Pandoc calls a picture that has no description. It is not one.
    const stated = /\salt="([^"]*)"/i.exec(tag)?.[1] ?? ''
    const alt = stated === 'image' ? '' : stated
    let ok = false
    if (src) {
      try {
        const head = atob(src[2]!.slice(0, 24))
        ok = SIGNATURES[src[1]!.toLowerCase()]!.every((byte, i) => head.charCodeAt(i) === byte)
      } catch {
        ok = false
      }
    }
    if (!ok) return alt ? `[Picture: ${alt}]` : ''
    return `<img src="data:image/${src![1]!.toLowerCase()};base64,${src![2]}" alt="${alt}">`
  })
}

/**
 * A list Pandoc split in two. Its RTF reader ends a list where an item comes back from a list
 * inside it, and starts another, so that a numbered list starts again at 1. Two lists of one
 * kind with nothing between them are one list, and are written as one.
 */
function rejoined(html: string): string {
  return html.replace(/<\/ul>\s*<ul>/g, '').replace(/<\/ol>\s*<ol type="1">/g, '')
}

/**
 * Each table whose first row the RTF marks as its headings, with that row made the table's head.
 * Pandoc writes tables in the order the file has them; where it wrote another number of tables
 * than the file holds, which is which cannot be known, and none is changed.
 */
function headings(html: string, headed: boolean[]): string {
  const tables = html.match(/<table>/g)?.length ?? 0
  if (tables !== headed.length || !headed.includes(true)) return html
  let n = 0
  return html.replace(/<table>\s*<tbody>\s*(<tr>[\s\S]*?<\/tr>)/g, (whole, row: string) => {
    if (!headed[n++]) return whole
    return `<table><thead>${row.replace(/<td>/g, '<th>').replace(/<\/td>/g, '</th>')}</thead><tbody>`
  })
}

export function createPandocEngine(host: PandocHost): Engine {
  let started: Promise<Pandoc> | null = null
  const start = () =>
    (started ??= (async () => {
      const [core, wasm] = await Promise.all([host.core(), host.wasm()])
      return core.createPandocInstance(wasm)
    })().catch((error: unknown) => {
      started = null
      throw error
    }))

  async function rtfToHtml(input: ConvertInput): Promise<string> {
    if (input.blob.size > MAX_RTF_BYTES) throw new Refusal('This document is too large to convert in a browser')
    // RTF is written in one byte to a letter; letters beyond those are given by number, inside the file.
    const bytes = new Uint8Array(await input.blob.arrayBuffer())
    let text = ''
    for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    const { rtf, language, headed } = prepareRtf(text)
    const pandoc = await start()
    throwIfAborted(input.signal)
    input.onProgress(0.4)
    // No wrapping: Pandoc would otherwise break long lines where spaces are.
    const made = await pandoc.convert({ from: 'rtf', to: 'html', standalone: true, 'embed-resources': true, wrap: 'none' }, rtf, {})
    // Given a title, Pandoc writes a block at the top of the page with the title and the author.
    // The author is never carried across, and the title is the page's own; the block goes.
    const body = (/<body[^>]*>([\s\S]*)<\/body>/i.exec(made.stdout)?.[1] ?? '').replace(/<header id="title-block-header">[\s\S]*?<\/header>/i, '')
    if (body.replace(/<[^>]*>/g, '').trim() === '' && !/<img\b/i.test(body)) throw new Refusal('This document has no text in it to convert')
    const title = /<title>([^<]*)<\/title>/i.exec(made.stdout)?.[1]?.trim() ?? ''
    input.onProgress(0.8)
    return officeToHtml(
      {
        body: headings(checkedPictures(rejoined(body.replace(TABLE_MARK_ON_PAGE, ''))), headed),
        // A document that gives no title is called "stdin" by Pandoc, after where it read it from.
        title: title !== '' && title !== 'stdin' ? unescapeHtml(title) : null,
        language: (language !== null && LANGUAGES[language]) || null,
      },
      input.name,
    )
  }

  return {
    ...pandocInfo,
    available: async () => typeof WebAssembly !== 'undefined',
    load: async () => void (await start()),
    async convert(input: ConvertInput): Promise<ConvertOutput[]> {
      throwIfAborted(input.signal)
      const pair = `${input.from.id}>${input.to.id}`
      if (pair !== 'rtf>html') throw new Error(`The pandoc engine does not convert ${pair}`)
      const written = await rtfToHtml(input)
      input.onProgress(1)
      return [{ name: outputName(input.name, input.to), format: input.to.id, blob: new Blob([written as BlobPart], { type: input.to.mime[0] }) }]
    },
  }
}

const unescapeHtml = (text: string) => text.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&amp;', '&')
