import { qpdfInfo } from '../info'
import type { ConvertInput, ConvertOutput, Engine } from '../types'
import { Refusal, safeBaseName, throwIfAborted } from '../util'
import { clean, type QpdfJson } from './clean'
import { pagesFrom } from './range'

// A PDF split into pages, or a range of its pages taken as one PDF, by qpdf (Apache-2.0), the PDF
// toolkit built to cope with damaged and hostile files, as WebAssembly. Pages are copied as they
// are: nothing is drawn again, so the words stay words.
//
// What qpdf would copy along with the pages is decided by Omsett, not by qpdf. The whole file is
// listed as JSON and cleaned (`clean`): scripts, actions, attachments, comments, forms, the author
// and the structure tree are taken out, and the annotations that are left are drawn into the
// page. Only then are pages taken. Every file written is read again before it is handed over,
// and refused if anything that was taken out is in it.

/** The calls into qpdf this engine makes: its command line, and its files in memory. */
export interface QpdfInstance {
  callMain(args: string[]): number
  FS: { writeFile(path: string, data: Uint8Array): void; readFile(path: string): Uint8Array; unlink(path: string): void }
}
export interface QpdfHost {
  /** qpdf, started from its verified binary, writing what it says to `say`. */
  qpdf(say: (line: string) => void): Promise<QpdfInstance>
}

/** Larger than this is not split in a browser tab. */
const MAX_PDF_BYTES = 64 * 1024 * 1024
/** The most pages a PDF may have to be split into one PDF a page. */
export const MAX_SPLIT = 500
/** Layers can hide part of a page in more ways than any check can follow: a PDF with any is not split. */
export const LAYERS = 'This PDF has layers, which can keep parts of a page hidden. Splitting copies pages as they are, hidden parts and all, so it is not split. Make pictures of its pages instead, which leaves hidden layers out'
/** qpdf's exit codes: done; done with warnings (it repaired something). */
const DONE = 0
const REPAIRED = 3

/** Names that must not be in anything this engine writes: what runs, what is attached, who wrote it. */
const FORBIDDEN = /\/(JS|JavaScript|AA|OpenAction|Launch|SubmitForm|ImportData|EmbeddedFile|EmbeddedFiles|EF|AF|RichMedia|StructTreeRoot|Metadata|AcroForm|XFA|DSS|Ref)\b/
/**
 * qpdf, called again and again in one instance, wears out: past about 240 calls its WebAssembly
 * breaks ("table index is out of bounds"). Each conversion has an instance of its own, and a long
 * split starts a fresh one after this many calls.
 */
const CALLS_PER_INSTANCE = 100

