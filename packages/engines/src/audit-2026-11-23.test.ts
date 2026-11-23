// What the red-team audit of 23 November 2026 found in the readers and writers, each as a test
// that failed before its fix. The numbering is the audit's (security/audits.json).
import { formatById, registry } from '@omsett/registry'
import { describe, expect, it } from 'vitest'
import { safeName } from './archive/entries'
import { readTar } from './archive/tar'
import { readZip, writeZip } from './archive/zip'
import { readContacts, writeContacts, writeEvents } from './data/cards'
import { createDataEngine } from './data/index'
import { readWorkbook, writeWorkbook } from './data/sheet'
import { readTable, writeTable } from './data/table'
import { checksum, readSfnt } from './font/sfnt'
import { readDocx } from './markup/docx-read'
import { createMarkupEngine } from './markup/index'
import { readPptx } from './markup/pptx-read'
import { readFdx, writeFdx } from './script/fdx'
import { readFountain, writeFountain } from './script/fountain'
import { readCues } from './subtitle/read'
import { writeCues } from './subtitle/write'
import { outputName, Refusal, withinTags } from './util'

const enc = (text: string) => new TextEncoder().encode(text)
const file = (name: string, data: string | Uint8Array = 'x') => ({
  name,
  data: typeof data === 'string' ? enc(data) : data,
  directory: false,
  modified: null,
  executable: false,
})
const zip = (files: Record<string, string>) => writeZip(Object.entries(files).map(([name, data]) => file(name, data)))
const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
const P =
  'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
const docx = (body: string, styles = '') =>
  zip({ 'word/document.xml': `<w:document ${W}><w:body>${body}</w:body></w:document>`, ...(styles ? { 'word/styles.xml': `<w:styles ${W}>${styles}</w:styles>` } : {}) })
const deck = (slides: string[]) =>
  zip({
    'ppt/presentation.xml': `<p:presentation ${P}><p:sldIdLst>${slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 1}"/>`).join('')}</p:sldIdLst></p:presentation>`,
    'ppt/_rels/presentation.xml.rels': `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${slides.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`).join('')}</Relationships>`,
    ...Object.fromEntries(slides.map((slide, i) => [`ppt/slides/slide${i + 1}.xml`, slide])),
  })
const slide = (shapes: string, attributes = '') => `<p:sld ${P} ${attributes}><p:cSld><p:spTree>${shapes}</p:spTree></p:cSld></p:sld>`
const box = (text: string, hidden = '') =>
  `<p:sp><p:nvSpPr><p:cNvPr id="2" name="x"${hidden}/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:txBody><a:p><a:r><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp>`
const run = (text: string, props = '') => `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}<w:t>${text}</w:t></w:r>`
const timed = async <T>(work: () => T | Promise<T>) => {
  const start = performance.now()
  const value = await work()
  return { value, ms: performance.now() - start }
}
/** Generous, for a machine busy with other tests. Each input here is sized so that it took
 *  half a minute or more before its fix; after, each takes well under a second. */
const QUICK = 6000

describe('OMS-101: tags are counted before an office file is read', () => {
  it('counts in one pass and stops at the limit', () => {
    expect(withinTags('<a><b/></a>', 3)).toBe(true)
    expect(withinTags('<a><b/></a>', 2)).toBe(false)
  })

  it('refuses a workbook of two million empty rows, which were never counted as cells', async () => {
    const book = await zip({
      'xl/workbook.xml':
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>',
      'xl/_rels/workbook.xml.rels':
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/></Relationships>',
      'xl/worksheets/sheet1.xml': `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${'<row/>'.repeat(2_000_000)}</sheetData></worksheet>`,
    })
    await expect(readWorkbook(book)).rejects.toThrow('This workbook is too large to convert in a browser')
  })

  it('refuses a document of two million empty paragraphs', async () => {
    await expect(readDocx(await docx(run('x') + '<w:p/>'.repeat(2_000_000)))).rejects.toThrow('This document is too large to convert in a browser')
  })

  it('names sixteen thousand columns that share a name without counting from the start for each', async () => {
    const cells = Array.from({ length: 16_000 }, () => '<c t="inlineStr"><is><t>n</t></is></c>').join('')
    const book = await zip({
      'xl/workbook.xml':
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>',
      'xl/_rels/workbook.xml.rels':
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/></Relationships>',
      'xl/worksheets/sheet1.xml': `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row>${cells}</row><row>${cells}</row></sheetData></worksheet>`,
    })
    const { value, ms } = await timed(() => readWorkbook(book))
    const names = Object.keys(value[0]!)
    expect(names.slice(0, 3)).toEqual(['n', 'n_2', 'n_3'])
    expect(names).toHaveLength(16_000)
    expect(ms).toBeLessThan(QUICK)
  })
})

