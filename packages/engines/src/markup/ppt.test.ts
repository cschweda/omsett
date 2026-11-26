import { readFile } from 'node:fs/promises'
import { formatById, registry } from '@omsett/registry'
import { describe, expect, it } from 'vitest'
import { readPpt } from './ppt-read'
import { readPptx } from './pptx-read'
import { createMarkupEngine } from './index'

// PowerPoint presentations from before 2007. sample.ppt is written by fixtures/_tools/ppt.py, laid
// out as PowerPoint lays one out; from-poi.ppt by Apache POI, which knows nothing of Omsett and
// keeps text in another place. Both hold what pptx/sample.pptx holds, and all three are held to
// the same answer.

const fixture = async (path: string) => new Uint8Array(await readFile(new URL(`../../../../fixtures/${path}`, import.meta.url)))
const refusal = async (path: string) => {
  try {
    readPpt(await fixture(path))
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
const SAMPLES = ['ppt/sample.ppt', 'ppt/from-poi.ppt']

describe('old PowerPoint presentations (PPT)', () => {
  it.each(SAMPLES)('%s becomes a page with the outline the slides had', async (path) => {
    const { body, title } = readPpt(await fixture(path))
    expect(title).toBe('About Omsett')
    expect([...body.matchAll(/<h([12])>([^<]*)<\/h\1>/g)].map((m) => `${m[1]} ${m[2]}`)).toEqual([
      '1 About Omsett',
      '2 Omsett',
      '2 What it converts',
      '2 A picture and a table, café 字幕',
    ])
    // A subtitle is a line, not a bullet. The body's paragraphs are bullets, at their levels.
    expect(body).toContain('<h2>Omsett</h2><p>Drop a file. Pick a format.</p></section>')
    expect(body).toContain('<ul><li>Pictures</li><li>Data, such as <strong>JSON</strong> and <em>CSV</em><ul><li>Workbooks</li><li>Contacts</li></ul></li><li>See <a href="https://omsett.com">omsett.com</a></li></ul>')
    // A box drawn by hand is a paragraph; the slide's number is not content.
    expect(body).toContain('<p>Nothing leaves your device.</p></section>')
    expect(body).toMatch(/<img src="data:image\/png;base64,[A-Za-z0-9+/=]+" alt="The Omsett mark: a word in white with a blue square">/)
    // A PPT does not say which rows of a table are headings, and none is made one.
    expect(body).toContain('<table><tbody><tr><td>Format</td><td>Kind</td></tr><tr><td>PNG</td><td>Picture</td></tr><tr><td>XLSX</td><td>Workbook</td></tr></tbody></table>')
  })

  it('reads what the newer reader reads from the same slides', async () => {
    const lists = (body: string) => body.match(/<ul>.*<\/ul>/)![0]
    const newer = lists((await readPptx(await fixture('pptx/sample.pptx'))).body)
    for (const path of SAMPLES) expect(lists(readPpt(await fixture(path)).body)).toBe(newer)
  })

  it('takes the language from the text, and from the presentation where the text says none', async () => {
    expect(readPpt(await fixture('ppt/sample.ppt')).language).toBe('en-GB')
    expect(readPpt(await fixture('ppt/from-poi.ppt')).language).toBe('en-US')
  })

  it.each(SAMPLES)('%s leaves out what the audience was not shown', async (path) => {
    const html = await convert(await fixture(path), 'ppt', 'html')
    for (const gone of ['SECRET-HIDDEN-SLIDE', 'SECRET-HIDDEN-SHAPE', 'SECRET-SPEAKER-NOTES', 'not for the audience', 'SECRET-AUTHOR', 'SECRET-EARLIER-SAVE']) expect(html.includes(gone), gone).toBe(false)
  })

  it('hides what a hidden shape or group refers to, wherever its words are kept', async () => {
    for (const trap of ['placeholder-hidden-in-the-editor', 'group-hidden-in-the-editor']) {
      expect(readPpt(await fixture(`_traps/${trap}.ppt`)).body, trap).not.toContain('Redundancies')
    }
  })

  it('takes the title from the first slide as words, written once', async () => {
    const { body, title } = readPpt(await fixture('_traps/title-that-looks-like-markup.ppt'))
    expect(title).toBe('Q&A <now> & then')
    expect(body.startsWith('<h1>Q&amp;A &lt;now&gt; &amp; then</h1>')).toBe(true)
  })

  it('opens a link once for all the letters under it, and makes no link of an address longer than a page', async () => {
    const { body } = readPpt(await fixture('_traps/every-letter-set-its-own-way.ppt'))
    expect(body.match(/<a /g)).toHaveLength(1)
    expect(readPpt(await fixture('_traps/letters-under-a-long-link.ppt')).body).not.toContain('<a ')
  })

  it('carries speaker notes only when asked, after their slide, and never a hidden slide\'s', async () => {
    const { body } = readPpt(await fixture('ppt/sample.ppt'), { notes: true })
    expect(body).toContain('<h3>Speaker notes</h3><p>SECRET-SPEAKER-NOTES: not for the audience</p></section>')
    expect(body).not.toMatch(/SECRET-HIDDEN-SLIDE|SECRET-HIDDEN-SHAPE|SECRET-EARLIER-SAVE/)
  })

  it('reads the slide as the last save left it, though an earlier one is still in the file', async () => {
    const bytes = await fixture('ppt/sample.ppt')
    expect(new TextDecoder('latin1').decode(bytes)).toContain('SECRET-EARLIER-SAVE')
    expect(readPpt(bytes).body).toContain('<h2>Omsett</h2>')
  })

  it('takes the order of the slides from the list of slides, not from where each is stored', async () => {
    const { body } = readPpt(await fixture('_traps/slides-stored-out-of-order.ppt'))
    expect([...body.matchAll(/<h2>([^<]*)<\/h2>/g)].map((m) => m[1])).toEqual(['First', 'Second', 'Third'])
  })

  it('becomes Markdown by way of a page', async () => {
    const html = await convert(await fixture('ppt/sample.ppt'), 'ppt', 'html')
    expect(html).toContain('<html lang="en-GB">')
    expect(html).toContain('<title>About Omsett</title>')
    const md = await convert(html, 'html', 'md')
    expect(md).toContain('# About Omsett\n\n## Omsett')
    expect(md).toContain('  - Workbooks')
  })

  it('never makes a link of code, nor puts on the page a picture that is not what it says', async () => {
    expect(readPpt(await fixture('_traps/link-that-is-code.ppt')).body).toContain('<ul><li>Please read the report today.</li></ul>')
    const picture = readPpt(await fixture('_traps/picture-that-is-a-script.ppt')).body
    expect(picture).toContain('<p>[Picture: A chart of the year]</p>')
    expect(picture).not.toContain('<img')
  })

  it('refuses what cannot be read, in words that say why', async () => {
    expect(await refusal('docx/sample.docx')).toBe('Refusal: This file is not a valid PPT presentation')
    expect(await refusal('doc/sample.doc')).toBe('Refusal: This file is not a valid PPT presentation')
    expect(await refusal('_traps/locked-with-a-password.ppt')).toBe('Refusal: This presentation is locked with a password, and cannot be read without it')
    expect(await refusal('_traps/from-powerpoint-95.ppt')).toMatch(/^Refusal: This presentation was saved by PowerPoint 95 or earlier/)
    for (const trap of ['saves-in-a-circle', 'directory-two-gigabytes-in', 'slide-two-gigabytes-in', 'record-longer-than-the-file', 'one-slide-named-twice', 'groups-two-hundred-deep', 'truncated']) {
      expect(await refusal(`_traps/${trap}.ppt`), trap).toBe('Refusal: This file is not a valid PPT presentation')
    }
    expect(await refusal('_traps/table-drawn-on-a-slant.ppt')).toBe('Refusal: This presentation is too large to convert in a browser')
    expect(await refusal('_traps/every-slide-hidden.ppt')).toBe('Refusal: This presentation has no text in it to convert')
  })
})
