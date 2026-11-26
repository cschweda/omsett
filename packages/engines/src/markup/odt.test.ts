import { readFile } from 'node:fs/promises'
import { formatById, registry } from '@omsett/registry'
import { describe, expect, it } from 'vitest'
import { readDocx } from './docx-read'
import { readOdt } from './odt-read'
import { createMarkupEngine } from './index'

// OpenDocument text. sample.odt is written by fixtures/_tools/odt.py, laid out as LibreOffice
// lays one out; from-macos.odt by macOS's textutil, which knows nothing of Omsett.

const fixture = async (path: string) => new Uint8Array(await readFile(new URL(`../../../../fixtures/${path}`, import.meta.url)))
const refusal = async (path: string) => {
  try {
    await readOdt(await fixture(path))
    return 'read'
  } catch (error) {
    return `${(error as Error).name}: ${(error as Error).message}`
  }
}
async function convert(bytes: Uint8Array | string, from: string, to: string) {
  const [output] = await createMarkupEngine().convert({
    blob: new Blob([bytes as BlobPart]),
    name: `report.${from}`,
    from: formatById(registry, from)!,
    to: formatById(registry, to)!,
    options: {},
    signal: new AbortController().signal,
    onProgress: () => {},
  })
  return output!.blob.text()
}

describe('OpenDocument text (ODT)', () => {
  it('keeps the structure a reader relies on, as from a Word document', async () => {
    const { body, title, language } = await readOdt(await fixture('odt/sample.odt'))
    expect(title).toBe('About Omsett')
    expect(language).toBe('en-GB')
    expect(body).toContain('<h1>What it does</h1>')
    expect(body).toContain('<h2>What it converts</h2>')
    // Bold and slanted by the styles the runs are given, and by the style a style is based on.
    expect(body).toContain('<strong>Nothing leaves your device.</strong> It is <em>free</em> and <strong><em>open</em></strong> source')
    expect(body).toContain('<a href="https://omsett.com">omsett.com</a>')
    expect(body).toContain('<table><thead><tr><th>Format</th><th>Kind</th></tr></thead><tbody><tr><td>PNG</td><td>Picture</td></tr>')
    expect(body).toMatch(/<img src="data:image\/png;base64,[A-Za-z0-9+/=]+" alt="The Omsett mark: a word in white with a blue square">/)
    expect(body).toContain('<p>Café 字幕, and a line<br>broken in two.</p>')
  })

  it('reads lists as the newer Word reader does', async () => {
    const lists = (body: string) => body.match(/<ul>.*?<\/ol>/)![0]
    expect(lists((await readOdt(await fixture('odt/sample.odt'))).body)).toBe(lists((await readDocx(await fixture('docx/sample.docx'))).body))
  })

  it('reads a document another program wrote', async () => {
    const { body } = await readOdt(await fixture('odt/from-macos.odt'))
    expect(body).toContain('<p>A paragraph with <strong>bold</strong> and <em>italic</em> words and a <a href="https://omsett.com/">link</a>.</p>')
    expect(body).toContain('<ul><li>First</li><li>Second<ul><li>Inner</li></ul></li></ul><ol><li>One</li><li>Two</li></ol>')
    expect(body).toContain('<p>Café 字幕</p>')
  })

  it('leaves out what the author took out or kept aside', async () => {
    const html = await convert(await fixture('odt/sample.odt'), 'odt', 'html')
    expect(html).toContain('<p>Files are converted in the tab.</p>')
    for (const gone of ['SECRET-DELETED', 'SECRET-HIDDEN-WORDS', 'SECRET-COMMENT', 'SECRET-FOOTNOTE', 'SECRET-HIDDEN-PARAGRAPH', 'SECRET-HIDDEN-SECTION', 'SECRET-AUTHOR']) expect(html.includes(gone), gone).toBe(false)
  })

  it('becomes Markdown and a Word document by way of a page', async () => {
    const html = await convert(await fixture('odt/sample.odt'), 'odt', 'html')
    expect(html).toContain('<html lang="en-GB">')
    const md = await convert(html, 'html', 'md')
    expect(md).toContain('# What it does')
    expect(md).toContain('  - JSON and CSV')
    expect(md).toContain('1. Drop a file\n2. Pick a format')
    const docx = new Uint8Array(await new Blob([await convert(html, 'html', 'docx')]).arrayBuffer())
    expect([docx[0], docx[1]]).toEqual([0x50, 0x4B])
  })

  it('carries no picture it has not seen to be one, and fetches none', async () => {
    for (const trap of ['picture-that-is-a-script', 'fetches-a-picture', 'picture-outside-the-document']) {
      const { body } = await readOdt(await fixture(`_traps/${trap}.odt`))
      expect(body, trap).toContain('[Picture: A chart of the year]')
      expect(body, trap).not.toContain('<img')
    }
  })

  it('refuses what cannot be read, in words that say why', async () => {
    expect(await refusal('docx/sample.docx')).toBe('Refusal: This file is not a valid ODT document')
    expect(await refusal('_traps/truncated.odt')).toBe('Refusal: This file is not a valid ODT document')
    expect(await refusal('_traps/entity-bomb.odt')).toBe('Refusal: This file is not a valid ODT document')
    expect(await refusal('_traps/spans-two-hundred-deep.odt')).toBe('Refusal: This file is not a valid ODT document')
    expect(await refusal('_traps/locked-with-a-password.odt')).toBe('Refusal: This document is locked with a password, and cannot be read without it')
    expect(await refusal('_traps/styles-in-a-circle.odt')).toBe('read')
  })
})