describe('OMS-102: text hidden in a Word document is not carried, however it was hidden', () => {
  const styles =
    '<w:style w:type="character" w:styleId="Secret"><w:rPr><w:vanish/></w:rPr></w:style>' +
    '<w:style w:type="character" w:styleId="Child"><w:basedOn w:val="Secret"/></w:style>' +
    '<w:style w:type="character" w:styleId="Shown"><w:basedOn w:val="Secret"/><w:rPr><w:vanish w:val="0"/></w:rPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="HiddenPara"><w:rPr><w:vanish/></w:rPr></w:style>'
  const read = async (body: string) => (await readDocx(await docx(body, styles))).body

  it.each([
    ['a character style', `<w:p>${run('shown ')}${run('LEAK', '<w:rStyle w:val="Secret"/>')}</w:p>`],
    ['a style based on a hiding style', `<w:p>${run('shown ')}${run('LEAK', '<w:rStyle w:val="Child"/>')}</w:p>`],
    ['the paragraph style', `<w:p>${run('shown')}</w:p><w:p><w:pPr><w:pStyle w:val="HiddenPara"/></w:pPr>${run('LEAK')}</w:p>`],
    [
      'the result of a field that shows nothing',
      `<w:p>${run('shown ')}<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> SET secret "x" </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>${run('LEAK')}<w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>`,
    ],
    ['a one-piece field that shows nothing', `<w:p>${run('shown ')}<w:fldSimple w:instr=" SET secret &quot;x&quot; ">${run('LEAK')}</w:fldSimple></w:p>`],
    ['a table row deleted with changes tracked', `<w:tbl><w:tr><w:tc><w:p>${run('shown')}</w:p></w:tc></w:tr><w:tr><w:trPr><w:del w:id="5"/></w:trPr><w:tc><w:p>${run('LEAK')}</w:p></w:tc></w:tr></w:tbl>`],
    ['a table row marked hidden', `<w:tbl><w:tr><w:tc><w:p>${run('shown')}</w:p></w:tc></w:tr><w:tr><w:trPr><w:hidden/></w:trPr><w:tc><w:p>${run('LEAK')}</w:p></w:tc></w:tr></w:tbl>`],
  ])('hidden by %s', async (_how, body) => {
    const html = await read(body)
    expect(html).toContain('shown')
    expect(html).not.toContain('LEAK')
  })

  it('still carries what is shown: a run that turns hiding off, a field that shows its result, and text after a silent field', async () => {
    expect(await read(`<w:p>${run('KEPT', '<w:rStyle w:val="Shown"/>')}</w:p>`)).toContain('KEPT')
    expect(await read(`<w:p><w:pPr><w:pStyle w:val="HiddenPara"/></w:pPr>${run('KEPT', '<w:vanish w:val="0"/>')}</w:p>`)).toContain('KEPT')
    const page = `<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>${run('7')}<w:r><w:fldChar w:fldCharType="end"/></w:r>${run(' AFTER')}</w:p>`
    expect(await read(page)).toBe('<p>7 AFTER</p>')
    const silent = `<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> SET a "b" </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>${run('GONE')}<w:r><w:fldChar w:fldCharType="end"/></w:r>${run('AFTER')}</w:p><w:p>${run('NEXT')}</w:p>`
    expect(await read(silent)).toBe('<p>AFTER</p><p>NEXT</p>')
  })
})

