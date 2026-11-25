import { readFile } from 'node:fs/promises'
import { detect } from '@omsett/detect'
import { formatById, registry } from '@omsett/registry'
import { describe, expect, it } from 'vitest'
import { readZip, writeZip } from '../archive/zip'
import { describeFile } from '../details'
import { bookPage, createEbookEngine, openedAndClosed, pageParts, readEpub } from './index'

// Reading an EPUB, setting a book out as one page, and cutting a page into a book. The samples
// are written by fixtures/_tools/epub.py: a book of three pages in one folder and a picture in
// another, with a note linked from one page to a mark on the next, as EPUB 3 and as EPUB 2.

interface Tag { type: string; tagName?: string; properties?: Record<string, unknown>; children?: Tag[] }

const engine = createEbookEngine()
const fixture = async (path: string) => new Uint8Array(await readFile(new URL(`../../../../fixtures/${path}`, import.meta.url)))
const format = (id: string) => formatById(registry, id)!

async function converted(bytes: Uint8Array | string, from: string, to: string, name = `book.${from}`) {
  const [output] = await engine.convert({ blob: new Blob([bytes as BlobPart]), name, from: format(from), to: format(to), options: {}, signal: new AbortController().signal, onProgress: () => {} })
  return { output: output!, bytes: new Uint8Array(await output!.blob.arrayBuffer()), text: await output!.blob.text() }
}
const refusal = (bytes: Uint8Array | string, from: string, to: string) => converted(bytes, from, to).then(() => 'converted', (error: Error) => `${error.name}: ${error.message}`)

