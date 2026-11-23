import { readFile } from 'node:fs/promises'
import { formatById, registry } from '@omsett/registry'
import { describe, expect, it } from 'vitest'
import { readZip, writeZip } from '../archive/zip'
import { Refusal } from '../util'
import { createMarkupEngine } from './index'

const fixture = async (path: string) => new Uint8Array(await readFile(new URL(`../../../../fixtures/${path}`, import.meta.url)))
async function convert(input: Uint8Array | string, from = 'pptx', to = 'html') {
  const [output] = await createMarkupEngine().convert({
    blob: new Blob([input as BlobPart]),
    name: `deck.${from}`,
    from: formatById(registry, from)!,
    to: formatById(registry, to)!,
    options: {},
    signal: new AbortController().signal,
    onProgress: () => {},
  })
  return output!.blob.text()
}
const refusal = (work: Promise<unknown>) =>
  work.then(
    () => null,
    (error: unknown) => (error instanceof Refusal ? error.message : `not a Refusal: ${String(error)}`),
  )
/** The sample presentation with parts replaced (text), removed (null) or added. */
async function altered(change: Record<string, string | null>): Promise<Uint8Array> {
  const entries = (await readZip(await fixture('pptx/sample.pptx'))).filter((entry) => change[entry.name] !== null)
  for (const entry of entries) if (typeof change[entry.name] === 'string') entry.data = new TextEncoder().encode(change[entry.name]!)
  return writeZip(entries)
}
const partOf = async (name: string) => new TextDecoder().decode((await readZip(await fixture('pptx/sample.pptx'))).find((entry) => entry.name === name)!.data)
const NOT = 'This file is not a valid PPTX presentation'

describe('presentations', () => {
  it('become a page with the outline the slides had', async () => {
    const html = (await convert(await fixture('pptx/sample.pptx'))).replace(/\n/g, '')
    expect(html).toContain('<html lang="en-GB">')
    expect(html).toContain('<title>About Omsett</title>')
    // One heading for the presentation, then one for each slide, in the order they are shown.
    expect([...html.matchAll(/<h([12])>([^<]*)<\/h\1>/g)].map((m) => `${m[1]} ${m[2]}`)).toEqual([
      '1 About Omsett',
      '2 Omsett',
      '2 What it converts',
      '2 A picture and a table, café 字幕',
    ])
    // A subtitle is a line, not a bullet. The body's paragraphs are bullets, at their levels.
    expect(html).toContain('<h2>Omsett</h2><p>Drop a file. Pick a format.</p>')
    expect(html).toContain('<ul><li>Pictures</li><li>Data, such as <strong>JSON</strong> and <em>CSV</em><ul><li>Workbooks</li><li>Contacts</li></ul></li><li>See <a href="https://omsett.com">omsett.com</a></li></ul>')
    // A box drawn by hand is a paragraph; the slide's number is not content.
    expect(html).toContain('<p>Nothing leaves your device.</p></section>')
    expect(html).toMatch(/<img src="data:image\/png;base64,[A-Za-z0-9+/=]+" alt="The Omsett mark: a word in white with a blue square">/)
    expect(html).toContain('<table><thead><tr><th>Format</th><th>Kind</th></tr></thead><tbody><tr><td>PNG</td><td>Picture</td></tr>')
  })

  it('leave out what the audience was not shown: hidden slides, speaker notes, the author', async () => {
    const html = await convert(await fixture('pptx/sample.pptx'))
    for (const gone of ['SECRET-HIDDEN-SLIDE', 'not for the audience', 'SECRET-SPEAKER-NOTES', 'SECRET-AUTHOR']) expect(html.includes(gone), gone).toBe(false)
  })

  it('become Markdown in two steps', async () => {
    const md = await convert(await convert(await fixture('pptx/sample.pptx')), 'html', 'md')
    expect(md).toContain('# About Omsett\n\n## Omsett')
    expect(md).toContain('  - Workbooks')
    expect(md).toContain('| Format | Kind')
  })

  it('take the order of the slides from the presentation, not from their file names', async () => {
    const order = (await partOf('ppt/presentation.xml')).replace('r:id="rId1"/><p:sldId id="257" r:id="rId2"/>', 'r:id="rId2"/><p:sldId id="257" r:id="rId1"/>')
    const html = await convert(await altered({ 'ppt/presentation.xml': order }))
    expect(html.indexOf('<h2>What it converts</h2>')).toBeLessThan(html.indexOf('<h2>Omsett</h2>'))
  })

  it('give a slide with no title a heading all the same', async () => {
    const untitled = (await partOf('ppt/slides/slide1.xml')).replace('type="ctrTitle"', 'type="subTitle"')
    const html = await convert(await altered({ 'ppt/slides/slide1.xml': untitled }))
    expect(html.replace(/\n/g, '')).toContain('<section><h2>Slide 1</h2><p>Omsett</p>')
  })

  it('never let a link be code, and never fetch a picture from elsewhere', async () => {
    const code = (await partOf('ppt/slides/_rels/slide2.xml.rels')).replace('https://omsett.com', 'javascript:alert(1)')
    const linked = (await partOf('ppt/slides/_rels/slide3.xml.rels')).replace('Target="../media/image1.png"', 'Target="http://elsewhere.example/seen.png" TargetMode="External"')
    const html = await convert(await altered({ 'ppt/slides/_rels/slide2.xml.rels': code, 'ppt/slides/_rels/slide3.xml.rels': linked }))
    expect(html.includes('javascript')).toBe(false)
    expect(html.includes('elsewhere.example')).toBe(false)
    expect(html).toContain('[Picture: The Omsett mark: a word in white with a blue square]')
    expect(html).toContain('omsett.com')
  })

  it('never read a picture from outside the presentation', async () => {
    const outside = (await partOf('ppt/slides/_rels/slide3.xml.rels')).replace('../media/image1.png', '../../../../etc/passwd')
    const html = await convert(await altered({ 'ppt/slides/_rels/slide3.xml.rels': outside }))
    expect(html.includes('<img')).toBe(false)
  })

  it('refuse what is not a presentation', async () => {
    expect(await refusal(convert('not a presentation'))).toBe(NOT)
    expect(await refusal(convert(await fixture('docx/sample.docx')))).toBe(NOT)
    expect(await refusal(convert((await fixture('pptx/sample.pptx')).subarray(0, 2500)))).toBe(NOT)
    expect(await refusal(convert(await altered({ 'ppt/presentation.xml': null })))).toBe(NOT)
    const bomb = `<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "aaaa">]>${await partOf('ppt/slides/slide1.xml')}`
    expect(await refusal(convert(await altered({ 'ppt/slides/slide1.xml': bomb })))).toBe(NOT)
  })

  it('refuse a presentation in which every slide is hidden or empty', async () => {
    const hide = async (name: string) => (await partOf(name)).replace('<p:sld ', '<p:sld show="0" ')
    const change = Object.fromEntries(await Promise.all(['ppt/slides/slide1.xml', 'ppt/slides/slide2.xml', 'ppt/slides/slide3.xml'].map(async (name) => [name, await hide(name)])))
    expect(await refusal(convert(await altered(change)))).toBe('This presentation has no text in it to convert')
  })
})
