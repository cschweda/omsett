import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { formatById, registry } from '@omsett/registry'
import { describe, expect, it } from 'vitest'
import { createNodeEngines } from '../node'
import { Refusal } from '../util'
import { LAYERS } from './index'
import { startQpdf } from './loader'
import { pagesFrom } from './range'

// A PDF taken apart by qpdf. full-of-things.pdf holds, marked SECRET-, everything that must not
// go with its pages (fixtures/_tools/make-pdfs.py); each page says which it is, and page 2 has a
// form with words typed into it, which must stay, drawn on the page.

const engines = createNodeEngines()
const fixture = async (path: string) => new Uint8Array(await readFile(new URL(`../../../../fixtures/${path}`, import.meta.url)))
const pdf = formatById(registry, 'pdf')!
const md = formatById(registry, 'md')!

async function split(bytes: Uint8Array, take = 'every') {
  const outputs = await engines.qpdf!.convert({
    blob: new Blob([bytes as BlobPart]),
    name: 'full-of-things.pdf',
    from: pdf,
    to: pdf,
    options: { take },
    signal: new AbortController().signal,
    onProgress: () => {},
  })
  return Promise.all(outputs.map(async (output) => ({ ...output, bytes: new Uint8Array(await output.blob.arrayBuffer()) })))
}
/** What a PDF says, read by Omsett's own PDF reader, to Markdown. */
async function words(bytes: Uint8Array): Promise<string> {
  const [page] = await engines.pdf!.convert({ blob: new Blob([bytes as BlobPart]), name: 'x.pdf', from: pdf, to: formatById(registry, 'html')!, options: {}, signal: new AbortController().signal, onProgress: () => {} })
  const [markdown] = await engines.markup!.convert({ blob: page!.blob, name: 'x.html', from: formatById(registry, 'html')!, to: md, options: {}, signal: new AbortController().signal, onProgress: () => {} })
  return markdown!.blob.text()
}
const latin1 = (bytes: Uint8Array) => new TextDecoder('latin1').decode(bytes)

