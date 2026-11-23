import { readFile } from 'node:fs/promises'
import { formatById, registry } from '@omsett/registry'
import { describe, expect, it } from 'vitest'
import { readZip, writeZip } from '../archive/zip'
import { Refusal } from '../util'
import { createMarkupEngine } from './index'

const fixture = async (path: string) => new Uint8Array(await readFile(new URL(`../../../../fixtures/${path}`, import.meta.url)))
async function convert(input: Uint8Array | string, from: string, to: string, name = `sample.${from}`) {
  const [output] = await createMarkupEngine().convert({
    blob: new Blob([input as BlobPart]),
    name,
    from: formatById(registry, from)!,
    to: formatById(registry, to)!,
    options: {},
    signal: new AbortController().signal,
    onProgress: () => {},
  })
  return new Uint8Array(await output!.blob.arrayBuffer())
}
const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes)
const refusal = (work: Promise<unknown>) =>
  work.then(
    () => null,
    (error: unknown) => (error instanceof Refusal ? error.message : `not a Refusal: ${String(error)}`),
  )
/** The parts of a document Omsett wrote, by name. */
async function partsOf(docx: Uint8Array) {
  return Object.fromEntries((await readZip(docx)).map((entry) => [entry.name, text(entry.data)]))
}
/** The sample document with one part replaced, removed or added. */
async function altered(change: Record<string, string | null>): Promise<Uint8Array> {
  const entries = (await readZip(await fixture('docx/sample.docx'))).filter((entry) => change[entry.name] !== null)
  for (const entry of entries) if (typeof change[entry.name] === 'string') entry.data = new TextEncoder().encode(change[entry.name]!)
  for (const [name, body] of Object.entries(change)) {
    if (typeof body === 'string' && !entries.some((entry) => entry.name === name)) {
      entries.push({ name, data: new TextEncoder().encode(body), directory: false, modified: null, executable: false })
    }
  }
  return writeZip(entries)
}
const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
const DOCUMENT = (body: string) => `<w:document ${W}><w:body>${body}</w:body></w:document>`
const P = (words: string) => `<w:p><w:r><w:t>${words}</w:t></w:r></w:p>`

