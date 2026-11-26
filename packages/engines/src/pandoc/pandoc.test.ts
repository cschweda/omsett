import { readFile } from 'node:fs/promises'
import { formatById, registry } from '@omsett/registry'
import { describe, expect, it } from 'vitest'
import { createNodeEngines } from '../node'
import { prepareRtf } from './rtf'

// RTF, read and written by Pandoc, with Omsett's own walk of the RTF before it and cleaning of
// the page after. sample.rtf is written by fixtures/_tools/rtf.py, laid out as Word lays one
// out; from-macos.rtf by macOS's textutil, which knows nothing of Omsett.

const engines = createNodeEngines()
const fixture = async (path: string) => new Uint8Array(await readFile(new URL(`../../../../fixtures/${path}`, import.meta.url)))
async function convert(input: Uint8Array | string, engine: string, from: string, to: string) {
  const [output] = await engines[engine]!.convert({
    blob: new Blob([input as BlobPart]),
    name: `sample.${from}`,
    from: formatById(registry, from)!,
    to: formatById(registry, to)!,
    options: {},
    signal: new AbortController().signal,
    onProgress: () => {},
  })
  return output!.blob
}
// One block to a line on the page; the lines are joined, and nothing else is changed.
const page = async (path: string) => (await (await convert(await fixture(path), 'pandoc', 'rtf', 'html')).text()).replace(/\n(?=<)|(?<=>)\n/g, '')

