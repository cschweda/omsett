import { readFile } from 'node:fs/promises'
import { formatById, registry } from '@omsett/registry'
import { describe, expect, it } from 'vitest'
import { readExif } from './exif'
import { describeFile } from './index'

const bytes = async (path: string) => new Uint8Array(await readFile(new URL(`../../../../fixtures/${path}`, import.meta.url)))
const details = async (path: string, format: string) =>
  Object.fromEntries((await describeFile(new Blob([(await bytes(path)) as BlobPart]), formatById(registry, format)!)).map((detail) => [detail.label, `${detail.value}${detail.fate ? ` [${detail.fate}]` : ''}`]))

describe('what a file carries', () => {
  it('a photograph: when, with what, by whom, and where; all of it removed by converting', async () => {
    expect(await details('_cases/with-exif.jpg', 'jpeg')).toEqual({
      Taken: '2026-11-23 14:29:58 [removed]',
      Camera: 'Omsett Phone 9 [removed]',
      Lens: 'Omsett 26mm f/1.8 [removed]',
      Location: '39.79819, -89.65481 [removed]',
      'Made with': 'make-exif.py 1.0 [removed]',
      By: 'Ada Lovelace [removed]',
      Copyright: '(c) 2026 Ada Lovelace [removed]',
      Description: 'The sample picture [removed]',
    })
    // A picture that carries nothing has nothing listed.
    expect(await details('jpeg/sample.jpg', 'jpeg')).toEqual({})
    expect(await details('png/sample.png', 'png')).toEqual({})
  })

  it('a Word document: its author, and what is in it that its author may think is gone', async () => {
    expect(await details('docx/sample.docx', 'docx')).toEqual({
      Title: 'About Omsett [kept]',
      Author: 'SECRET-AUTHOR Ada Lovelace [removed]',
      'Tracked changes': '2 changes. Deleted text is left out; inserted text is kept as ordinary text [removed]',
      Comments: 'Yes [removed]',
      'Hidden text': 'Yes [removed]',
    })
  })

  it('a workbook and a presentation: hidden sheets, speaker notes', async () => {
    expect(await details('xlsx/sample.xlsx', 'xlsx')).toMatchObject({ Sheets: '3, 1 hidden. The first one shown is converted, unless you choose another' })
    expect(await details('pptx/sample.pptx', 'pptx')).toMatchObject({ Title: 'About Omsett [kept]', 'Speaker notes': 'On 1 slide [removed]' })
  })

  it('an Office file saved with macros: the macros, which are never run and never carried over', async () => {
    const macros = 'Yes. They are never run and never carried over [removed]'
    expect(await details('_traps/with-a-macro.docm', 'docx')).toMatchObject({ Macros: macros })
    expect(await details('_traps/with-a-macro.pptm', 'pptx')).toMatchObject({ Macros: macros })
    expect(await details('_traps/with-a-macro.xlsm', 'xlsx')).toMatchObject({ Macros: macros })
    expect(await details('_traps/a-template.dotx', 'docx')).not.toHaveProperty('Macros')
  })

  it('a PDF: what made it, how many pages, and whether it is tagged', async () => {
    expect(await details('pdf/sample.pdf', 'pdf')).toEqual({
      Title: 'About Omsett [kept]',
      Author: 'SECRET-AUTHOR Ada Lovelace [removed]',
      'Made into a PDF by': 'make-pdfs.py [removed]',
      Pages: '1',
      Language: 'en-GB [kept]',
      Tagged: 'Yes: it says what its headings, lists and tables are',
    })
    expect(await details('pdf/untagged.pdf', 'pdf')).toMatchObject({ Tagged: 'No: its structure will be estimated from its layout' })
  })

  it('a font, an archive, subtitles, a script and a Drafter package', async () => {
    expect(await details('ttf/sample.ttf', 'ttf')).toMatchObject({ Family: 'Omsett Sample [kept]', Style: 'Regular [kept]', 'Letters and symbols': '7 [kept]', Outlines: 'TrueType (unwraps to TTF) [kept]' })
    expect(await details('woff/postscript.woff', 'woff')).toMatchObject({ Outlines: 'PostScript (unwraps to OTF) [kept]' })
    expect(await details('zip/sample.zip', 'zip')).toMatchObject({ Holds: '5 files in 1 folder [kept]', Programs: '1 file marked as programs. None is ever run' })
    expect(await details('srt/sample.srt', 'srt')).toEqual({ Subtitles: '3 [kept]', 'Runs from': '0:00:01 to 0:01:06 [kept]' })
    expect(await details('fountain/sample.fountain', 'fountain')).toMatchObject({ Title: 'OMSETT [kept]', Author: 'Ada Lovelace [kept]', Scenes: '4 [kept]' })
    expect(await details('drafter/sample.drafter', 'drafter')).toMatchObject({
      Title: 'Omsett [kept]',
      'Earlier drafts': "1. They are the writer's own papers and are left out [removed]",
      'Cut material': 'Yes [removed]',
    })
  })

  it('a file that cannot be read has no details, and says nothing', async () => {
    const png = formatById(registry, 'png')!
    for (const format of ['docx', 'pdf', 'zip', 'ttf', 'srt', 'drafter', 'jpeg']) {
      expect(await describeFile(new Blob(['not that at all']), formatById(registry, format)!), format).toEqual([])
    }
    expect(await describeFile(new Blob([]), png)).toEqual([])
  })
})