/** Every link on a page to a place on it, and whether that place is there. */
function links(html: string) {
  const marks = new Set([...html.matchAll(/ id="([^"]*)"/g)].map((match) => match[1]!))
  const inner = [...html.matchAll(/ href="#([^"]*)"/g)].map((match) => match[1]!)
  return { inner, dead: inner.filter((mark) => !marks.has(mark)) }
}

/** A book rebuilt with some of its files changed, added or (given null) taken out. */
async function rebuilt(path: string, change: Record<string, string | null>) {
  const entries = (await readZip(await fixture(path))).filter((entry) => change[entry.name] !== null)
  for (const entry of entries) if (typeof change[entry.name] === 'string') entry.data = new TextEncoder().encode(change[entry.name]!)
  for (const [name, data] of Object.entries(change)) {
    if (data !== null && !entries.some((entry) => entry.name === name)) entries.push({ name, data: new TextEncoder().encode(data), directory: false, modified: null, executable: false })
  }
  return writeZip(entries)
}

describe('reading an EPUB', () => {
  for (const sample of ['epub/sample.epub', 'epub/older.epub']) {
    it(`${sample}: its pages, in order, with what it says of itself`, async () => {
      const parts = await readEpub(await fixture(sample))
      expect(parts.title).toBe('Sample book')
      expect(parts.authors).toEqual(['Omsett'])
      expect(parts.language).toBe('en')
      expect(parts.publisher).toBe('Omsett')
      expect(parts.chapters.map((chapter) => chapter.file)).toEqual(['page0001.xhtml', 'page0002.xhtml', 'page0003.xhtml'])
      expect(parts.chapters[1]!.html).toContain('Café, 字幕, and a second paragraph.')
      expect(parts.pictures.map((picture) => [picture.file, picture.type])).toEqual([['images/image0001.png', 'image/png']])
      expect(parts.cover).toBe('images/image0001.png')
    })

    it(`${sample}: every path in a page is worked out from where the page is`, async () => {
      const { chapters } = await readEpub(await fixture(sample))
      // "../images/square.png" from a page in text/, and "chapter%201.xhtml" with its space.
      expect(chapters[0]!.html).toContain('src="images/image0001.png"')
      expect(chapters[1]!.html).toContain('href="page0003.xhtml#note-1"')
      expect(chapters[2]!.html).toContain('href="page0002.xhtml#kinds"')
      expect(chapters[0]!.html).toContain('href="https://omsett.com/"')
    })
  }

  it('reads the newer list of contents with its levels, and the older where there is no newer', async () => {
    const newer = await readEpub(await fixture('epub/sample.epub'))
    expect(newer.contents).toEqual([
      { label: 'Sample book', file: 'page0001.xhtml', anchor: null, depth: 0 },
      { label: 'The first chapter', file: 'page0002.xhtml', anchor: null, depth: 0 },
      { label: 'What it holds', file: 'page0002.xhtml', anchor: 'kinds', depth: 1 },
      { label: 'Notes', file: 'page0003.xhtml', anchor: null, depth: 0 },
    ])
    const older = await readEpub(await fixture('epub/older.epub'))
    expect(older.contents.map((entry) => entry.label)).toEqual(['Sample book', 'The first chapter', 'Notes'])
  })

  it('keeps the picture of a cover that is a drawing', async () => {
    const { chapters } = await readEpub(await fixture('epub/older.epub'))
    expect(chapters[0]!.html).toContain('<img src="images/image0001.png"')
    expect(chapters[0]!.html).not.toContain('svg')
  })

  it('writes out in full a tag that was written closed, so that it swallows nothing', () => {
    expect(openedAndClosed('<a id="x"/><p>one</p><title/><br/><img src="a.png"/>')).toBe('<a id="x"></a><p>one</p><title></title><br/><img src="a.png"/>')
    // A ">" inside a value is not the end of the tag; a comment is passed over; what is not a tag is left alone.
    expect(openedAndClosed('<a title="a > b"/>x<!-- <b/> -->1 < 2<?xml version="1.0"?>')).toBe('<a title="a > b"></a>x<!-- <b/> -->1 < 2')
    expect(openedAndClosed('<p>never closed <span')).toBe('<p>never closed <span')
  })

  it('keeps every word after tags written closed', async () => {
    const page = await bookPage(await readEpub(await fixture('_traps/tags-written-closed.epub')), 'book.epub')
    for (const words of ['After the mark.', 'After the script.', 'The last words.']) expect(page.html).toContain(`>${words}</p>`)
    // The mark with nothing in it is a place: its name goes to the paragraph after it.
    expect(page.html).toContain('<p id="part-1-mark">After the mark.</p>')
    expect(page.html).not.toMatch(/<a[^>]*><\/a>/)
  })

  it('refuses a locked book, saying so, and reads one whose fonts alone are scrambled', async () => {
    expect(await refusal(await fixture('_traps/copy-protected.epub'), 'epub', 'html')).toBe('Refusal: This book is copy-protected (DRM), and Omsett does not unlock books. Only books without copy protection can be converted')
    expect((await converted(await fixture('_traps/fonts-scrambled.epub'), 'epub', 'html')).text).toContain('The first chapter')
    // A list of what is scrambled that does not say how is taken at its word: something is.
    const unsaid = await rebuilt('epub/sample.epub', { 'META-INF/encryption.xml': '<encryption/>' })
    expect(await refusal(unsaid, 'epub', 'html')).toMatch(/copy-protected/)
  })

  it('refuses a list that defines shorthand of its own, and a book with no pages', async () => {
    for (const trap of ['shorthand-that-multiplies', 'reads-a-local-file', 'truncated', 'contents-five-thousand-deep']) {
      expect(await refusal(await fixture(`_traps/${trap}.epub`), 'epub', 'html'), trap).toBe('Refusal: This file is not a valid EPUB book')
    }
    expect(await refusal(await fixture('_traps/pages-that-are-not-there.epub'), 'epub', 'html')).toBe('Refusal: This book has no pages in it')
    expect(await refusal(await fixture('_traps/bomb-inside.epub'), 'epub', 'html')).toBe('Refusal: This book is too large to convert in a browser')
    expect(await refusal(await fixture('_traps/pages-that-add-up.epub'), 'epub', 'html')).toBe('Refusal: This book is too large to convert in a browser')
  })

  it('takes a name that leads out of the book to name nothing', async () => {
    const parts = await readEpub(await fixture('_traps/page-outside-the-book.epub'))
    expect(parts.chapters).toHaveLength(2)
    // The link to the page that was named out of the book now leads nowhere, and is not a link.
    expect(parts.chapters[1]!.html).toContain('<a>the note at the end</a>')
  })

  it('says what a book holds, before converting', async () => {
    const details = await describeFile(new Blob([(await fixture('epub/sample.epub')) as BlobPart]), format('epub'))
    const said = Object.fromEntries(details.map((detail) => [detail.label, detail.value]))
    expect(said).toMatchObject({ Title: 'Sample book', Author: 'Omsett', Language: 'en', Pages: '3 parts, with 1 picture', Contents: '4 entries', 'Copy protection': 'None' })
    const locked = await describeFile(new Blob([(await fixture('_traps/copy-protected.epub')) as BlobPart]), format('epub'))
    expect(locked[0]!.value).toMatch(/^Yes \(DRM\)/)
  })
})

describe('a book as one page', () => {
  for (const [sample, from] of [['epub/sample.epub', 'epub'], ['epub/older.epub', 'epub'], ['azw3/sample.azw3', 'azw3'], ['azw3/packed.azw3', 'azw3'], ['mobi/sample.mobi', 'mobi']] as const) {
    it(`${sample}: is a page with the book's title and language, and every link in it lands`, async () => {
      const page = await converted(await fixture(sample), from, 'html')
      expect(page.output.name).toBe('book.html')
      const found = await detect(page.output.blob, registry.formats)
      expect(found.kind === 'known' && found.ext).toBe('html')
      expect(page.text).toContain('<html lang="en">')
      expect(page.text).toContain('<title>Sample book</title>')
      expect(page.text).toMatch(/<h1[^>]*>The first chapter<\/h1>/)
      expect(page.text).toContain('Café, 字幕, and a second paragraph.')
      const { inner, dead } = links(page.text)
      expect(inner.length).toBeGreaterThan(0)
      expect(dead).toEqual([])
      // The picture is inside the page, with its description.
      expect(page.text).toMatch(/<img src="data:image\/png;base64,[A-Za-z0-9+/=]+" alt="[^"]+">/)
      expect(page.text).not.toMatch(/src="(?!data:)/)
    })
  }

  it('keeps what a screen reader relies on: headings, lists, the head of a table, descriptions', async () => {
    const { text } = await converted(await fixture('epub/sample.epub'), 'epub', 'html')
    expect(text).toMatch(/<h1 id="part-1-start">Sample book<\/h1>/)
    expect(text).toMatch(/<h2 id="part-2-kinds">What it holds<\/h2>/)
    expect(text).toMatch(/<ul>\s*<li>Pages<\/li>\s*<li>Pictures<ul>\s*<li>A blue square<\/li>/)
    expect(text).toMatch(/<thead>\s*<tr>\s*<th>Format<\/th><th>Kind<\/th>/)
    expect(text).toContain('alt="A blue square"')
  })

  it('points a note at its place in another section, and the way back', async () => {
    const { text } = await converted(await fixture('epub/sample.epub'), 'epub', 'html')
    expect(text).toContain('<a href="#part-3-note-1">the note at the end</a>')
    expect(text).toContain('<p id="part-3-note-1">')
    expect(text).toContain('<a href="#part-2-kinds">Back</a>')
  })

  it('leaves no empty link in Markdown, where a book has marks with nothing in them', async () => {
    const page = await converted(await fixture('epub/sample.epub'), 'epub', 'html')
    expect(page.text).not.toMatch(/<(a|span)[^>]*><\/\1>/)
    expect(page.text).toContain('<p id="part-1-page-1">A short book')
    // A link that led out of the book's pages is its words.
    const lost = await converted(await fixture('_traps/page-outside-the-book.epub'), 'epub', 'html')
    expect(lost.text).toContain('See <span>the note at the end</span>.')
  })

  it('shows the cover once: not again where a page of the book already does', async () => {
    const shown = (await converted(await fixture('epub/sample.epub'), 'epub', 'html')).text
    expect(shown.match(/<img /g)).toHaveLength(1)
    // A cover that came with no description is given the plain one.
    const drawn = (await converted(await fixture('epub/older.epub'), 'epub', 'html')).text
    expect(drawn.match(/<img /g)).toHaveLength(1)
    expect(drawn).toContain('alt="Cover of Sample book"')
  })

  it('makes headings of the chapter titles a book marks only by their look, from its list of contents', async () => {
    const plain = (body: string) => `<html xmlns="http://www.w3.org/1999/xhtml"><head><title>x</title></head><body>${body}</body></html>`
    const book = await rebuilt('epub/sample.epub', {
      'OEBPS/text/title.xhtml': plain('<p class="big">Sample  Book</p><p>Sample book is also said here, but once is enough.</p>'),
      'OEBPS/text/chapter 1.xhtml': plain('<div class="big"><span>The first chapter</span></div><p>It was a plain morning.</p><p id="kinds" class="big">What it holds</p>'),
    })
    const page = await converted(book, 'epub', 'html')
    expect(page.text).toContain('<h1>Sample  Book</h1>')
    expect(page.text).toContain('<h1><span>The first chapter</span></h1>')
    expect(page.text).toContain('<h2 id="part-2-kinds">What it holds</h2>')
    expect(page.text).toContain('<p>It was a plain morning.</p>')
    // The third page marks its own heading, and is left as it is.
    expect(page.text.match(/<h[1-6]/g)).toHaveLength(4)
    expect(page.output.note).toBe('The book marks its chapter titles only by how they look. 3 were found from its list of contents and made headings.')
  })

  it('carries nothing a page could run or fetch', async () => {
    const { text } = await converted(await fixture('_traps/code.epub'), 'epub', 'html')
    // Read as a browser reads it: the title of this book is itself written to look like a script, and is only words.
    const { unified } = await import('unified')
    const tree = unified().use((await import('rehype-parse')).default).parse(text) as unknown as Tag
    const tags: Tag[] = []
    const pending = [tree]
    while (pending.length > 0) {
      const node = pending.pop()!
      if (node.type === 'element') tags.push(node)
      pending.push(...(node.children ?? []))
    }
    expect(tags.filter((tag) => ['script', 'iframe', 'form', 'input', 'style', 'object', 'embed'].includes(tag.tagName!)).map((tag) => tag.tagName)).toEqual([])
    expect(tags.flatMap((tag) => Object.keys(tag.properties ?? {})).filter((name) => /^on/i.test(name))).toEqual([])
    const addresses = tags.flatMap((tag) => [tag.properties?.href, tag.properties?.src]).filter((value) => typeof value === 'string')
    expect(addresses.filter((address) => !/^data:image\/png;base64,/.test(address as string))).toEqual([])
    const fetched = await converted(await fixture('_traps/fetches-a-picture.epub'), 'epub', 'html')
    expect(fetched.text).not.toContain('elsewhere.example')
    expect(fetched.text).toContain('<img alt="A square">')
  })

  it('leaves out pictures past what a page can carry, and says how many', async () => {
    const parts = await readEpub(await fixture('epub/sample.epub'))
    const big = new Uint8Array(4 * 1024 * 1024)
    big.set(parts.pictures[0]!.bytes)
    const pictures = [1, 2, 3].map((n) => ({ file: `images/big${n}.png`, bytes: big, type: 'image/png' }))
    const html = pictures.map((picture, i) => `<p><img src="${picture.file}" alt="Picture ${i + 1}"/></p>`).join('')
    const page = await bookPage({ ...parts, cover: null, pictures, chapters: [{ file: 'page0001.xhtml', html }] }, 'book.epub')
    expect(page.html.match(/src="data:/g)).toHaveLength(2)
    expect(page.html).toContain('<img alt="Picture 3">')
    expect(page.note).toBe("One picture was left out: the book's pictures come to more than a page can carry. The description of each is kept.")
  })
})

describe('a page as a book', () => {
  const PAGE = [
    '<!doctype html><html lang="pt-BR"><head><title>Um livro</title><style>p { color: red }</style></head><body><main>',
    '<h1>Um livro</h1><p>Before the chapters. See <a href="#fim">the end</a> and <a href="#nowhere">nowhere</a>.</p>',
    '<h2 id="um">One</h2><p>First. <img src="data:image/png;base64,PNG" alt="A square"> <img src="https://elsewhere.example/a.png" alt="Far away"></p><h3>Inside one</h3><p>More.</p>',
    '<h2>Two</h2><table><thead><tr><th>A</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table><p id="fim">The end. <a href="#um">Back to one</a>.</p>',
    '<script>globalThis.__omsett_canary=1</script></main></body></html>',
  ].join('')

  async function book() {
    const picture = Buffer.from((await readEpub(await fixture('epub/sample.epub'))).pictures[0]!.bytes).toString('base64')
    const made = await converted(PAGE.replace('base64,PNG', `base64,${picture}`), 'html', 'epub', 'livro.html')
    const entries = await readZip(made.bytes)
    const text = (file: string) => new TextDecoder().decode(entries.find((entry) => entry.name === `OEBPS/${file}`)!.data)
    return { ...made, entries, text, names: entries.map((entry) => entry.name) }
  }

  it('is an EPUB: named as one in its first bytes, and known as one', async () => {
    const made = await book()
    expect(made.output.name).toBe('livro.epub')
    expect(new TextDecoder('latin1').decode(made.bytes.subarray(30, 58))).toBe('mimetypeapplication/epub+zip')
    const found = await detect(made.output.blob, registry.formats)
    expect(found.kind === 'known' && found.ext).toBe('epub')
  })

  it('starts a chapter at each heading of the level the page has several of', async () => {
    const made = await book()
    expect(made.names.filter((name) => /page\d+\.xhtml$/.test(name))).toEqual(['OEBPS/page0001.xhtml', 'OEBPS/page0002.xhtml', 'OEBPS/page0003.xhtml'])
    expect(made.text('page0001.xhtml')).toContain('<h1 id="heading-1">Um livro</h1>')
    expect(made.text('page0002.xhtml')).toContain('<h2 id="um">One</h2>')
    expect(made.text('page0003.xhtml')).toContain('<h2 id="heading-3">Two</h2>')
    expect(made.text('content.opf')).toContain('<dc:title>Um livro</dc:title>')
    expect(made.text('content.opf')).toContain('<dc:language>pt-BR</dc:language>')
  })

  it('makes the list of contents from the headings, a level under each chapter', async () => {
    const nav = (await book()).text('nav.xhtml')
    expect(nav.replace(/\s+/g, '')).toContain(
      '<ol><li><ahref="page0001.xhtml#heading-1">Umlivro</a></li><li><ahref="page0002.xhtml#um">One</a><ol><li><ahref="page0002.xhtml#heading-2">Insideone</a></li></ol></li><li><ahref="page0003.xhtml#heading-3">Two</a></li></ol>',
    )
  })

  it('points a link at the chapter its place is now in, and unlinks one that led nowhere', async () => {
    const made = await book()
    expect(made.text('page0001.xhtml')).toContain('<a href="page0003.xhtml#fim">the end</a>')
    expect(made.text('page0001.xhtml')).toContain('<a>nowhere</a>')
    expect(made.text('page0003.xhtml')).toContain('<a href="page0002.xhtml#um">Back to one</a>')
  })

  it('puts a picture carried in the page into the book, and fetches none', async () => {
    const made = await book()
    expect(made.names).toContain('OEBPS/images/image0001.png')
    expect(made.text('page0002.xhtml')).toContain('<img src="images/image0001.png" alt="A square"/>')
    expect(made.text('page0002.xhtml')).toContain('<img alt="Far away"/>')
    expect(made.entries.map((entry) => new TextDecoder('latin1').decode(entry.data)).join('\n')).not.toMatch(/elsewhere\.example|__omsett_canary|color: red/)
  })

  it('keeps the head of a table, and gives the pages a plain stylesheet', async () => {
    const made = await book()
    expect(made.text('page0003.xhtml')).toContain('<table><thead><tr><th>A</th></tr></thead>')
    expect(made.text('page0003.xhtml')).toContain('<link rel="stylesheet" type="text/css" href="styles/book.css"/>')
    expect(made.text('styles/book.css')).toContain('border-collapse: collapse')
  })

  it('is one chapter where the page has no headings to cut at, with one entry in its contents', async () => {
    const made = await converted('<p>One paragraph.</p><p>Another.</p>', 'html', 'epub', 'note.html')
    const names = (await readZip(made.bytes)).map((entry) => entry.name)
    expect(names.filter((name) => /page\d+\.xhtml$/.test(name))).toEqual(['OEBPS/page0001.xhtml'])
  })

  it('refuses a page with nothing in it, and one that would be more chapters than a book has', async () => {
    expect(await refusal('<html><body>  </body></html>', 'html', 'epub')).toBe('Refusal: This file has no text in it to convert')
    expect(await refusal('<h1>x</h1><p>y</p>'.repeat(5001), 'html', 'epub')).toBe('Refusal: This page would make a book of more chapters than Omsett will write (5,000)')
  })

  it('comes back, read as a book, with its chapters, contents and links whole', async () => {
    const made = await book()
    const parts = await readEpub(made.bytes)
    expect(parts.title).toBe('Um livro')
    expect(parts.language).toBe('pt-BR')
    expect(parts.chapters).toHaveLength(3)
    expect(parts.contents.map((entry) => [entry.label, entry.depth])).toEqual([['Um livro', 0], ['One', 0], ['Inside one', 1], ['Two', 0]])
    const page = await bookPage(parts, 'livro.epub')
    expect(links(page.html).dead).toEqual([])
    expect(links(page.html).inner).toHaveLength(2)
  })

  it('cuts the page a book became back into the book\'s own pages', async () => {
    const page = await converted(await fixture('epub/sample.epub'), 'epub', 'html')
    const parts = await pageParts(page.text, 'book.html')
    expect(parts.chapters).toHaveLength(3)
    expect(parts.contents.map((entry) => entry.label)).toEqual(['Sample book', 'The first chapter', 'What it holds', 'Notes'])
  })
})