describe('a PDF taken apart by qpdf', () => {
  it('gives a PDF for every page, each saying the page it was', async () => {
    const pages = await split(await fixture('pdf/full-of-things.pdf'))
    expect(pages.map((page) => page.name)).toEqual(['full-of-things-page-1.pdf', 'full-of-things-page-2.pdf', 'full-of-things-page-3.pdf', 'full-of-things-page-4.pdf'])
    for (const [i, page] of pages.entries()) {
      const said = await words(page.bytes)
      expect(said, page.name).toContain(`Page ${i + 1} of 4`)
      for (const other of [1, 2, 3, 4].filter((n) => n !== i + 1)) expect(said, page.name).not.toContain(`Page ${other} of 4`)
    }
  })

  it('carries nothing that runs, nothing attached, no comment, no author, and no tags that describe pages left out', async () => {
    for (const page of await split(await fixture('pdf/full-of-things.pdf'))) {
      expect(latin1(page.bytes), page.name).not.toContain('SECRET')
      expect(latin1(page.bytes), page.name).not.toMatch(/\/(JS|JavaScript|AA|OpenAction|Launch|EmbeddedFile|StructTreeRoot|Metadata|AcroForm)\b/)
    }
    const [first] = await split(await fixture('pdf/full-of-things.pdf'))
    expect(first!.note).toMatch(/Left out: .*scripts and actions/)
    expect(first!.note).toMatch(/comments/)
    expect(first!.note).toMatch(/attached files/)
  })

  it('keeps a link to a web address, and the words typed into a form, drawn on the page', async () => {
    const pages = await split(await fixture('pdf/full-of-things.pdf'))
    const second = pages[1]!
    expect(latin1(second.bytes)).toContain('https://omsett.com')
    expect(await words(second.bytes)).toContain('TYPED-WORDS')
  })

  it('takes a range of pages as one PDF, in the order asked', async () => {
    const [taken, ...rest] = await split(await fixture('pdf/full-of-things.pdf'), '4, 2-1')
    expect(rest).toHaveLength(0)
    expect(taken!.name).toBe('full-of-things.pdf')
    expect(taken!.note).toContain('Pages 4, 2, 1 of 4, as one PDF.')
    const said = await words(taken!.bytes)
    const at = [4, 2, 1].map((n) => said.indexOf(`Page ${n} of 4`))
    expect(at.every((place) => place >= 0)).toBe(true)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
    expect(said).not.toContain('Page 3 of 4')
    expect(latin1(taken!.bytes)).not.toContain('SECRET')
  })

  it('refuses a range it cannot read, or pages the PDF does not have, in words that say why', async () => {
    const bytes = await fixture('pdf/full-of-things.pdf')
    await expect(split(bytes, '')).rejects.toThrow('Say which pages to take, such as 2-5, 9')
    await expect(split(bytes, '9')).rejects.toThrow('This PDF has 4 pages, so there is no page 9')
    await expect(split(bytes, '0-2')).rejects.toThrow('so there is no page 0')
    await expect(split(bytes, 'two')).rejects.toThrow('"two" is not a page or a range of pages')
    await expect(split(bytes, '1; rm -rf')).rejects.toThrow(Refusal)
  })

  it('refuses a PDF that is protected, one that is damaged, one that hides layers, and one with redactions not yet applied', async () => {
    const original = await fixture('pdf/full-of-things.pdf')
    // Protected: encrypted by qpdf itself, with no password needed to open it.
    const qpdf = await startQpdf(createRequire(import.meta.url).resolve('@neslinesli93/qpdf-wasm/dist/qpdf.wasm'), () => {})
    qpdf.FS.writeFile('/plain.pdf', original)
    expect(qpdf.callMain(['/plain.pdf', '--encrypt', '', 'owner', '256', '--modify=none', '--', '/locked.pdf'])).toBe(0)
    await expect(split(qpdf.FS.readFile('/locked.pdf'))).rejects.toThrow('This PDF is protected')
    // Damaged: one entry of the table of where each object is points three bytes wrong, or a
    // stream says it is longer than it is. qpdf, asked to list the file, will not guess.
    const offset = latin1(original).replace(/(\d{10}) 00000 n/, (line, at: string) => `${String(Number(at) + 3).padStart(10, '0')} 00000 n`)
    const length = latin1(original).replace(/\/Length (\d+)/, (line, size: string) => `/Length ${Number(size) + 4}`)
    for (const damaged of [offset, length]) await expect(split(Uint8Array.from(damaged, (letter) => letter.charCodeAt(0)))).rejects.toThrow('This file is not a valid PDF')
    await expect(split(await fixture('pdf/three-pages.pdf'))).rejects.toThrow('This PDF has layers, which can keep parts of a page hidden')
    // A redaction marked and not applied, written over the pop-up in the same number of bytes.
    const redacted = latin1(original).replace('/Subtype /Popup /Rect [420 600 560 700]', '/Subtype /Redact /Rect [420 600 560 70]')
    expect(redacted.length).toBe(original.length)
    await expect(split(Uint8Array.from(redacted, (letter) => letter.charCodeAt(0)))).rejects.toThrow('marks parts of its pages to be blacked out')
    await expect(split(new TextEncoder().encode('not a PDF at all'))).rejects.toThrow('This file is not a valid PDF')
    // One byte more in one place, and every position after it is off by one: qpdf repairs that,
    // says so, and the file is refused.
    const longer = latin1(original).replace('(SECRET-TITLE)', '(SECRET-TITLE!)')
    await expect(split(Uint8Array.from(longer, (letter) => letter.charCodeAt(0)))).rejects.toThrow('This PDF is damaged: qpdf had to repair it to read it, so it is not split')
  })

  it('goes on splitting after refusals, with nothing left behind in its memory to spoil the next', async () => {
    const good = await fixture('pdf/full-of-things.pdf')
    for (let i = 0; i < 10; i++) await expect(split(new TextEncoder().encode('%PDF-1.7 broken'))).rejects.toThrow()
    expect(await split(good)).toHaveLength(4)
  })
})

