import { readFile } from 'node:fs/promises'
import { detect } from '@omsett/detect'
import { formatById, registry } from '@omsett/registry'
import { describe, expect, it } from 'vitest'
import { readZip } from '../archive/zip'
import { describeFile } from '../details'
import { cleanStyle } from './epub-write'
import { createEbookEngine, readKindle } from './index'

// Kindle books to EPUB. The samples are written by fixtures/_tools/kindle.py: a book of three
// short pages in the newer form and the older, packed each way a Kindle book is packed.

const engine = createEbookEngine()
const fixture = async (path: string) => new Uint8Array(await readFile(new URL(`../../../../fixtures/${path}`, import.meta.url)))

async function epubOf(bytes: Uint8Array, from: string, name = `book.${from}`) {
  const [output] = await engine.convert({ blob: new Blob([bytes as BlobPart]), name, from: formatById(registry, from)!, to: formatById(registry, 'epub')!, options: {}, signal: new AbortController().signal, onProgress: () => {} })
  const made = new Uint8Array(await output!.blob.arrayBuffer())
  const entries = await readZip(made)
  const text = (file: string) => new TextDecoder().decode(entries.find((entry) => entry.name === file)?.data ?? new Uint8Array())
  return { output: output!, bytes: made, entries, text, names: entries.map((entry) => entry.name) }
}
const refusal = (bytes: Uint8Array, from: string) => epubOf(bytes, from).then(() => 'converted', (error: Error) => `${error.name}: ${error.message}`)
/** Whether some XML is well-formed, by the simplest test that catches what a writer gets wrong: every tag closed, in order. */
function wellFormed(xml: string): boolean {
  const open: string[] = []
  for (const tag of xml.replace(/<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>/g, '').matchAll(/<(\/?)([a-z][\w:.-]*)((?:\s+[\w:.-]+="[^"<]*")*)\s*(\/?)>|<|>/gi)) {
    if (tag[0] === '<' || tag[0] === '>') return false
    if (tag[4]) continue
    if (!tag[1]) open.push(tag[2]!)
    else if (open.pop() !== tag[2]) return false
  }
  return open.length === 0 && !/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);)/i.test(xml)
}