describe('OMS-103: what a presentation hid is not carried, however "hidden" is spelled', () => {
  it.each(['0', 'false', 'off', '00', ' 0'])('a slide with show="%s" is left out', async (show) => {
    const { body } = await readPptx(await deck([slide(box('shown slide')), slide(box('LEAK'), `show="${show}"`)]))
    expect(body).toContain('shown slide')
    expect(body).not.toContain('LEAK')
  })
  it.each(['1', 'true'])('a slide with show="%s" is kept', async (show) => {
    expect((await readPptx(await deck([slide(box('KEPT'), `show="${show}"`)]))).body).toContain('KEPT')
  })
  it('a shape hidden in the editor is left out', async () => {
    const { body } = await readPptx(await deck([slide(box('shown') + box('LEAK', ' hidden="1"') + box('ALSO', ' hidden="true"') + box('kept', ' hidden="0"'))]))
    expect(body).toBe('<section><h2>Slide 1</h2><p>shown</p><p>kept</p></section>')
  })
})

describe('OMS-104: no tag survives in a subtitle, however it was built', () => {
  const convert = async (from: string, to: string, text: string) => writeCues(to, await readCues(from, text))
  const vtt = 'WEBVTT\n\n00:01.000 --> 00:02.000\n&lt;&lt;b&gt;script&gt;alert(1)&lt;&lt;b&gt;/script&gt;\n'
  it.each([
    ['SBV to SRT', 'sbv', 'srt', '0:00:01.000,0:00:02.000\nwords <<b>img src=x onerror=alert(1)>\n'],
    ['SRT with a position code inside the tag', 'srt', 'srt', '1\n00:00:01,000 --> 00:00:02,000\nwords <<{\\an8}b>img src=x onerror=alert(1)>\n'],
    ['SRT words after a blank line', 'srt', 'srt', '1\n00:00:01,000 --> 00:00:02,000\nhello\n\n<{\\x}script>alert(1)<{\\x}/script>\n'],
    ['VTT entities to SRT', 'vtt', 'srt', vtt],
    ['VTT entities to ASS', 'vtt', 'ass', vtt],
    ['TTML entities to SRT', 'ttml', 'srt', '<tt xmlns="http://www.w3.org/ns/ttml"><body><div><p begin="1s" end="2s">words &lt;&lt;b&gt;img src=x onerror=alert(1)&gt;</p></div></body></tt>'],
    ['SAMI entities to SBV', 'smi', 'sbv', '<SAMI><BODY><SYNC Start=1000><P>words &lt;&lt;b&gt;img src=x onerror=alert(1)&gt;</BODY></SAMI>'],
    ['ASS to SRT', 'ass', 'srt', '[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,words <<b>img src=x onerror=alert(1)>\n'],
    ['nested many times over', 'sbv', 'srt', `0:00:01.000,0:00:02.000\n${'<'.repeat(9)}b>b>b>b>b>b>b>b>img src=x onerror=alert(1)>\n`],
  ])('%s', async (_name, from, to, text) => {
    const out = await convert(from, to, text)
    expect(out).not.toMatch(/<\/?(?:img|script|b)\b/i)
    expect(out).toMatch(/words|hello|alert/)
  })

  it('leaves "a < b" alone', async () => {
    expect(await convert('srt', 'srt', '1\n00:00:01,000 --> 00:00:02,000\nif a < b then\n')).toContain('if a < b then')
  })
})

describe('OMS-105: a font whose tables share bytes is refused', () => {
  it('is not written out with a copy of the same megabyte for every table', () => {
    const count = 64
    const size = 64 * 1024
    const tags = ['head', 'hhea', 'maxp', 'cmap', 'glyf', 'loca', ...Array.from({ length: count - 6 }, (_, i) => `T${String(i).padStart(3, '0')}`)]
    const start = 12 + 16 * count
    const bytes = new Uint8Array(start + size)
    const view = new DataView(bytes.buffer)
    view.setUint32(0, 0x00010000)
    view.setUint16(4, count)
    view.setUint32(start + 12, 0x5F0F3CF5)
    const sum = checksum(bytes.subarray(start))
    tags.forEach((tag, i) => {
      const at = 12 + 16 * i
      for (let c = 0; c < 4; c++) view.setUint8(at + c, tag.codePointAt(c)!)
      view.setUint32(at + 4, sum)
      view.setUint32(at + 8, start)
      view.setUint32(at + 12, size)
    })
    expect(() => readSfnt(bytes, 'TTF')).toThrow('This file is not a valid TTF font')
  })
})

