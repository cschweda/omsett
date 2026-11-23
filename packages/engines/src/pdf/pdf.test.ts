import { readFile } from 'node:fs/promises'
import { formatById, registry } from '@omsett/registry'
import { describe, expect, it } from 'vitest'
import { createMarkupEngine } from '../markup'
import { Refusal } from '../util'
import { createPdfEngine, ESTIMATED, ESTIMATED_DESPITE_TAGS, TAGGED } from './index'

const fixture = async (path: string) => new Uint8Array(await readFile(new URL(`../../../../fixtures/${path}`, import.meta.url)))
async function convert(input: Uint8Array | string) {
  const [output] = await createPdfEngine().convert({
    blob: new Blob([input as BlobPart]),
    name: 'report.pdf',
    from: formatById(registry, 'pdf')!,
    to: formatById(registry, 'html')!,
    options: {},
    signal: new AbortController().signal,
    onProgress: () => {},
  })
  return { html: (await output!.blob.text()).replace(/\n/g, ''), note: output!.note }
}
const refusal = (work: Promise<unknown>) =>
  work.then(
    () => null,
    (error: unknown) => (error instanceof Refusal ? error.message : `not a Refusal: ${String(error)}`),
  )
/** The sample with some of its bytes replaced, the cross-reference table left to be rebuilt. */
const altered = async (path: string, from: string, to: string) => {
  const text = Buffer.from(await fixture(path)).toString('latin1')
  if (!text.includes(from)) throw new Error(`the sample does not hold ${from}`)
  return new Uint8Array(Buffer.from(text.replace(from, to), 'latin1'))
}

describe('a tagged PDF', () => {
  it('is read from its tags: headings, a list, a table with header cells, a link, a picture described', async () => {
    const { html, note } = await convert(await fixture('pdf/sample.pdf'))
    expect(note).toBe(TAGGED)
    expect(html).toContain('<html lang="en-GB">')
    expect(html).toContain('<title>About Omsett</title>')
    expect(html).toContain('<h1>About Omsett</h1>')
    // Two lines on the page, one paragraph in the tags: one paragraph.
    expect(html).toContain('<p>Drop a file. Pick a format. Nothing leaves your device, and nothing is uploaded. Café tables &#x26; &#x3C;angle> brackets.</p>')
    expect(html).toContain('<h2>What it converts</h2>')
    // The bullets are the list's own, and are not carried in as text.
    expect(html).toContain('<ul><li>Pictures</li><li>Documents and workbooks</li></ul>')
    expect(html).toContain('<table><thead><tr><th>Format</th><th>Kind</th></tr></thead><tbody><tr><td>PNG</td><td>Picture</td></tr><tr><td>XLSX</td><td>Workbook</td></tr></tbody></table>')
    expect(html).toContain('<a href="https://omsett.com/">omsett.com</a>')
    expect(html).toContain('<p>[Picture: The Omsett mark: a word in white with a blue square]</p>')
  })

  it('leaves out page furniture and the author', async () => {
    const { html } = await convert(await fixture('pdf/sample.pdf'))
    expect(html.includes('SECRET-ARTIFACT')).toBe(false)
    expect(html.includes('SECRET-AUTHOR')).toBe(false)
  })

  it('becomes Markdown by way of the page', async () => {
    const { html } = await convert(await fixture('pdf/sample.pdf'))
    const [output] = await createMarkupEngine().convert({
      blob: new Blob([html]),
      name: 'report.html',
      from: formatById(registry, 'html')!,
      to: formatById(registry, 'md')!,
      options: {},
      signal: new AbortController().signal,
      onProgress: () => {},
    })
    const md = await output!.blob.text()
    expect(md).toContain('# About Omsett\n\nDrop a file.')
    expect(md).toContain('## What it converts\n\n- Pictures\n- Documents and workbooks')
    expect(md).toContain('| Format | Kind')
    expect(md).toContain('[omsett.com](https://omsett.com/)')
  })

  it('is not believed when its tags leave some of the text out', async () => {
    // The heading's words are put in a run that no tag refers to. Read by its tags alone, the
    // page would come out without its heading and with nothing to say so.
    const { html, note } = await convert(await altered('pdf/sample.pdf', '/H1 << /MCID 0 >> BDC', '/Xx << /MCID 90 >> BDC'))
    expect(note).toBe(ESTIMATED_DESPITE_TAGS)
    expect(html).toContain('<h1>About Omsett</h1>')
  })

  it('is read from its layout when its tags say only "this is a page"', async () => {
    // The file's table of where its parts are is thrown off by this; the reader rebuilds it.
    const flat = Buffer.from(await fixture('pdf/sample.pdf')).toString('latin1').replace(/\/S \/(?:H1|H2|P|L|LI|Lbl|LBody|Table|TR|TH|TD|Link|Figure)\b/g, '/S /Sect')
    const { html, note } = await convert(new Uint8Array(Buffer.from(flat, 'latin1')))
    expect(note).toBe(ESTIMATED_DESPITE_TAGS)
    expect(html).toContain('<h1>About Omsett</h1>')
    expect(html).toContain('Nothing leaves your device')
  })
})

describe('an untagged PDF', () => {
  it('has its structure estimated from the look of the page, and says so', async () => {
    const { html, note } = await convert(await fixture('pdf/untagged.pdf'))
    expect(note).toBe(ESTIMATED)
    // The largest type is the top heading; type between that and the body's is the next.
    expect(html).toContain('<h1>About Omsett</h1>')
    expect(html).toContain('<h2>What it converts</h2>')
    // Two lines close together are one paragraph; a line that opens with a bullet is an item.
    expect(html).toContain('<p>Drop a file. Pick a format. Nothing leaves your device, and nothing is uploaded. Café tables &#x26; &#x3C;angle> brackets.</p>')
    expect(html).toContain('<ul><li>Pictures</li><li>Documents and workbooks</li></ul>')
    // A number alone at the foot of the page is the page's number.
    expect(html.includes('<p>1</p>')).toBe(false)
    // A table cannot be told from the look of four lines, and is not pretended to be.
    expect(html.includes('<table>')).toBe(false)
    expect(html).toContain('Format Kind')
  })
})

describe('what is not a PDF Omsett can read', () => {
  it('is refused, each for its own reason', async () => {
    expect(await refusal(convert('not a PDF at all'))).toBe('This file is not a valid PDF')
    expect(await refusal(convert(new Uint8Array(0)))).toBe('This file is not a valid PDF')
  })

  it('is refused when it has no words: a scan', async () => {
    const text = Buffer.from(await fixture('pdf/untagged.pdf')).toString('latin1')
    // Every instruction to draw text becomes one to draw a grey box.
    const scan = text.replace(/BT [^\n]* ET/g, (line) => `0.5 g 0 0 9 9 re f${' '.repeat(line.length - 18)}`)
    expect(await refusal(convert(new Uint8Array(Buffer.from(scan, 'latin1'))))).toBe(
      'This PDF has no text in it. It may be a scan: pictures of pages, which Omsett cannot read the words in yet',
    )
  })
})