describe('Word documents, read', () => {
  it('keeps the structure a reader relies on', async () => {
    const html = text(await convert(await fixture('docx/sample.docx'), 'docx', 'html'))
    // The language and the title are the document's own.
    expect(html).toContain('<html lang="en-GB">')
    expect(html).toContain('<title>About Omsett</title>')
    // Headings are headings, at their levels, by the style's name.
    expect(html).toContain('<h1>What it does</h1>')
    expect(html).toContain('<h2>What it converts</h2>')
    expect(html).toContain('<strong>Nothing leaves your device.</strong> It is <em>free</em> and <strong><em>open</em></strong> source')
    expect(html).toContain('<a href="https://omsett.com">omsett.com</a>')
    // A list inside a list, and a numbered list after a bulleted one.
    expect(html.replace(/\n/g, '')).toContain('<ul><li>Pictures</li><li>Data<ul><li>JSON and CSV</li><li>Workbooks</li></ul></li><li>Subtitles</li></ul><ol><li>Drop a file</li><li>Pick a format</li></ol>')
    // The row Word marks as repeating is the table's headers.
    expect(html.replace(/\n/g, '')).toContain('<table><thead><tr><th>Format</th><th>Kind</th></tr></thead><tbody><tr><td>PNG</td><td>Picture</td></tr>')
    expect(html.replace(/\n/g, '')).toContain('<blockquote><p>A quotation, set apart.</p></blockquote>')
    // The picture is carried inside the page, with the description its author gave it.
    expect(html).toMatch(/<img src="data:image\/png;base64,[A-Za-z0-9+/=]+" alt="The Omsett mark: a word in white with a blue square">/)
    expect(html).toContain('E = mc<sup>2</sup>, and H<sub>2</sub>O, and <del>struck</del>.')
  })

  it('leaves out what the document does not say: deletions, hidden text, comments, the author', async () => {
    const html = text(await convert(await fixture('docx/sample.docx'), 'docx', 'html'))
    expect(html).toContain('<p>Files are converted in the tab.</p>')
    for (const gone of ['uploaded to a server', 'SECRET-HIDDEN-TEXT', 'SECRET-COMMENT', 'SECRET-AUTHOR']) expect(html.includes(gone), gone).toBe(false)
  })

  it('becomes Markdown in two steps, with the same structure', async () => {
    const md = text(await convert(await convert(await fixture('docx/sample.docx'), 'docx', 'html'), 'html', 'md'))
    expect(md).toContain('# What it does')
    expect(md).toContain('## What it converts')
    expect(md).toContain('  - JSON and CSV')
    expect(md).toContain('1. Drop a file\n2. Pick a format')
    expect(md).toContain('| Format | Kind')
    expect(md).toContain('> A quotation, set apart.')
    expect(md).toMatch(/!\[The Omsett mark: a word in white with a blue square\]\(data:image\/png;base64,/)
  })

  it('never lets a link in a document be code', async () => {
    const rels =
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId4" Target="javascript:alert(1)" TargetMode="External"/></Relationships>'
    const html = text(await convert(await altered({ 'word/_rels/document.xml.rels': rels }), 'docx', 'html'))
    expect(html.includes('javascript')).toBe(false)
    expect(html).toContain('omsett.com')
  })

  it('does not fetch a picture kept on another site, and keeps its description', async () => {
    const original = text((await readZip(await fixture('docx/sample.docx'))).find((entry) => entry.name === 'word/_rels/document.xml.rels')!.data)
    const linked = original.replace('Target="media/image1.png"', 'Target="http://elsewhere.example/track.png" TargetMode="External"')
    const html = text(await convert(await altered({ 'word/_rels/document.xml.rels': linked }), 'docx', 'html'))
    expect(html.includes('elsewhere.example')).toBe(false)
    expect(html).toContain('[Picture: The Omsett mark: a word in white with a blue square]')
  })

  it('refuses what is not a document', async () => {
    const NOT = 'This file is not a valid DOCX document'
    expect(await refusal(convert('not a document', 'docx', 'html'))).toBe(NOT)
    expect(await refusal(convert(await fixture('zip/sample.zip'), 'docx', 'html'))).toBe(NOT)
    expect(await refusal(convert(await fixture('xlsx/sample.xlsx'), 'docx', 'html'))).toBe(NOT)
    expect(await refusal(convert((await fixture('docx/sample.docx')).subarray(0, 2000), 'docx', 'html'))).toBe(NOT)
    expect(await refusal(convert(await altered({ 'word/document.xml': null }), 'docx', 'html'))).toBe(NOT)
    const bomb = `<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "aaaaaaaaaa">]>${DOCUMENT(P('&a;'))}`
    expect(await refusal(convert(await altered({ 'word/document.xml': bomb }), 'docx', 'html'))).toBe(NOT)
    expect(await refusal(convert(await altered({ 'word/document.xml': DOCUMENT('<w:p/><w:p/>') }), 'docx', 'html'))).toBe('This document has no text in it to convert')
  })

  it('refuses a document nested past any that Word would write', async () => {
    const deep = `${'<w:tbl><w:tr><w:tc>'.repeat(200)}${P('deep')}${'</w:tc></w:tr></w:tbl>'.repeat(200)}`
    expect(await refusal(convert(await altered({ 'word/document.xml': DOCUMENT(deep) }), 'docx', 'html'))).toMatch(/not a valid DOCX document|nested too deeply/)
  })
})

describe('Word documents, written', () => {
  const PAGE = `<!doctype html><html lang="fr"><head><title>Le titre</title><style>p{}</style></head><body>
    <h1>Title</h1><p>Hello <strong>bold</strong> <em>it</em> <a href="https://omsett.com">a link</a> <a href="javascript:alert(1)">not a link</a> <code>code</code></p>
    <h2>Second</h2><ul><li>one<ul><li>inner</li></ul></li><li>two</li></ul><ol><li>first</li></ol>
    <table><thead><tr><th>Name</th><th>Kind</th></tr></thead><tbody><tr><td>PNG</td><td>Picture</td></tr></tbody></table>
    <blockquote><p>quoted</p></blockquote><pre><code>line one\n  line two</code></pre>
    <p><img src="data:image/png;base64,PICTURE" alt="A red kite"><img src="https://elsewhere.example/far.png" alt="Far away"><img src="data:text/html;base64,PHNjcmlwdD4=" alt="not a picture"></p>
    <script>alert(2)</script></body></html>`

  it('writes real headings, lists, table headers, language, title and picture descriptions', async () => {
    const picture = Buffer.from(await fixture('_cases/tiny-1x1.png')).toString('base64')
    const parts = await partsOf(await convert(PAGE.replace('PICTURE', picture), 'html', 'docx'))
    const document = parts['word/document.xml']!
    // Headings are in heading styles, which carry an outline level: a screen reader can list them.
    expect(document).toContain('<w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t xml:space="preserve">Title</w:t>')
    expect(document).toContain('<w:pStyle w:val="Heading2"/>')
    expect(parts['word/styles.xml']).toContain('<w:name w:val="heading 2"/>')
    expect(parts['word/styles.xml']).toContain('<w:outlineLvl w:val="1"/>')
    // Lists are lists: bullets (1) and numbers (2), with the inner item a level down.
    expect(document).toContain('<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>')
    expect(document).toContain('<w:numPr><w:ilvl w:val="1"/><w:numId w:val="1"/></w:numPr>')
    expect(document).toContain('<w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr>')
    // The table's first row is marked as its headers, once.
    expect(document.split('<w:tblHeader/>')).toHaveLength(2)
    // The document says what language it is in, and what it is called.
    expect(parts['word/styles.xml']).toContain('<w:lang w:val="fr"/>')
    expect(parts['docProps/core.xml']).toContain('<dc:title>Le titre</dc:title>')
    // A picture in the page goes into the document with its description.
    expect(document).toContain('descr="A red kite"')
    expect(Object.keys(parts)).toContain('word/media/image1.png')
    // A picture on a website is not fetched: its description is written, linked to where it is.
    expect(document).toContain('[Picture: Far away]')
    expect(parts['word/_rels/document.xml.rels']).toContain('Target="https://elsewhere.example/far.png" TargetMode="External"')
    // Code keeps its line breaks and its indentation.
    expect(document).toContain('line one</w:t><w:br/><w:t xml:space="preserve">  line two')
  })

  it('writes nothing that could run', async () => {
    const parts = await partsOf(await convert(PAGE.replace('PICTURE', 'AAAA'), 'html', 'docx'))
    const everything = Object.values(parts).join('\n')
    for (const gone of ['javascript', 'alert', 'data:text/html', '<script']) expect(everything.includes(gone), gone).toBe(false)
    expect(parts['word/document.xml']).toContain('not a link')
  })

  it('comes back from Word as the page it went in as', async () => {
    const first = text(await convert(await fixture('docx/sample.docx'), 'docx', 'html'))
    const again = text(await convert(await convert(first, 'html', 'docx'), 'docx', 'html'))
    expect(again).toBe(first)
  })

  it('refuses a page with nothing in it', async () => {
    expect(await refusal(convert('<!doctype html><html><head><script>x()</script></head><body></body></html>', 'html', 'docx'))).toBe(
      'This file has no text in it to convert',
    )
  })
})