describe('OMS-106: a table is not written wider and longer than a browser can hold', () => {
  const rows = Array.from({ length: 4000 }, (_, i) => ({ [`k${i}`]: 1 }))
  it('refuses rows that each bring a column of their own, in words', async () => {
    expect(() => writeTable(rows, false)).toThrow(Refusal)
    expect(() => writeTable(rows, false)).toThrow(/every row would be given every column/)
    await expect(writeWorkbook(rows)).rejects.toThrow(/every row would be given every column/)
    expect(() => writeTable(readTable(`h\n${','.repeat(4000)}1\n${'1\n'.repeat(4000)}`, false), false)).toThrow(Refusal)
  })
  it('still writes an ordinary ragged table', () => {
    expect(writeTable([{ a: 1 }, { b: 2 }], false)).toBe('a,b\r\n1,\r\n,2\r\n')
  })
})

describe('OMS-107: names an archive may not carry', () => {
  const refused = async (names: string[], reason: RegExp) => {
    await expect(readZip(await writeZip(names.map((name) => file(name))))).rejects.toThrow(reason)
  }
  it('two names that differ only in capitals, or in how an accent is written', async () => {
    await refused(['Readme.txt', 'README.TXT'], /differ only in capitals or accents/)
    await refused(['caf\u00E9.txt', 'cafe\u0301.txt'], /differ only in capitals or accents/)
    await refused(['Docs/a.txt', 'docs/A.TXT'], /differ only in capitals or accents/)
  })
  it.each(['CON', 'NUL.txt', 'NUL .txt', 'nul.tar.gz', 'CONIN$', 'clock$.txt', 'com1.log', 'aux.h', 'dir/LPT1.txt', 'trailing.', 'trailing ', 'folder /x.txt', 'notes.txt:hidden.exe', 'x.txt::$DATA'])(
    '%j, which Windows cannot keep safely',
    (name) => {
      expect(() => safeName(name, 'ZIP')).toThrow(/Windows cannot keep safely/)
    },
  )
  it('a name that is both a file and a folder', async () => {
    await refused(['dir', 'dir/inside.txt'], /not a valid ZIP archive/)
    await refused(['dir/inside.txt', 'dir'], /not a valid ZIP archive/)
  })
  it('keeps ordinary names, a folder listed before its files, and names that only look alike', async () => {
    const names = ['docs/a.txt', 'docs/b.txt', 'console.log', 'nullable.ts', 'com.example/x', 'a.b.c', '.hidden']
    expect((await readZip(await writeZip(names.map((name) => file(name))))).map((entry) => entry.name)).toEqual(names)
  })
  it('drops the Arabic letter mark, which changes the direction a name is shown in', () => {
    expect(safeName('evil\u061C.txt', 'ZIP')).toBe('evil.txt')
  })
  it('never offers a download named for a device', () => {
    const png = formatById(registry, 'png')!
    expect(outputName('CON.jpg', png)).toBe('_CON.png')
    expect(outputName('nul.jpg', png)).toBe('_nul.png')
    expect(outputName('LPT1', png)).toBe('_LPT1.png')
    expect(outputName('console.jpg', png)).toBe('console.png')
    expect(outputName('NUL .backup.jpg', png)).toBe('_NUL .backup.png')
  })
})

