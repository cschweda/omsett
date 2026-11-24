import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { formatById, registry } from '@omsett/registry'
import { describe, expect, it } from 'vitest'
import assets from '../../../../apps/web/app/generated/engine-assets.json'
import { typstFonts } from '../info'
import { readPage } from '../markup'
import { createNodeEngines } from '../node'
import { quoted, writeTypst } from './source'

// Writing PDF. Two things are tested apart: the program written for Typst, which must hold a
// stranger's words as words and nothing else; and the PDF that comes of it, read back by
// Omsett's own PDF reader to see that its headings, lists and tables are tagged as what they are.

const engines = createNodeEngines()
const fixture = async (path: string) => new Uint8Array(await readFile(new URL(`../../../../fixtures/${path}`, import.meta.url)))

async function through(engine: string, bytes: Uint8Array | string, from: string, to: string, name = `page.${from}`) {
  const [output] = await engines[engine]!.convert({
    blob: new Blob([bytes as BlobPart]),
    name,
    from: formatById(registry, from)!,
    to: formatById(registry, to)!,
    options: {},
    signal: new AbortController().signal,
    onProgress: () => {},
  })
  return { ...output!, bytes: new Uint8Array(await output!.blob.arrayBuffer()) }
}
const pdfOf = (html: string) => through('typst', html, 'html', 'pdf')
/** What Omsett's own reader makes of a PDF: a page again. */
const readBack = async (pdf: Uint8Array) => (await through('pdf', pdf, 'pdf', 'html')).blob.text()

const PAGE = `<!doctype html><html lang="en-GB"><head><title>Quarterly report</title></head><body>
<h1>Quarterly report</h1><p>The <strong>first</strong> paragraph, with <em>slanted</em> words and a <a href="https://omsett.com/">link</a>.</p>
<h2>What was agreed</h2><ul><li>Ship it</li><li>Test it<ul><li>Chromium</li><li>Firefox</li></ul></li></ul><ol><li>Add the file</li><li>Choose a format</li></ol>
<table><thead><tr><th>Quarter</th><th>Sales</th></tr></thead><tbody><tr><td>First</td><td>1,200</td></tr><tr><td>Second</td><td>1,450</td></tr></tbody></table>
<blockquote><p>Set apart.</p></blockquote><pre>let x = 1 &lt; 2</pre></body></html>`