export function createQpdfEngine(host: QpdfHost): Engine {
  let said: string[] = []
  const start = () => host.qpdf((line) => said.push(line))

  async function convert(input: ConvertInput): Promise<ConvertOutput[]> {
    throwIfAborted(input.signal)
    if (input.blob.size > MAX_PDF_BYTES) throw new Refusal('This PDF is too large to split in a browser')
    let qpdf = await start()
    let calls = 0
    const files: string[] = []
    const write = (path: string, data: Uint8Array) => {
      qpdf.FS.writeFile(path, data)
      files.push(path)
    }
    /** Runs qpdf. A file it had to repair is refused, as Omsett refuses damage everywhere. */
    const run = (...args: string[]) => {
      said = []
      calls++
      const code = qpdf.callMain(args)
      if (code === REPAIRED) throw new Refusal('This PDF is damaged: qpdf had to repair it to read it, so it is not split')
      if (code !== DONE) throw new Refusal('This file is not a valid PDF')
      for (const path of args.filter((arg) => arg.startsWith('/omsett-'))) if (!files.includes(path)) files.push(path)
    }
    try {
      write('/omsett-in.pdf', new Uint8Array(await input.blob.arrayBuffer()))
      // A protection is never worked round: an encrypted PDF is left as it is.
      said = []
      if (qpdf.callMain(['--is-encrypted', '/omsett-in.pdf']) === DONE) {
        throw new Refusal('This PDF is protected (it is encrypted), and Omsett does not take protected PDFs apart')
      }
      // How many pages, from qpdf's own list of them, written to a file.
      run('--json=2', '--json-key=pages', '/omsett-in.pdf', '/omsett-pages.json')
      const count = ((JSON.parse(new TextDecoder().decode(qpdf.FS.readFile('/omsett-pages.json'))) as { pages?: unknown[] }).pages ?? []).length
      if (!Number.isInteger(count) || count < 1) throw new Refusal('This file is not a valid PDF')
      const take = typeof input.options.take === 'string' ? input.options.take : 'every'
      const groups = take === 'every' ? null : pagesFrom(take, count)
      if (!groups && count > MAX_SPLIT) {
        throw new Refusal(`This PDF has ${count.toLocaleString('en')} pages. Omsett splits up to ${MAX_SPLIT} into a PDF each; take a range of pages instead`)
      }
      input.onProgress(0.1)

      // 1. Listed and cleaned, before anything is drawn into a page.
      const json = (path: string): QpdfJson => {
        run('--json=2', '--json-stream-data=none', path, '/omsett-list.json')
        return JSON.parse(new TextDecoder().decode(qpdf.FS.readFile('/omsett-list.json'))) as QpdfJson
      }
      const first = clean(json('/omsett-in.pdf'), 'before')
      if (first.redactions) {
        throw new Refusal('This PDF marks parts of its pages to be blacked out that have not been taken out yet: what is under them is still in the file. Apply the redactions first, in the program that marked them')
      }
      if (first.layers) {
        throw new Refusal(LAYERS)
      }
      write('/omsett-changes.json', new TextEncoder().encode(JSON.stringify(first.changes)))
      run('/omsett-in.pdf', '--decode-level=none', '--update-from-json=/omsett-changes.json', '/omsett-clean.pdf')
      input.onProgress(0.3)
      // 2. What annotations are left (highlights, stamps, a form's filled-in fields) are drawn
      // into the page, so that the page looks as it did without a form or a comment in it.
      run('/omsett-clean.pdf', '--decode-level=none', '--generate-appearances', '--flatten-annotations=screen', '/omsett-flat.pdf')
      // 3. And cleaned again: the forms, every annotation but a link, and what refers to them.
      const second = clean(json('/omsett-flat.pdf'), 'after')
      write('/omsett-changes.json', new TextEncoder().encode(JSON.stringify(second.changes)))
      run('/omsett-flat.pdf', '--decode-level=none', '--update-from-json=/omsett-changes.json', '/omsett-ready.pdf')
      input.onProgress(0.5)

      // 4. The pages taken: each into a PDF of its own, or the range into one. The numbers are
      // Omsett's, read from the person's words by `pagesFrom`; the words never reach qpdf.
      const wanted = groups ? [groups] : Array.from({ length: count }, (_, i) => [i + 1])
      const width = String(count).length
      const base = safeBaseName(input.name)
      const outputs: ConvertOutput[] = []
      for (const [n, pages] of wanted.entries()) {
        throwIfAborted(input.signal)
        if (calls >= CALLS_PER_INSTANCE) {
          // A fresh qpdf, given the cleaned file, before this one wears out.
          const ready = qpdf.FS.readFile('/omsett-ready.pdf')
          qpdf = await start()
          calls = 0
          files.length = 0
          write('/omsett-ready.pdf', ready)
        }
        const out = `/omsett-out-${n}.pdf`
        // Unused resources dropped, so that a page does not carry what only another page draws;
        // streams copied as they are, never unpacked, so a packed bomb costs nothing.
        run('/omsett-ready.pdf', '--object-streams=disable', '--deterministic-id', '--remove-unreferenced-resources=yes', '--decode-level=none', '--pages', '.', pages.join(','), '--', out)
        const bytes = qpdf.FS.readFile(out)
        // Read again before it is handed over. With object streams off, every dictionary is in
        // plain sight; a name that was taken out, anywhere in the file, means it is not handed over.
        const found = new TextDecoder('latin1').decode(bytes).match(FORBIDDEN)
        if (found) throw new Error(`A split PDF still held ${found[0]} after cleaning`)
        // One file keeps the PDF's own name; several are named for their pages.
        const name = wanted.length === 1 ? `${base}.pdf` : `${base}-page-${String(pages[0]).padStart(width, '0')}.pdf`
        outputs.push({ name, format: 'pdf', blob: new Blob([bytes.slice() as BlobPart], { type: 'application/pdf' }) })
        qpdf.FS.unlink(out)
        files.splice(files.indexOf(out), 1)
        input.onProgress(0.5 + (0.5 * (n + 1)) / wanted.length)
      }
      const notes: string[] = []
      if (groups) notes.push(`Pages ${describe(groups)} of ${count.toLocaleString('en')}, as one PDF.`)
      if (first.removed.length > 0 || second.removed.length > 0) {
        notes.push(`Left out: ${[...new Set([...first.removed, ...second.removed])].join(', ')}.`)
      }
      if (outputs[0] && notes.length > 0) outputs[0].note = notes.join(' ')
      return outputs
    } finally {
      for (const path of files) {
        try {
          qpdf.FS.unlink(path)
        } catch {
          // Already gone.
        }
      }
    }
  }

  return {
    ...qpdfInfo,
    available: async () => typeof WebAssembly !== 'undefined',
    // Fetching and checking the binary; each conversion then starts an instance of its own.
    load: async () => void (await start()),
    convert,
  }
}

/** Page numbers as a person would write them: 1-3, 7. */
function describe(pages: number[]): string {
  const runs: string[] = []
  for (let i = 0; i < pages.length; ) {
    let j = i
    while (j + 1 < pages.length && pages[j + 1] === pages[j]! + 1) j++
    runs.push(i === j ? String(pages[i]) : `${pages[i]}–${pages[j]}`)
    i = j + 1
  }
  return runs.join(', ')
}