describe('OMS-108 to OMS-112: loops that went round once for everything already read', () => {
  it('a TAR extended header whose length is three hundred thousand zeros and a three', () => {
    const header = (name: string, size: number, type: string) => {
      const block = new Uint8Array(512)
      block.set(enc(name), 0)
      block.set(enc('0000644\0'), 100)
      block.set(enc('0000000\0'), 108)
      block.set(enc('0000000\0'), 116)
      block.set(enc(`${size.toString(8).padStart(11, '0')}\0`), 124)
      block.set(enc('00000000000\0'), 136)
      block.set(enc(type), 156)
      block.set(enc('ustar\x0000'), 257)
      block.fill(0x20, 148, 156)
      block.set(enc(`${block.reduce((a, c) => a + c, 0).toString(8).padStart(6, '0')}\0 `), 148)
      return block
    }
    const pax = enc(`${'0'.repeat(320_000)}3 x`)
    const padded = new Uint8Array(Math.ceil(pax.length / 512) * 512)
    padded.set(pax)
    const body = new Uint8Array(512)
    body.set(enc('hi'))
    const tar = new Uint8Array([...header('PaxHeader', pax.length, 'x'), ...padded, ...header('a.txt', 2, '0'), ...body, ...new Uint8Array(1024)])
    const start = performance.now()
    expect(readTar(tar, 'TAR').map((entry) => entry.name)).toEqual(['a.txt'])
    expect(performance.now() - start).toBeLessThan(QUICK)
  })

  it('SRT words continued after a blank line, a hundred and sixty thousand times, and counted toward the limit', async () => {
    const { value, ms } = await timed(() => readCues('srt', `1\n00:00:01,000 --> 00:00:02,000\nhi\n\n${'x\n\n'.repeat(160_000)}`))
    expect(value).toHaveLength(1)
    expect(value[0]!.text.split('\n')).toHaveLength(160_001)
    expect(ms).toBeLessThan(QUICK)
  })

  it('a Fountain title of three hundred thousand lines, brackets never closed, and spaces mid-line', () => {
    const start = performance.now()
    const titled = readFountain(`Title: x\n${'  yyyyyyyyyyyyyyyyyy\n'.repeat(320_000)}\nINT. ROOM - DAY\n\nHello.\n`)
    expect(titled.title[0]!.value.split('\n')).toHaveLength(320_001)
    readFountain(`\n${'('.repeat(320_000)}\nsay\n`)
    readFountain(`\nx${' '.repeat(320_000)}x\n`)
    expect(performance.now() - start).toBeLessThan(QUICK)
    // And the brackets still mean what they meant.
    const script = readFountain('\nADA (V.O.) (cont\'d)\nHello.\n')
    expect(script.elements.map((element) => element.kind)).toEqual(['character', 'dialogue'])
  })

  it('writing Final Draft from three hundred thousand lines of action, and pairing speakers as before', async () => {
    const { ms } = await timed(() => writeFdx(readFountain('a\n\n'.repeat(320_000))))
    expect(ms).toBeLessThan(QUICK)
    const dual = writeFdx(readFountain('\nADA\nOne.\n\nGRACE ^\nTwo.\n'))
    expect(dual).toContain('<DualDialogue>')
  })

  it('a vCard note continued with soft breaks a hundred and twenty thousand times', () => {
    const card = `BEGIN:VCARD\nVERSION:2.1\nFN:x\nNOTE;ENCODING=QUOTED-PRINTABLE:${'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa=\n'.repeat(120_000)}z\nEND:VCARD\n`
    const start = performance.now()
    const [contact] = readContacts(card)
    expect(performance.now() - start).toBeLessThan(QUICK)
    expect(String(contact!.note)).toHaveLength(39 * 120_000 + 1)
  })
})