describe('RTF', () => {
  it('keeps what a reader relies on: headings, emphasis, links, lists at their levels, a table with its heading row, pictures, title and language', async () => {
    const html = await page('rtf/sample.rtf')
    expect(html).toContain('<html lang="en-GB">')
    expect(html).toContain('<title>About Omsett</title>')
    expect(html).toContain('<h1>What it does</h1>')
    expect(html).toContain('<h2>What it converts</h2>')
    expect(html).toContain('<strong>Nothing leaves your device.</strong> It is <em>free</em> and <strong><em>open</em></strong> source; see <a href="https://omsett.com">omsett.com</a>.')
    // A list that comes back from a list inside it is one list, and the numbered list after it stays where it is.
    expect(html).toMatch(/<ul><li><p>Pictures<\/p><\/li><li><p>Data<\/p><ul><li><p>JSON and CSV<\/p><\/li><li><p>Workbooks<\/p><\/li><\/ul><\/li><li><p>Subtitles<\/p><\/li><\/ul><ol><li><p>Drop a file<\/p><\/li><li><p>Pick a format<\/p><\/li><\/ol><table><thead><tr><th>/)
    expect(html).toContain('<p>Café 字幕, and a line<br>broken in two.</p>')
    // The picture is carried; no description is made up for it.
    expect(html).toMatch(/<img src="data:image\/png;base64,[A-Za-z0-9+/=]+" alt="">/)
    expect(html).toContain('A footnote, which is kept.')
  })

  it('leaves out what the author deleted or hid, the instruction behind a field, and the author', async () => {
    const html = await page('rtf/sample.rtf')
    expect(html).toContain('<p>Files are converted in the tab.')
    expect(html).toContain('<p>Included words.</p>')
    for (const gone of ['SECRET-DELETED', 'SECRET-HIDDEN-WORDS', 'SECRET-COMMENT', 'SECRET-OBJECT', 'SECRET-AUTHOR', 'INCLUDETEXT', 'secrets.txt']) expect(html.includes(gone), gone).toBe(false)
  })

  it('reads a document another program wrote, every word in its place', async () => {
    const html = await page('rtf/from-macos.rtf')
    expect(html).toContain('<p>A paragraph with <strong>bold</strong> and <em>italic</em> words and a <a href="https://omsett.com/">link</a>.</p>')
    expect(html).toContain('<ul><li><p>First</p></li><li><p>Second</p><ul><li><p>Inner</p></li></ul></li></ul>')
    // The numbered list is before the table, as it is in the file, not at the top of the page.
    expect(html.indexOf('<ol>')).toBeGreaterThan(html.indexOf('Inner'))
    expect(html.indexOf('<ol>')).toBeLessThan(html.indexOf('<table>'))
    expect(html).toContain('<p>Café 字幕</p>')
  })

  it('writes a page as RTF that reads back as the same page', async () => {
    const source = await (await convert(await fixture('docx/sample.docx'), 'markup', 'docx', 'html')).text()
    const rtf = await (await convert(source, 'markup', 'html', 'rtf')).text()
    expect(rtf.startsWith('{\\rtf1')).toBe(true)
    const back = (await (await convert(rtf, 'pandoc', 'rtf', 'html')).text()).replace(/\n(?=<)|(?<=>)\n/g, '')
    // Read back by Pandoc, which knows nothing of the writer: the same headings, real lists at
    // their levels, the table's heading row, the link, the letters.
    expect(back).toContain('<title>About Omsett</title>')
    expect(back).toContain('<h2>What it converts</h2>')
    expect(back).toContain('<strong>Nothing leaves your device.</strong>')
    expect(back).toContain('<a href="https://omsett.com">omsett.com</a>')
    expect(back).toMatch(/<ul><li><p>Pictures<\/p><\/li><li><p>Data<\/p><ul><li><p>JSON and CSV<\/p><\/li><li><p>Workbooks<\/p><\/li><\/ul><\/li><li><p>Subtitles<\/p><\/li><\/ul>/)
    expect(back).toMatch(/<ol><li><p>Drop a file<\/p><\/li><li><p>Pick a format<\/p><\/li><\/ol>/)
    expect(back).toMatch(/<table><thead><tr><th>/)
    expect(back).toContain('café 字幕')
    expect(back).toContain('E = mc<sup>2</sup>')
  })

  it('walks the RTF before Pandoc does: deleted words out, depth held to a limit, raw bytes held to the file', () => {
    const { rtf } = prepareRtf('{\\rtf1 Kept {\\deleted gone \\u233?}and\\deleted  gone too\\deleted0  kept.}')
    expect(rtf).not.toMatch(/gone/)
    expect(rtf).toContain('Kept ')
    expect(rtf).toContain('kept.')
    expect(() => prepareRtf(`{\\rtf1 ${'{'.repeat(300)}x${'}'.repeat(300)}}`)).toThrow('This file is not a valid RTF document')
    expect(() => prepareRtf('{\\rtf1 {\\bin999999 x}}')).toThrow('This file is not a valid RTF document')
    expect(() => prepareRtf('Not RTF at all')).toThrow('This file is not a valid RTF document')
    expect(() => prepareRtf('{\\rtf1 {\\b cut off before the end')).toThrow('This file is not a valid RTF document')
  })
})

describe('plain text', () => {
  it('becomes a page a paragraph to each block of lines, every letter a letter', async () => {
    const html = await (await convert(await fixture('txt/sample.txt'), 'markup', 'txt', 'html')).text()
    expect(html).toContain('<p>About Omsett</p>')
    expect(html).toContain('<p>Omsett converts files in the browser. Nothing leaves the device: every file is converted in the tab.</p>')
    expect(html).toContain('<p>Café 字幕, &amp; &lt;not a tag&gt;.</p>')
  })

  it('is written from a page with its headings, lists and tables set out as lines', async () => {
    const source = await (await convert(await fixture('docx/sample.docx'), 'markup', 'docx', 'html')).text()
    const text = await (await convert(source, 'markup', 'html', 'txt')).text()
    expect(text).toContain('What it converts\n\n- Pictures\n- Data\n  - JSON and CSV\n  - Workbooks\n- Subtitles\n\n1. Drop a file\n2. Pick a format')
    expect(text).toContain('Format\tKind\nPNG\tPicture')
    expect(text).toContain('[Picture: The Omsett mark: a word in white with a blue square]')
    expect(text).not.toMatch(/<[a-z]/)
  })
})