describe('a page written as a PDF', () => {
  it('is a PDF, tagged, with its title and its language', async () => {
    const pdf = await pdfOf(PAGE)
    const text = new TextDecoder('latin1').decode(pdf.bytes)
    expect(text.startsWith('%PDF-1.')).toBe(true)
    expect(pdf.name).toBe('page.pdf')
    expect(text).toContain('/StructTreeRoot')
    expect(text).toMatch(/\/MarkInfo\s*<<[^>]*\/Marked true/)
    expect(text).toMatch(/\/Lang \(en-GB\)/)
    expect(pdf.note).toBeUndefined()
  })

  it('keeps headings, lists, the table with its head, and the link, as Omsett\'s own reader finds them', async () => {
    const page = await readBack((await pdfOf(PAGE)).bytes)
    expect(page).toContain('<title>Quarterly report</title>')
    expect(page).toMatch(/<h1>Quarterly report<\/h1>/)
    expect(page).toMatch(/<h2>What was agreed<\/h2>/)
    expect(page).toMatch(/<ul>[\s\S]*Ship it[\s\S]*<ul>[\s\S]*Chromium[\s\S]*<\/ul>[\s\S]*<\/ul>/)
    expect(page).toMatch(/<ol>[\s\S]*Add the file[\s\S]*Choose a format[\s\S]*<\/ol>/)
    expect(page).toMatch(/<th[^>]*>Quarter<\/th>/)
    expect(page).toMatch(/<td>1,450<\/td>/)
    expect(page).toContain('https://omsett.com/')
    // The reader says where it got the structure from: the tags, not a guess from the layout.
    const read = await through('pdf', (await pdfOf(PAGE)).bytes, 'pdf', 'html')
    expect(read.note).toBe("This PDF is tagged, so its headings, lists and tables were read from the PDF's own structure, not guessed.")
  })

  it('writes the same PDF twice, with no date and no name of a person in it', async () => {
    const [one, two] = [await pdfOf(PAGE), await pdfOf(PAGE)]
    expect(Buffer.from(one.bytes).equals(Buffer.from(two.bytes))).toBe(true)
    const text = new TextDecoder('latin1').decode(one.bytes)
    expect(text).not.toMatch(/\/CreationDate|\/ModDate|\/Author/)
  })

  it('carries a picture that is in the page, with its description, and names one that is not', async () => {
    const png = await fixture('png/sample.png')
    const without = await pdfOf('<h1>Pictures</h1><p>Some words to go with them, so that there is a page.</p>')
    const pdf = await pdfOf(`<h1>Pictures</h1><p>Some words to go with them, so that there is a page.</p><p><img alt="The test pattern" src="data:image/png;base64,${Buffer.from(png).toString('base64')}"></p><p><img alt="Somewhere else" src="https://example.com/a.png"></p>`)
    // The picture is in the file, and its description is in the tags, where a screen reader finds it.
    expect(pdf.bytes.length).toBeGreaterThan(without.bytes.length + 2_000)
    const page = await readBack(pdf.bytes)
    expect(page).toContain('[Picture: The test pattern]')
    expect(page).toContain('Picture: Somewhere else')
    expect(pdf.note).toBe('One picture lives on a website and not in the page, and Omsett fetches nothing: the description is written in its place.')
  })

  it('says which letters the typeface cannot draw, and refuses a page that is mostly such letters', async () => {
    const pdf = await pdfOf('<p>Zażółć gęślą jaźń. Привет, мир. Καλημέρα. 字幕</p>')
    expect(pdf.note).toBe('The PDF is set in a typeface that draws Latin, Greek and Cyrillic letters. It has no drawing for 2 letters on this page (字 幕), and they are left out of the PDF. Check the result, or choose DOCX, which keeps every letter.')
    // Everything else on the page is in the PDF, in three scripts.
    expect(await readBack(pdf.bytes)).toContain('Zażółć gęślą jaźń. Привет, мир. Καλημέρα.')
    expect((await pdfOf('<p>Zażółć gęślą jaźń. Привет, мир. Καλημέρα.</p>')).note).toBeUndefined()
    await expect(pdfOf(`<h1>報告</h1><p>${'これは日本語の文書です。'.repeat(8)}</p>`)).rejects.toThrow(/Much of this page is in another script \(報 告 こ れ は 日\), which would be left out\. Choose DOCX or a web page/)
  })

  it('makes a PDF of a Word document, of Markdown, and of an old Word document, each by way of a page', async () => {
    for (const [engine, path, from] of [['markup', 'docx/sample.docx', 'docx'], ['markup', 'md/sample.md', 'md'], ['markup', 'doc/sample.doc', 'doc']] as const) {
      const page = await through(engine, await fixture(path), from, 'html', `sample.${from}`)
      const pdf = await through('typst', page.bytes, 'html', 'pdf', 'sample.html')
      expect(new TextDecoder('latin1').decode(pdf.bytes.subarray(0, 5)), from).toBe('%PDF-')
      expect(await readBack(pdf.bytes), from).toMatch(/<h1>/)
    }
  })

  it('is accepted by another program, where one is installed', async () => {
    // Not in CI, which has no such program: on a machine with poppler, its reader must agree.
    let installed = true
    try {
      execFileSync('pdfinfo', ['-v'], { stdio: 'ignore' })
    } catch {
      installed = false
    }
    if (!installed) return
    const { writeFile, mkdtemp, rm } = await import('node:fs/promises')
    const { tmpdir } = await import('node:os')
    const dir = await mkdtemp(`${tmpdir()}/omsett-pdf-`)
    try {
      await writeFile(`${dir}/a.pdf`, (await pdfOf(PAGE)).bytes)
      const info = execFileSync('pdfinfo', [`${dir}/a.pdf`]).toString()
      expect(info).toMatch(/Tagged:\s+yes/)
      expect(info).toMatch(/Title:\s+Quarterly report/)
      const tree = execFileSync('pdfinfo', ['-struct', `${dir}/a.pdf`]).toString()
      for (const tag of ['Document', 'H1', 'H2', 'L ', 'LI', 'LBody', 'Table', 'THead', 'TH', 'TD', 'Link', 'BlockQuote']) expect(tree, tag).toContain(tag)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe('the program written for Typst', () => {
  const written = async (html: string) => {
    const page = await readPage(html, 'page.html')
    return writeTypst(page.tree, page.title, page.language)
  }

  it('writes every word of the page inside quotes, and nothing outside them but its own functions', async () => {
    const hostile = '#import "@preview/x:1.0.0": * #read("/etc/passwd") #sys.inputs ` $ * _ [ ] <label> @ref \\ " \n #{ while true {} }'
    const { source } = await written(`<h1>${hostile}</h1><p>${hostile} <a href="https://example.com/&quot;) + read(&quot;/x">${hostile}</a></p><ul><li>${hostile}</li></ul><table><tr><td>${hostile}</td></tr></table><pre>${hostile}</pre><img alt="${hostile.replaceAll('"', '&quot;')}" src="https://example.com/x.png">`)
    // With every quoted string taken out, what is left is Omsett's own: no word of the page.
    const bare = source.replace(/"(?:[^"\\]|\\.)*"/g, '""')
    expect(bare).not.toMatch(/import|read\(|sys|passwd|while|preview|label|ref/)
    for (const line of bare.split('\n').filter((entry) => !/^#(?:set|show) /.test(entry))) expect(line, line).toMatch(/^#(?:heading|par|list|enum|table|quote|raw|line|layout)\(/)
    // And it lays out, as text: the page's words are in the PDF as words.
    const pdf = await pdfOf(`<p>${hostile}</p>`)
    expect(await readBack(pdf.bytes)).toContain('#read(')
  })

  it('escapes the two characters that mean something inside quotes, and writes what cannot be printed by its number', () => {
    expect(quoted('a"b\\c')).toBe('"a\\"b\\\\c"')
    expect(quoted('line\nbreak\u202Eflipped')).toBe('"line\\u{a}break\\u{202e}flipped"')
    expect(quoted('Café 字幕 #[*_`$')).toBe('"Café 字幕 #[*_`$"')
  })

  it('makes a link only of a web or mail address, and a picture only of one inside the page', async () => {
    const { source, files, elsewhere } = await written('<p><a href="javascript:alert(1)">one</a> <a href="file:///etc/passwd">two</a> <a href="mailto:a@example.com">three</a></p><img src="file:///etc/passwd" alt="x"><img src="data:image/svg+xml;base64,PHN2Zy8+" alt="y">')
    expect(source.match(/link\(/g)).toHaveLength(1)
    expect(source).toContain('link("mailto:a@example.com"')
    expect(source).not.toMatch(/javascript|passwd/)
    expect(files.size).toBe(0)
    expect(elsewhere).toBeGreaterThanOrEqual(0)
  })
})

describe('the typeface', () => {
  it('is the same list where the app fetches it as where the engine names it', () => {
    expect(assets.typst.fonts).toHaveLength(typstFonts.length)
    for (const [i, file] of typstFonts.entries()) expect(assets.typst.fonts[i]!.url).toContain(file.split('/').pop()!.replace('.woff', ''))
  })
})