describe('a Kindle book as an EPUB', () => {
  for (const [path, from] of [['azw3/sample.azw3', 'azw3'], ['azw3/packed.azw3', 'azw3'], ['mobi/sample.mobi', 'mobi'], ['mobi/unpacked.mobi', 'mobi']] as const) {
    it(`${path}: is an EPUB a reader will open`, async () => {
      const epub = await epubOf(await fixture(path), from)
      expect(epub.output.name).toBe('book.epub')
      // It says what it is in its first file, stored as it is, so it is known from its first bytes.
      expect(epub.names[0]).toBe('mimetype')
      expect(new TextDecoder().decode(epub.bytes.subarray(30, 58))).toBe('mimetypeapplication/epub+zip')
      const found = await detect(new Blob([epub.bytes as BlobPart]), registry.formats)
      expect(found.kind === 'known' && found.format.id).toBe('epub')
      expect(epub.text('META-INF/container.xml')).toContain('full-path="OEBPS/content.opf"')
      // Everything the book lists is in the book, and every page is well-formed.
      const opf = epub.text('OEBPS/content.opf')
      for (const href of [...opf.matchAll(/<item [^>]*href="([^"]+)"/g)].map((item) => item[1]!)) expect(epub.names, href).toContain(`OEBPS/${href}`)
      for (const name of epub.names.filter((entry) => /\.(?:xhtml|opf|ncx|xml)$/.test(entry))) expect(wellFormed(epub.text(name)), name).toBe(true)
      expect(opf).toContain('<dc:title>Sample book</dc:title>')
      expect(opf).toContain('<dc:creator>Omsett</dc:creator>')
      expect(opf).toContain('<dc:language>en</dc:language>')
      expect(opf).toMatch(/<dc:identifier id="book-id">urn:uuid:[0-9a-f-]{36}<\/dc:identifier>/)
      expect(opf).toMatch(/properties="nav"/)
      expect(opf).toMatch(/properties="cover-image"/)
    })
  }

  it('keeps the pages, in order, with what was in them', async () => {
    for (const [path, from] of [['azw3/sample.azw3', 'azw3'], ['azw3/packed.azw3', 'azw3'], ['mobi/sample.mobi', 'mobi']] as const) {
      const epub = await epubOf(await fixture(path), from)
      const spine = [...epub.text('OEBPS/content.opf').matchAll(/<itemref idref="([^"]+)"/g)].length
      expect(spine, path).toBe(4)
      expect(epub.text('OEBPS/cover.xhtml'), path).toMatch(/<img src="images\/image0001\.png" alt="Cover of Sample book"/)
      expect(epub.text('OEBPS/part0000.xhtml'), path).toContain('A short book written for the tests of <a href="https://omsett.com/">Omsett</a>.')
      expect(epub.text('OEBPS/part0000.xhtml'), path).toMatch(/<img [^>]*src="images\/image0001\.png"[^>]*\/>/)
      const first = epub.text('OEBPS/part0001.xhtml')
      expect(first, path).toContain('It was a <b>plain</b> morning, and the the file was <i>small</i>.')
      expect(first, path).toContain('Café, 字幕, and a second paragraph.')
      expect(epub.text('OEBPS/part0002.xhtml'), path).toContain('The note: nothing in this book is real.')
      expect(epub.names.filter((name) => name.startsWith('OEBPS/images/')), path).toEqual(['OEBPS/images/image0001.png'])
    }
  })

  it('points a link inside the book at the very place it was made for', async () => {
    for (const [path, from] of [['azw3/sample.azw3', 'azw3'], ['mobi/sample.mobi', 'mobi']] as const) {
      const epub = await epubOf(await fixture(path), from)
      const link = /See <a\s+href="(part0002\.xhtml)#([^"]+)">the note at the end<\/a>/.exec(epub.text('OEBPS/part0001.xhtml'))
      expect(link, path).not.toBeNull()
      // The place is on the paragraph that holds the note, not merely on its page.
      expect(epub.text(`OEBPS/${link![1]}`), path).toMatch(new RegExp(`<(?:p|a)[^>]* id="${link![2]}"[^>]*>(?:</a>)?(?:<p>)?The note`))
    }
  })

  it('carries the stylesheet and the names it styles by, and a list of contents', async () => {
    const epub = await epubOf(await fixture('azw3/sample.azw3'), 'azw3')
    expect(epub.text('OEBPS/styles/style0001.css')).toContain('.note { font-style: italic }')
    expect(epub.text('OEBPS/part0002.xhtml')).toContain('<link rel="stylesheet" type="text/css" href="styles/style0001.css"/>')
    expect(epub.text('OEBPS/part0002.xhtml')).toMatch(/<p class="note" id="note-one">/)
    const nav = epub.text('OEBPS/nav.xhtml')
    expect(nav).toContain('<nav epub:type="toc" id="toc">')
    expect([...nav.matchAll(/<li><a href="([^"]+)">([^<]+)<\/a>/g)].map((entry) => [entry[1]!.split('#')[0], entry[2]])).toEqual([['part0000.xhtml', 'Sample book'], ['part0001.xhtml', 'The first chapter'], ['part0002.xhtml', 'Notes']])
    expect(epub.text('OEBPS/toc.ncx')).toContain('<navLabel><text>The first chapter</text></navLabel>')
    // An older book with no list of its own gets one entry, and the result says so.
    const old = await epubOf(await fixture('mobi/sample.mobi'), 'mobi')
    expect(old.output.note).toBe('The book has no list of contents of its own, so the EPUB has one entry: the beginning.')
    expect(old.text('OEBPS/nav.xhtml')).toMatch(/<li><a href="part0000\.xhtml">Sample book<\/a><\/li>/)
  })

  it('writes the same EPUB twice, and says nothing of when it was made', async () => {
    const [one, two] = [await epubOf(await fixture('azw3/sample.azw3'), 'azw3'), await epubOf(await fixture('azw3/sample.azw3'), 'azw3')]
    expect(Buffer.from(one.bytes).equals(Buffer.from(two.bytes))).toBe(true)
    expect(one.text('OEBPS/content.opf')).toContain('<meta property="dcterms:modified">2000-01-01T00:00:00Z</meta>')
  })

  it('takes out of a page everything that could run or fetch, and out of a stylesheet everything that could fetch', async () => {
    for (const [name, from] of [['code.azw3', 'azw3'], ['code.mobi', 'mobi']] as const) {
      const epub = await epubOf(await fixture(`_traps/${name}`), from)
      for (const file of epub.names.filter((entry) => entry.endsWith('.xhtml'))) {
        const page = epub.text(file)
        for (const tag of page.match(/<[a-z][^>]*>/gi) ?? []) {
          expect(/^<(?:script|iframe|object|embed|form|input|base|meta http-equiv)/i.test(tag), `${file}: ${tag}`).toBe(false)
          expect(/\son[a-z]+\s*=/i.test(tag), `${file}: a handler in ${tag}`).toBe(false)
          expect(/(?:java|vb)script:/i.test(tag), `${file}: a link that is code in ${tag}`).toBe(false)
          if (/^<img/i.test(tag)) expect(/src="(?:https?:|\/\/)/i.test(tag), `${file}: a picture from elsewhere in ${tag}`).toBe(false)
        }
        expect(wellFormed(page), file).toBe(true)
      }
      for (const file of epub.names.filter((entry) => entry.endsWith('.css'))) expect(epub.text(file), file).not.toMatch(/canary\.invalid|@import|@font-face|expression\s*\(/i)
      // The words of the payload are there as words: in the title, and on the page.
      expect(epub.text('OEBPS/content.opf')).toContain('&lt;script&gt;')
    }
  })

  it('refuses a locked book, and says why', async () => {
    expect(await refusal(await fixture('_traps/copy-protected.azw3'), 'azw3')).toBe('Refusal: This book is copy-protected (DRM), and Omsett does not unlock books. Only books without copy protection can be converted')
    expect(await refusal(await fixture('_traps/copy-protected.mobi'), 'mobi')).toMatch(/^Refusal: This book is copy-protected/)
  })

  it('never throws anything but a refusal, whatever byte is changed', async () => {
    for (const [path, from] of [['azw3/sample.azw3', 'azw3'], ['azw3/packed.azw3', 'azw3'], ['mobi/sample.mobi', 'mobi']] as const) {
      const bytes = await fixture(path)
      for (let at = 0; at < bytes.length; at += path.includes('packed') ? 5 : 2) {
        for (const value of [0x00, 0xFF, bytes[at]! ^ 0x80]) {
          if (value === bytes[at]) continue
          const damaged = bytes.slice()
          damaged[at] = value
          const outcome = await refusal(damaged, from)
          expect(outcome === 'converted' || outcome.startsWith('Refusal: '), `${path} byte ${at} = ${value}: ${outcome}`).toBe(true)
        }
      }
    }
  }, 120_000)

  it('says what a book is before converting it', async () => {
    const details = await describeFile(new Blob([(await fixture('azw3/sample.azw3')) as BlobPart]), formatById(registry, 'azw3')!)
    expect(details).toEqual([
      { label: 'Title', value: 'Sample book', fate: 'kept' },
      { label: 'Author', value: 'Omsett', fate: 'kept' },
      { label: 'Language', value: 'en', fate: 'kept' },
      { label: 'Pages', value: '3 parts, with 1 picture', fate: 'kept' },
      { label: 'Contents', value: '3 entries', fate: 'kept' },
      { label: 'Copy protection', value: 'None' },
    ])
    const locked = await describeFile(new Blob([(await fixture('_traps/copy-protected.azw3')) as BlobPart]), formatById(registry, 'azw3')!)
    expect(locked).toEqual([{ label: 'Copy protection', value: 'Yes (DRM). Omsett does not unlock books, so this one cannot be converted' }])
    expect(readKindle(await fixture('mobi/sample.mobi')).chapters).toHaveLength(3)
  })
})

describe('a stylesheet, cleaned', () => {
  const inBook = (path: string) => path === '../images/image0001.png'
  /** Whether anything is left that a reader would take for an address, or for something to run. */
  const fetches = (css: string) => /\/\/|@(?!media|page|supports|keyframes|-webkit-keyframes)|url\s*\(\s*["']?\/\/|@import|@font-face|\bimage\s*\(|cross-fade\s*\(|\burl\s*\((?!"\.\.\/images\/image0001\.png"\))|image-set\s*\(|\bsrc\s*\(|expression\s*\(|javascript:/i.test(css)

  it('keeps what styles a page, and an address only for a picture that is in the book', () => {
    const css = 'h1 { font-size: 1.6em; color: #333 }\n.note { font-style: italic }\ndiv.cover { background: url("../images/image0001.png") no-repeat }\n@media (max-width: 30em) { p { margin: 0 } }'
    expect(cleanStyle(css, inBook)).toBe(css)
    expect(cleanStyle('a { background: url(../images/other.png) }', inBook)).toBe('a { background: none }')
    expect(cleanStyle('a { background: url(../../../etc/passwd) }', inBook)).toBe('a { background: none }')
  })

  it('takes out every address on the web, however it is spelled', () => {
    for (const css of [
      'a { background: url(http://canary.invalid/a.png) }',
      'a { background: url( "https://canary.invalid/a.png" ) }',
      "a { background: URL('//canary.invalid/a.png') }",
      // Letters written as escapes, which a reader turns back into the letters.
      'a { background: u\\72l(http://canary.invalid/a.png) }',
      'a { background: \\75\\72\\6c(http://canary.invalid/a.png) }',
      'a { background: url(ht\\74p://canary.invalid/a.png) }',
      'a { background: url("\\68ttp://canary.invalid/a.png") }',
      '@\\69mport "http://canary.invalid/a.css";',
      '@import url(http://canary.invalid/a.css);',
      '@import "http://canary.invalid/a.css" screen;',
      '@IMPORT\n"http://canary.invalid/a.css";',
      '@font-face { font-family: x; src: url(http://canary.invalid/f.woff) }',
      '@font-\\66 ace { font-family: x; src: url(http://canary.invalid/f.woff) }',
      // The other ways of naming an address.
      'a { background: image-set("http://canary.invalid/a.png" 1x) }',
      'a { background: -webkit-image-set(url(http://canary.invalid/a.png) 1x) }',
      'a { background: image("http://canary.invalid/a.png") }',
      'a { content: src("http://canary.invalid/a.png") }',
      'a { background: cross-fade(url(http://canary.invalid/a.png), url(x.png)) }',
      // A comment in the middle of a name, and one that is never closed.
      'a { background: ur/**/l(http://canary.invalid/a.png) }',
      'a { background: url(/* x */http://canary.invalid/a.png) }',
      'a { color: red } /* a { background: url(http://canary.invalid/a.png) }',
      // An address that is never closed.
      'a { background: url(http://canary.invalid/a.png',
      // A rule hidden in the two halves of itself, which taking out the middle would put together.
      '@imp@import x;ort "//canary.invalid/a.css";',
      '@im@charset "x";port url(//canary.invalid/a.css);',
      '@font-@import x;face { font-family: x; src: url(//canary.invalid/f.woff) }',
      '@imp@imp@import x;ort y;ort "//canary.invalid/a.css";',
      'a { background: ur@import x;l(//canary.invalid/a.png) }',
      'a { background: u@charset "x";rl(http:/@import x;/canary.invalid/a.png) }',
      // An address with no scheme, which is still an address on another site.
      '@import "//canary.invalid/a.css";',
      "@import '//canary.invalid/a.css' print;",
      'a { background: url(//canary.invalid/a.png) }',
      'a { background: image-set("//canary.invalid/a.png" 1x) }',
      // A rule Omsett has no name for.
      '@unknown-rule "//canary.invalid/a.css";',
      '@document url(http://canary.invalid/) { a { color: red } }',
      // Things that ran, in browsers that are gone, and are still not written.
      'a { width: expression(alert(1)); behavior: url(x.htc); -moz-binding: url(x.xml#y) }',
      'a { background: url("javascript:alert(1)") }',
    ]) {
      const cleaned = cleanStyle(css, inBook)
      expect(fetches(cleaned), `${css}\n  → ${cleaned}`).toBe(false)
      // Cleaning what has been cleaned changes nothing: there is no second sheet inside the first.
      expect(cleanStyle(cleaned, inBook), css).toBe(cleaned)
    }
  })

  it('keeps none of a sheet that will not settle, and keeps the rules that only style', () => {
    const nested = `${'@imp'.repeat(40)}@import x;${'ort y;'.repeat(40)} "//canary.invalid/a.css";`
    expect(fetches(cleanStyle(nested, inBook))).toBe(false)
    const styled = '@media print { p { margin: 0 } }\n@page { margin: 2cm }\n@supports (display: grid) { div { display: grid } }\n@keyframes fade { from { opacity: 0 } to { opacity: 1 } }'
    expect(cleanStyle(styled, inBook)).toBe(styled)
  })

  it('is quick on a stylesheet written to make it slow', () => {
    const started = performance.now()
    cleanStyle(`${'url('.repeat(50_000)}${' '.repeat(50_000)}${'/*'.repeat(50_000)}${'\\'.repeat(50_000)}@import${' '.repeat(50_000)}`, inBook)
    expect(performance.now() - started).toBeLessThan(2000)
  })
})