describe('the block a camera writes', () => {
  const exif = async () => {
    const jpeg = await bytes('_cases/with-exif.jpg')
    // The block begins twelve bytes in: after the JPEG's first marker, the block's marker and length, and "Exif".
    return { jpeg, at: 12 }
  }

  it('is read as far as it is true when its pointers lie', async () => {
    const { jpeg, at } = await exif()
    const view = (copy: Uint8Array) => new DataView(copy.buffer)
    // The first list is said to be past the end of the file.
    const outside = jpeg.slice()
    view(outside).setUint32(at + 4, 0x7FFFFFFF, true)
    expect(readExif(outside)).toBeNull()
    // The first list is said to hold sixty-five thousand entries.
    const many = jpeg.slice()
    view(many).setUint16(at + 8, 0xFFFF, true)
    expect(() => readExif(many)).not.toThrow()
    // Every pointer in the block is turned to point at the first list: lists that hold themselves.
    const loop = jpeg.slice()
    for (let i = at + 10; i + 12 < at + 10 + 9 * 12; i += 12) {
      const tag = view(loop).getUint16(i, true)
      if (tag === 0x8769 || tag === 0x8825) view(loop).setUint32(i + 8, 8, true)
    }
    const started = performance.now()
    expect(() => readExif(loop)).not.toThrow()
    expect(performance.now() - started).toBeLessThan(500)
  })

  it('does not take a control code or a line break for part of a name', async () => {
    const { jpeg } = await exif()
    // The model's name, with a line break and a control code written into it, at the same length.
    const model = `Oms\r\n${String.fromCodePoint(1)}t Phone9`
    const text = Buffer.from(jpeg).toString('latin1').replace('Omsett Phone 9', model)
    expect(readExif(new Uint8Array(Buffer.from(text, 'latin1')))?.camera).toBe('Omsett Omst Phone9')
  })

  it('refuses a place that is not on the Earth', async () => {
    const { jpeg } = await exif()
    const copy = jpeg.slice()
    const text = Buffer.from(copy).toString('latin1')
    // The degrees of latitude, 39 over 1, become 3900 over 1.
    const at = text.indexOf(String.fromCodePoint(39, 0, 0, 0, 1, 0, 0, 0, 47))
    new DataView(copy.buffer).setUint32(at, 3900, true)
    expect(readExif(copy)?.location).toBeUndefined()
  })
})