describe('the pages a person asks for', () => {
  it('reads numbers and ranges, in the order written, and never anything else', () => {
    expect(pagesFrom('2-5, 9', 10)).toEqual([2, 3, 4, 5, 9])
    expect(pagesFrom('9 , 1', 10)).toEqual([9, 1])
    expect(pagesFrom('8-', 10)).toEqual([8, 9, 10])
    expect(pagesFrom('-3', 10)).toEqual([1, 2, 3])
    expect(pagesFrom('3 - 1', 10)).toEqual([3, 2, 1])
    expect(pagesFrom('2–4', 10)).toEqual([2, 3, 4])
    for (const words of ['1.5', '--', '1-2-3', '1e3', '0x2', 'page 2']) expect(() => pagesFrom(words, 10), words).toThrow(Refusal)
    expect(() => pagesFrom('1-999999', 10)).toThrow('there is no page 999,999')
    expect(() => pagesFrom(Array.from({ length: 30 }, () => '1-100').join(','), 100)).toThrow('more than 2,000 pages')
  })
})

/** A PDF of three pages, each saying its number, with these objects added and these words in its catalog and pages. */
function made({ catalog = '', pages = ['', '', ''], objects = {} as Record<number, string>, resources = (_page: number) => `<< /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >>` as string } = {}): Uint8Array {
  const all: Record<number, string> = {
    1: `<< /Type /Catalog /Pages 2 0 R ${catalog} >>`,
    2: '<< /Type /Pages /Kids [10 0 R 12 0 R 14 0 R] /Count 3 >>',
    ...objects,
  }
  for (let i = 0; i < 3; i++) {
    const content = `BT /F1 24 Tf 72 720 Td (Page ${i + 1} of 3) Tj ET`
    all[10 + i * 2] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources ${resources(i)} /Contents ${11 + i * 2} 0 R ${pages[i]} >>`
    all[11 + i * 2] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`
  }
  let out = '%PDF-1.7\n'
  const at: Record<number, number> = {}
  const numbers = Object.keys(all).map(Number).sort((a, b) => a - b)
  for (const n of numbers) {
    at[n] = out.length
    // A stream's length is counted here, never written by hand.
    const body = all[n]!.replace(/\/Length \d+ ?/, '').replace(/^<<([\s\S]*?)>>\nstream\n([\s\S]*)\nendstream$/, (whole, dict: string, data: string) => `<<${dict} /Length ${data.length} >>\nstream\n${data}\nendstream`)
    out += `${n} 0 obj\n${body}\nendobj\n`
  }
  const size = Math.max(...numbers) + 1
  const start = out.length
  out += `xref\n0 ${size}\n0000000000 65535 f \n`
  for (let n = 1; n < size; n++) out += at[n] === undefined ? '0000000000 65535 f \n' : `${String(at[n]).padStart(10, '0')} 00000 n \n`
  out += `trailer\n<< /Size ${size} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${start}\n%%EOF\n`
  return Uint8Array.from(out, (letter) => letter.charCodeAt(0))
}
const info = { 3: '<< /Author (SECRET-AUTHOR) /Title (SECRET-TITLE) >>' }

