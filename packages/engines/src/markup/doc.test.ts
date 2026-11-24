import { readFile } from 'node:fs/promises'
import { formatById, registry } from '@omsett/registry'
import { describe, expect, it } from 'vitest'
import { describeFile } from '../details'
import { readDoc } from './doc-read'
import { createMarkupEngine } from './index'

// Word documents from before 2007. The sample is written by fixtures/_tools/doc.py, which says
// exactly what each paragraph is; a second is written by macOS, which knows nothing of Omsett.

const fixture = async (path: string) => new Uint8Array(await readFile(new URL(`../../../../fixtures/${path}`, import.meta.url)))
const refusal = (work: () => unknown) => {
  try {
    work()
    return 'read'
  } catch (error) {
    return `${(error as Error).name}: ${(error as Error).message}`
  }
}
async function convert(bytes: Uint8Array, to: string) {
  const [output] = await createMarkupEngine().convert({
    blob: new Blob([bytes as BlobPart]),
    name: 'report.doc',
    from: formatById(registry, 'doc')!,
    to: formatById(registry, to)!,
    options: {},
    signal: new AbortController().signal,
    onProgress: () => {},
  })
  return output!.blob.text()
}

describe('old Word documents (DOC)', () => {
  it('keeps what a reader finds their way by: headings, lists at their levels, a table with its heading row, links', async () => {
    const { body, title, language } = readDoc(await fixture('doc/sample.doc'))
    expect(title).toBe('Test pattern')
    expect(language).toBe('en-US')
    expect(body).toContain('<h1>Quarterly report</h1>')
    expect(body).toContain('<h2>What was agreed</h2>')
    // A style of the author's own that sits at the third level of the outline is a third-level heading.
    expect(body).toContain('<h3>A heading by its place in the outline</h3>')
    expect(body).toContain('<ul><li>Ship the converter</li><li>Test it in three browsers<ul><li>Chromium</li><li>Firefox</li></ul></li></ul>')
    expect(body).toContain('<ol><li>First, add the file</li><li>Then choose a format</li></ol>')
    expect(body).toContain('<table><thead><tr><th scope="col">Quarter</th><th scope="col">Sales</th></tr></thead><tbody><tr><td>First</td><td>1,200</td></tr><tr><td>Second</td><td>1,450</td></tr></tbody></table>')
    expect(body).toContain('<p>This is the <strong>first</strong> paragraph, with <em>slanted</em> words and a <a href="https://omsett.com/">link to the site</a>.</p>')
    expect(body).toContain('<p>Café 字幕, and a line<br>broken in two.</p>')
  })

  it('leaves out what the author struck out or hid, and the instruction behind a link', async () => {
    const { body } = readDoc(await fixture('doc/sample.doc'))
    expect(body).toContain('<p>The plan is final.</p>')
    expect(body).not.toMatch(/not final|do not publish|HYPERLINK/)
  })

  it('reads a document written by another program', async () => {
    const { body } = readDoc(await fixture('doc/from-macos.doc'))
    expect(body).toContain('Heading one')
    expect(body).toContain('A paragraph with <strong>bold</strong> and <em>italic</em> words.')
    expect(body).toMatch(/<table><tbody><tr><td>(?:<strong>)?a(?:<\/strong>)?<\/td><td>(?:<strong>)?b(?:<\/strong>)?<\/td><\/tr><tr><td>1<\/td><td>2<\/td><\/tr><\/tbody><\/table>/)
    expect(body).toContain('Café 字幕')
  })

  it('becomes a page with a title and a language, and Markdown by way of it', async () => {
    const page = await convert(await fixture('doc/sample.doc'), 'html')
    expect(page).toContain('<html lang="en-US">')
    expect(page).toContain('<title>Test pattern</title>')
    expect(page).toContain('<h1>Quarterly report</h1>')
    expect(page).toContain('<th scope="col">Quarter</th>')
    expect(page).not.toMatch(/do not publish|<script/)
  })

  it('says who wrote it and with what, which a conversion leaves behind', async () => {
    const details = await describeFile(new Blob([(await fixture('doc/sample.doc')) as BlobPart]), formatById(registry, 'doc')!)
    expect(details).toEqual([
      { label: 'Title', value: 'Test pattern', fate: 'removed' },
      { label: 'Author', value: 'Omsett', fate: 'removed' },
      { label: 'Made with', value: 'fixtures/_tools/doc.py', fate: 'removed' },
    ])
  })

  it('never throws anything but a refusal, whatever byte is changed', async () => {
    for (const name of ['sample', 'from-macos']) {
      const bytes = await fixture(`doc/${name}.doc`)
      for (let at = 0; at < bytes.length; at += name === 'sample' ? 3 : 11) {
        for (const value of [0x00, 0xFF, bytes[at]! ^ 0x80]) {
          if (value === bytes[at]) continue
          const damaged = bytes.slice()
          damaged[at] = value
          const outcome = refusal(() => readDoc(damaged))
          expect(outcome === 'read' || outcome.startsWith('Refusal: '), `${name} byte ${at} = ${value}: ${outcome}`).toBe(true)
        }
      }
    }
  })
})