describe('OMS-113: Markdown and HTML, long and deep', () => {
  const engine = createMarkupEngine()
  const convert = async (from: string, to: string, text: string) => {
    const [output] = await engine.convert({
      blob: new Blob([text]),
      name: 'in',
      from: formatById(registry, from)!,
      to: formatById(registry, to)!,
      options: {},
      signal: new AbortController().signal,
      onProgress: () => {},
    } as never)
    return output!.blob
  }

  it('a long flat page converts: it is long, not deep', async () => {
    const page = `<title>t</title><main><h1>t</h1>${'<p>a</p>'.repeat(150_000)}</main>`
    expect((await convert('html', 'md', page)).size).toBeGreaterThan(400_000)
    expect((await convert('html', 'docx', page)).size).toBeGreaterThan(1000)
    expect((await convert('md', 'html', `# t\n\n${'a\n\n'.repeat(150_000)}`)).size).toBeGreaterThan(1_000_000)
  }, 60_000)

  it('Markdown with no top heading costs about what Markdown with one does', async () => {
    const body = 'a\n\n'.repeat(40_000)
    const headed = await timed(() => convert('md', 'html', `# t\n\n${body}`))
    const bare = await timed(() => convert('md', 'html', body))
    // It was seven times as long, and worse with every paragraph.
    expect(bare.ms).toBeLessThan(headed.ms * 3 + 500)
  })

  it.each([300, 1000, 3000, 20_000])('HTML nested %i deep inside Markdown is refused by the stated limit', async (depth) => {
    await expect(convert('md', 'html', `# t\n\n${'<div>'.repeat(depth)}x${'</div>'.repeat(depth)}\n`)).rejects.toThrow('This file is nested too deeply to convert')
  })

  it('HTML nested a little inside Markdown is kept', async () => {
    const html = await (await convert('md', 'html', `# t\n\n${'<div>'.repeat(20)}x${'</div>'.repeat(20)}\n\n<br><br><img src="a.png" alt="a">\n`)).text()
    expect(html.match(/<div>/g)).toHaveLength(20)
  })
})

describe('OMS-114: names every object answers to are not values', () => {
  const src = '[{"__proto__":1,"constructor":2,"a":3},{"a":4}]'
  const engine = createDataEngine()
  const convert = async (to: string, options = {}) => {
    const [output] = await engine.convert({
      blob: new Blob([src]),
      name: 'x.json',
      from: formatById(registry, 'json')!,
      to: formatById(registry, to)!,
      options,
      signal: new AbortController().signal,
      onProgress: () => {},
    } as never)
    return output!.blob
  }
  it('a row without a column called "constructor" has nothing in it', async () => {
    expect(writeTable(JSON.parse(src) as unknown, false)).toBe('__proto__,constructor,a\r\n1,2,3\r\n,,4\r\n')
    expect((await convert('xlsx')).size).toBeGreaterThan(500)
    expect(JSON.parse(await (await convert('json', { shape: 'columns' })).text())).toEqual(JSON.parse('{"__proto__":[1,null],"constructor":[2,null],"a":[3,4]}'))
    expect(await (await convert('yaml', { shape: 'rows' })).text()).toContain('constructor')
  })
  it('a Final Draft paragraph of kind "constructor" is a line like any other of unknown kind', async () => {
    const script = await readFdx(
      '<?xml version="1.0"?><FinalDraft DocumentType="Script" Version="5"><Content><Paragraph Type="Action"><Text>Seen.</Text></Paragraph><Paragraph Type="constructor"><Text>Also seen.</Text></Paragraph><Paragraph Type="__proto__"><Text>And this.</Text></Paragraph></Content></FinalDraft>',
    )
    expect(script.elements.map((element) => element.kind)).toEqual(['action', 'action', 'action'])
    expect(writeFountain(script)).toBe('Seen.\n\nAlso seen.\n\nAnd this.\n')
  })
  it('an entity named for one is left as written', async () => {
    const cues = await readCues('vtt', 'WEBVTT\n\n00:01.000 --> 00:02.000\na &constructor; b &lt; c\n')
    expect(cues[0]!.text).toBe('a &constructor; b < c')
  })
})

describe('OMS-115: text that reads as structure in the file it is written to', () => {
  it('lyrics that begin with a time stay one line of lyrics', async () => {
    const lrc = writeCues('lrc', await readCues('srt', '1\n00:00:01,000 --> 00:00:02,000\n[59:00.00][ar:x]fake\n'))
    const back = await readCues('lrc', lrc)
    expect(back).toHaveLength(1)
    expect(back[0]).toMatchObject({ start: 1000, text: '[59:00.00][ar:x]fake' })
  })
  it('a contact or an event cannot end its own line with a line separator', () => {
    const card = writeContacts([{ name: 'Ann\u2028END:VCARD\u2028BEGIN:VCARD\u2028FN:Injected\u0085TEL:666' }])
    const event = writeEvents([{ summary: 'a\u2029ATTACH:file:///etc/passwd', start: '2026-01-01' }], new Date(0))
    for (const text of [card, event]) expect(text).not.toMatch(/[\u0085\u2028\u2029]/)
  })
})