describe('what a review found going with the pages, each closed', () => {
  it('splits a long PDF, and many PDFs in a row, without wearing qpdf out', async () => {
    for (let i = 0; i < 15; i++) expect(await split(await fixture('pdf/full-of-things.pdf'))).toHaveLength(4)
    const kids = Array.from({ length: 300 }, (_, i) => `${10 + i * 2} 0 R`).join(' ')
    const many: Record<number, string> = { 2: `<< /Type /Pages /Kids [${kids}] /Count 300 >>` }
    for (let i = 0; i < 300; i++) {
      many[10 + i * 2] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents ${11 + i * 2} 0 R >>`
      many[11 + i * 2] = '<< /Length 0 >>\nstream\n\nendstream'
    }
    const long = made({ objects: many })
    expect(await split(long)).toHaveLength(300)
  }, 120_000)

  it('carries no attached file, however it is attached', async () => {
    const file = { 4: '<< /Type /Filespec /F (a.txt) /EF << /F 5 0 R >> >>', 5: '<< /Length 17 >>\nstream\nSECRET-ATTACHMENT\nendstream' }
    for (const where of [{ catalog: '/AF [4 0 R]' }, { pages: ['/AF [4 0 R]', '', ''] }]) {
      const [first] = await split(made({ ...where, objects: file }))
      expect(latin1(first!.bytes)).not.toContain('SECRET')
      expect(first!.note).toContain('attached files')
    }
  })

  it('refuses a PDF with layers of any kind, however they hide what they hide', async () => {
    const group = { 4: '<< /Type /OCG /Name (Notes) >>', 5: '<< /Type /OCMD /OCGs [4 0 R] /P /AllOff >>' }
    const drawn = (i: number) => (i === 0 ? '<< /Properties << /L 5 0 R >> >>' : '<< >>')
    await expect(split(made({ objects: group, resources: drawn }))).rejects.toThrow(LAYERS)
    await expect(split(made({ catalog: '/OCProperties << /OCGs [4 0 R] /D << /AS [<< /Event /View /OCGs [4 0 R] /Category [/View] >>] >> >>', objects: group }))).rejects.toThrow(LAYERS)
  })

  it('carries no text of a page not taken through resources the pages share', async () => {
    const shared = {
      4: '<< /XObject << /X1 5 0 R /X3 6 0 R >> /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >>',
      5: '<< /Type /XObject /Subtype /Form /BBox [0 0 100 100] /Length 9 >>\nstream\n0 0 1 1 re\nendstream',
      6: '<< /Type /XObject /Subtype /Form /BBox [0 0 100 100] /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> /Length 38 >>\nstream\nBT /F1 9 Tf (SECRET-PAGE-THREE-TEXT) Tj ET\nendstream',
    }
    const [first] = await split(made({ objects: shared, resources: () => '4 0 R' }), '1')
    expect(latin1(first!.bytes)).not.toContain('SECRET-PAGE-THREE-TEXT')
  })

  it('carries no author, signer or thread, whatever else points to them', async () => {
    const pointed = made({
      catalog: '/DSS << /Certs [6 0 R] >>',
      pages: ['/Foo 3 0 R /B [7 0 R]', '', ''],
      objects: { ...info, 6: '<< /Length 18 >>\nstream\nSECRET-CERTIFICATE\nendstream', 7: '<< /T 8 0 R /P 10 0 R >>', 8: '<< /I << /Title (SECRET-THREAD) >> >>' },
    })
    for (const page of await split(pointed)) expect(latin1(page.bytes), page.name).not.toContain('SECRET')
  })

  it('keeps a jump or a link as only where it goes, and nothing beside it', async () => {
    const link = '/Annots [<< /Type /Annot /Subtype /Link /Rect [0 0 50 50] /A << /S /GoTo /D [10 0 R /Fit] /Win << /F (SECRET.exe) >> /URI (http://SECRET) >> >> << /Type /Annot /Subtype /Link /Rect [60 0 90 50] /A << /S /URI /URI (https://omsett.com) /F (SECRET-FILE) >> >>]'
    const [first] = await split(made({ pages: [link, '', ''] }), '1')
    expect(latin1(first!.bytes)).not.toContain('SECRET')
    expect(latin1(first!.bytes)).toContain('https://omsett.com')
    expect(latin1(first!.bytes)).toMatch(/\/S \/GoTo/)
  })

  it('never unpacks a stream packed to many thousand times its size, so it costs neither time nor memory', async () => {
    const { deflateSync } = await import('node:zlib')
    const bomb = deflateSync(deflateSync(Buffer.alloc(64 * 1024 * 1024)))
    // Byte for byte: TextDecoder's "latin1" is Windows-1252, and would change some bytes.
    const body = bomb.toString('latin1')
    const started = performance.now()
    const [first] = await split(made({ objects: { 4: `<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter [/FlateDecode /FlateDecode] /Length ${bomb.length} >>\nstream\n${body}\nendstream` }, resources: (i) => (i === 0 ? '<< /XObject << /I 4 0 R >> >>' : '<< >>') }), '1')
    // 64 MB inside; qpdf may take off the outer layer of packing, never the inner.
    expect(first!.bytes.length).toBeLessThan(1024 * 1024)
    expect(performance.now() - started).toBeLessThan(5000)
  })
})
