import { readFile } from 'node:fs/promises'
import { formatById, registry } from '@omsett/registry'
import { describe, expect, it } from 'vitest'
import { readOdp } from './odp-read'
import { readPptx } from './pptx-read'
import { createMarkupEngine } from './index'

// OpenDocument presentations. sample.odp is written by fixtures/_tools/odp.py, laid out as
// LibreOffice Impress lays one out; from-odfpy.odp by odfpy, which knows nothing of Omsett.

const fixture = async (path: string) => new Uint8Array(await readFile(new URL(`../../../../fixtures/${path}`, import.meta.url)))
const refusal = async (path: string) => {
  try {
    await readOdp(await fixture(path))
    return 'read'
  } catch (error) {
    return `${(error as Error).name}: ${(error as Error).message}`
  }
}
async function convert(bytes: Uint8Array | string, from: string, to: string) {
  const [output] = await createMarkupEngine().convert({
    blob: new Blob([bytes as BlobPart]),
    name: `deck.${from}`,
    from: formatById(registry, from)!,
    to: formatById(registry, to)!,
    options: {},
    signal: new AbortController().signal,
    onProgress: () => {},
  })
  return output!.blob.text()
}

describe('OpenDocument presentations (ODP)', () => {
  it('become the page a PowerPoint file becomes, slide for slide', async () => {
    const odp = await readOdp(await fixture('odp/sample.odp'))
    const pptx = await readPptx(await fixture('pptx/sample.pptx'))
    expect(odp.title).toBe('About Omsett')
    expect(odp.language).toBe('en-GB')
    // The same headings, the same lists, the same box drawn by hand, the same table with its heading row.
    const without = (body: string) => body.replace(/base64,[^"]+/g, '')
    expect(without(odp.body)).toBe(without(pptx.body))
  })

  it('read a presentation another program wrote', async () => {
    const { body } = await readOdp(await fixture('odp/from-odfpy.odp'))
    expect(body).toBe('<h1>Omsett</h1><section><h2>Omsett</h2><p>Drop a file. Pick a format.</p></section><section><h2>What it converts</h2><ul><li>Pictures</li><li>Data<ul><li>Workbooks</li><li>Contacts</li></ul></li><li>Subtitles</li></ul></section>')
  })

  it.each(['odp/sample.odp', 'odp/from-odfpy.odp'])('%s leaves out what the audience was not shown', async (path) => {
    const html = await convert(await fixture(path), 'odp', 'html')
    for (const gone of ['SECRET-HIDDEN-SLIDE', 'SECRET-HIDDEN-SHAPE', 'SECRET-SPEAKER-NOTES', 'not for the audience', 'SECRET-AUTHOR', 'Click to add']) expect(html.includes(gone), gone).toBe(false)
    // The slide's number is furniture, not content.
    expect(html).not.toMatch(/<p>1<\/p>/)
  })

  it('carry speaker notes only when asked, after their slide, and never a hidden slide\'s', async () => {
    const { body } = await readOdp(await fixture('odp/sample.odp'), { notes: true })
    expect(body).toContain('<h3>Speaker notes</h3><p>SECRET-SPEAKER-NOTES: not for the audience</p></section>')
    expect(body).not.toMatch(/SECRET-HIDDEN-SLIDE|SECRET-HIDDEN-SHAPE|Click to add/)
  })

  it('leave out shapes not shown, however they are hidden', async () => {
    expect((await readOdp(await fixture('_traps/shapes-not-shown.odp'))).body).not.toContain('unchecked')
  })

  it('leave out what is hidden wherever and however it is said, and read a shape made a link', async () => {
    for (const trap of ['slide-hidden-by-a-style-kept-elsewhere', 'shape-on-a-hidden-layer', 'hidden-in-one-vocabulary-shown-in-another', 'notes-and-hidden-frames-inside-text']) {
      const { body, title } = await readOdp(await fixture(`_traps/${trap}.odp`))
      expect(`${title} ${body}`, trap).not.toMatch(/unchecked|before the audit/i)
    }
    expect((await readOdp(await fixture('_traps/shape-made-a-link.odp'))).body).toContain('<p>A box that is a link</p>')
  })

  it('become Markdown by way of a page', async () => {
    const md = await convert(await convert(await fixture('odp/sample.odp'), 'odp', 'html'), 'html', 'md')
    expect(md).toContain('# About Omsett\n\n## Omsett')
    expect(md).toContain('  - Workbooks')
    expect(md).toContain('| Format | Kind')
  })

  it('carry no picture they have not seen to be one, and fetch none', async () => {
    for (const trap of ['picture-that-is-a-script', 'fetches-a-picture']) {
      const { body } = await readOdp(await fixture(`_traps/${trap}.odp`))
      expect(body, trap).toContain('[Picture: A chart of the year]')
      expect(body, trap).not.toContain('<img')
    }
  })

  it('refuse what cannot be read, in words that say why', async () => {
    expect(await refusal('odt/sample.odt')).toBe('Refusal: This file is not a valid ODP presentation')
    for (const trap of ['truncated', 'entity-bomb', 'shorthand-after-a-long-comment', 'groups-two-hundred-deep']) {
      expect(await refusal(`_traps/${trap}.odp`), trap).toBe('Refusal: This file is not a valid ODP presentation')
    }
    expect(await refusal('_traps/locked-with-a-password.odp')).toBe('Refusal: This presentation is locked with a password, and cannot be read without it')
    expect(await refusal('_traps/every-slide-hidden.odp')).toBe('Refusal: This presentation has no text in it to convert')
  })
})
