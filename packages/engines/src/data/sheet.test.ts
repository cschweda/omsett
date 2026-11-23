import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { readZip, writeZip } from '../archive/zip'
import { Refusal } from '../util'
import { readWorkbook, writeWorkbook } from './sheet'

const fixture = async (path: string) => new Uint8Array(await readFile(new URL(`../../../../fixtures/${path}`, import.meta.url)))
const refusal = (work: Promise<unknown>) =>
  work.then(
    () => null,
    (error: unknown) => (error instanceof Refusal ? error.message : `not a Refusal: ${String(error)}`),
  )

/** A workbook from the sample with one of its parts replaced or removed. */
async function altered(change: Record<string, string | null>): Promise<Uint8Array> {
  const entries = await readZip(await fixture('xlsx/sample.xlsx'))
  const kept = entries.filter((entry) => change[entry.name] !== null)
  for (const entry of kept) {
    const replacement = change[entry.name]
    if (typeof replacement === 'string') entry.data = new TextEncoder().encode(replacement)
  }
  return writeZip(kept)
}
const SHEET = (rows: string) => `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`

describe('workbooks', () => {
  it('reads the first sheet that is shown, with each kind of cell as what it is', async () => {
    expect(await readWorkbook(await fixture('xlsx/sample.xlsx'))).toEqual([
      {
        id: 1,
        name: 'Ada Lovelace',
        born: '1815-12-10',
        // A number shown as a date is read as the date.
        joined: '2026-11-23',
        // Money is a number with a pattern, and stays a number.
        salary: 1234.5,
        note: 'Wrote the first program, & said so <plainly>\nin two lines',
        // Text that looks like a number stays text, zero and all.
        postcode: '01234',
        active: true,
      },
      {
        // A formula gives the value it last showed. It is not worked out.
        id: 2,
        // Text in runs of differing style is joined; the guide to its pronunciation is not text.
        name: 'Grace Hopper',
        born: '1906-12-06',
        joined: '2026-11-23T14:30:00',
        salary: 0.1,
        note: null,
        postcode: 10001,
        active: false,
      },
      { id: 3, name: 'Café 字幕', born: null, joined: null, salary: null, note: 'ab', postcode: null, active: '#DIV/0!' },
    ])
  })

  it('writes a workbook that reads back as the same rows', async () => {
    const rows = [
      { id: 1, name: 'Ada', active: true, note: 'a & b <c>\nd', formula: '=1+1', list: [1, 2], nothing: null },
      { id: 2, name: '字幕', active: false, note: '', formula: '@SUM(A1)', list: { a: 1 }, extra: 0.1 },
    ]
    expect(await readWorkbook(await writeWorkbook(rows))).toEqual([
      { id: 1, name: 'Ada', active: true, note: 'a & b <c>\nd', formula: '=1+1', list: '[1,2]', nothing: null, extra: null },
      { id: 2, name: '字幕', active: false, note: '', formula: '@SUM(A1)', list: '{"a":1}', nothing: null, extra: 0.1 },
    ])
  })

  it('writes text as text, so that nothing becomes a formula', async () => {
    const entries = await readZip(await writeWorkbook([{ cell: '=HYPERLINK("http://elsewhere.example","x")' }]))
    const sheet = new TextDecoder().decode(entries.find((entry) => entry.name === 'xl/worksheets/sheet1.xml')!.data)
    expect(sheet).toContain('t="inlineStr"><is><t xml:space="preserve">=HYPERLINK(')
    expect(sheet.includes('<f>')).toBe(false)
  })

  it('gives a name to a column that has none, and tells two of one name apart', async () => {
    const book = await altered({
      'xl/worksheets/sheet2.xml': SHEET(
        '<row r="1"><c r="A1" t="inlineStr"><is><t>a</t></is></c><c r="C1" t="inlineStr"><is><t>a</t></is></c><c r="D1" t="inlineStr"><is><t>__proto__</t></is></c></row>' +
          '<row r="2"><c r="A2"><v>1</v></c><c r="B2"><v>2</v></c><c r="C2"><v>3</v></c><c r="D2"><v>4</v></c></row>',
      ),
    })
    const rows = await readWorkbook(book)
    expect(Object.entries(rows[0]!)).toEqual([['a', 1], ['column_B', 2], ['a_2', 3], ['__proto__', 4]])
    expect(Object.getPrototypeOf(rows[0])).toBe(Object.prototype)
  })

  it('counts dates as Excel does, the leap year that never was included', async () => {
    const cell = (serial: number) => `<row r="2"><c r="A2" s="1"><v>${serial}</v></c></row>`
    const read = async (serial: number) =>
      (await readWorkbook(await altered({ 'xl/worksheets/sheet2.xml': SHEET(`<row r="1"><c r="A1" t="inlineStr"><is><t>d</t></is></c></row>${cell(serial)}`) })))[0]!.d
    expect(await read(1)).toBe('1900-01-01')
    expect(await read(59)).toBe('1900-02-28')
    expect(await read(61)).toBe('1900-03-01')
    expect(await read(25569)).toBe('1970-01-01')
    expect(await read(45000.5)).toBe('2023-03-15T12:00:00')
    // Past the last day Excel has, it is a number and not a date.
    expect(await read(9_999_999)).toBe(9_999_999)
  })

  describe('refuses', () => {
    it('what is not a workbook', async () => {
      expect(await refusal(readWorkbook(new TextEncoder().encode('not a workbook')))).toBe('This file is not a valid XLSX workbook')
      // A ZIP that is sound and is not a workbook.
      expect(await refusal(readWorkbook(await fixture('zip/sample.zip')))).toBe('This file is not a valid XLSX workbook')
      expect(await refusal(readWorkbook(await altered({ 'xl/workbook.xml': null })))).toBe('This file is not a valid XLSX workbook')
      expect(await refusal(readWorkbook((await fixture('xlsx/sample.xlsx')).subarray(0, 1500)))).toBe('This file is not a valid XLSX workbook')
    })

    it('a workbook with no rows', async () => {
      expect(await refusal(readWorkbook(await altered({ 'xl/worksheets/sheet2.xml': SHEET(''), 'xl/worksheets/sheet3.xml': SHEET('') })))).toBe('This workbook has no rows in it')
    })

    it('a part that defines shorthand of its own', async () => {
      const bomb = `<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;">]>${SHEET('<row r="1"><c r="A1" t="inlineStr"><is><t>&b;</t></is></c></row>')}`
      expect(await refusal(readWorkbook(await altered({ 'xl/worksheets/sheet2.xml': bomb })))).toBe('This file is not a valid XLSX workbook')
    })

    it('a cell that says it is somewhere no sheet has', async () => {
      for (const at of ['ZZZZ1', 'XFE1', 'A0x', '1A', '']) {
        const book = await altered({ 'xl/worksheets/sheet2.xml': SHEET(`<row r="1"><c r="${at}"><v>1</v></c></row>`) })
        expect(await refusal(readWorkbook(book)), at).toBe('This file is not a valid XLSX workbook')
      }
    })

    it('a sheet that is small in the file and vast when laid out', async () => {
      // One cell a row, each in the last column: 400 cells that take the room of six million.
      const rows = Array.from({ length: 400 }, (_, i) => `<row r="${i + 1}"><c r="XFD${i + 1}"><v>1</v></c></row>`).join('')
      expect(await refusal(readWorkbook(await altered({ 'xl/worksheets/sheet2.xml': SHEET(rows) })))).toBe('This workbook is too large to convert in a browser')
      // One wide row above many narrow ones is as wide all the way down.
      const tall = `<row r="1"><c r="XFD1"><v>1</v></c></row>${Array.from({ length: 400 }, (_, i) => `<row r="${i + 2}"><c r="A${i + 2}"><v>1</v></c></row>`).join('')}`
      expect(await refusal(readWorkbook(await altered({ 'xl/worksheets/sheet2.xml': SHEET(tall) })))).toBe('This workbook is too large to convert in a browser')
    })

    it('an empty sheet named over and over is read once', async () => {
      const entries = await readZip(await fixture('xlsx/sample.xlsx'))
      const part = (name: string) => new TextDecoder().decode(entries.find((entry) => entry.name === name)!.data)
      const many = Array.from({ length: 3000 }, (_, i) => `<sheet name="S${i}" sheetId="${i + 10}" r:id="rId2"/>`).join('')
      const book = await altered({
        'xl/workbook.xml': part('xl/workbook.xml').replace(/<sheets>.*<\/sheets>/, `<sheets>${many}</sheets>`),
        'xl/worksheets/sheet2.xml': SHEET(' '.repeat(2_000_000)),
      })
      const started = performance.now()
      expect(await refusal(readWorkbook(book))).toBe('This workbook has no rows in it')
      expect(performance.now() - started).toBeLessThan(5000)
    })

    it('a sheet that points outside the workbook', async () => {
      const links =
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId2" Target="../../../../etc/passwd"/></Relationships>'
      expect(await refusal(readWorkbook(await altered({ 'xl/_rels/workbook.xml.rels': links })))).toBe('This file is not a valid XLSX workbook')
    })

    it('more than a sheet or a cell can hold', async () => {
      expect(await refusal(writeWorkbook([{ cell: 'x'.repeat(32_768) }]))).toBe('A value here is longer than a spreadsheet cell can hold (32,767 characters)')
      expect(await refusal(writeWorkbook([Object.fromEntries(Array.from({ length: 16_385 }, (_, i) => [`c${i}`, i]))]))).toBe(
        'This is more than one sheet can hold: 1,048,576 rows and 16,384 columns',
      )
      expect(await refusal(writeWorkbook([]))).toBe('There is nothing here to put in a table')
    })
  })
})

describe('the sheets of a workbook, by choice', () => {
  const convert = async (to: string, options: Record<string, unknown>) => {
    const { createDataEngine } = await import('./index')
    const { formatById, registry } = await import('@omsett/registry')
    const outputs = await createDataEngine().convert({
      blob: new Blob([(await fixture('xlsx/sample.xlsx')) as BlobPart]),
      name: 'budget.xlsx',
      from: formatById(registry, 'xlsx')!,
      to: formatById(registry, to)!,
      options: { headerRow: true, ...options },
      signal: new AbortController().signal,
      onProgress: () => {},
    } as never)
    return Promise.all(outputs.map(async (output) => ({ name: output.name, text: await output.blob.text() })))
  }

  it('are listed as their tabs show them, hidden ones left out', async () => {
    const { listSheets } = await import('./sheet')
    expect(await listSheets(await fixture('xlsx/sample.xlsx'))).toEqual(['People', 'Totals'])
    expect(await listSheets(new TextEncoder().encode('not a workbook'))).toEqual([])
  })

  it('the first with anything in it, where no other is asked for', async () => {
    const [first] = await convert('json', { shape: 'records', sheet: 'first' })
    const [unsaid] = await convert('json', { shape: 'records' })
    expect(first!.text).toBe(unsaid!.text)
    expect(first!.name).toBe('budget.json')
    expect(JSON.parse(first!.text)).toHaveLength(3)
  })

  it('one by its position among the sheets shown', async () => {
    const [second] = await convert('json', { shape: 'records', sheet: '2' })
    expect(JSON.parse(second!.text)).toEqual([{ total: 3 }])
    expect(second!.name).toBe('budget.json')
    // The hidden sheet has no position: it cannot be asked for.
    expect(await refusal(convert('json', { shape: 'records', sheet: '3' }))).toBe('This workbook has no such sheet')
    expect(await refusal(convert('json', { shape: 'records', sheet: '0' }))).toBe('This workbook has no such sheet')
    expect(await refusal(convert('json', { shape: 'records', sheet: 'constructor' }))).toBe('This workbook has no such sheet')
  })

  it('all of them in one file, each under its name, where the format can hold that', async () => {
    const outputs = await convert('json', { shape: 'records', sheet: 'all' })
    expect(outputs).toHaveLength(1)
    const all = JSON.parse(outputs[0]!.text) as Record<string, unknown[]>
    expect(Object.keys(all)).toEqual(['People', 'Totals'])
    expect(all.Totals).toEqual([{ total: 3 }])
    expect(outputs[0]!.text).not.toContain('Secret')
    const yaml = await convert('yaml', { shape: 'records', sheet: 'all' })
    expect(yaml[0]!.text).toMatch(/^People:\n/)
  })

  it('all of them as a file each, named for the sheet, where the format holds one table', async () => {
    const outputs = await convert('csv', { sheet: 'all' })
    expect(outputs.map((output) => output.name)).toEqual(['budget - People.csv', 'budget - Totals.csv'])
    expect(outputs[1]!.text).toBe('total\r\n3\r\n')
  })

  it('a sheet named to climb out of its folder gives a file with a safe name', async () => {
    const book = await altered({})
    const entries = await readZip(book)
    const workbook = entries.find((entry) => entry.name === 'xl/workbook.xml')!
    workbook.data = new TextEncoder().encode(new TextDecoder().decode(workbook.data).replace('name="Totals"', 'name="../../Totals:x"'))
    const { createDataEngine } = await import('./index')
    const { formatById, registry } = await import('@omsett/registry')
    const outputs = await createDataEngine().convert({
      blob: new Blob([(await writeZip(entries)) as BlobPart]),
      name: 'budget.xlsx',
      from: formatById(registry, 'xlsx')!,
      to: formatById(registry, 'csv')!,
      options: { headerRow: true, sheet: 'all' },
      signal: new AbortController().signal,
      onProgress: () => {},
    } as never)
    for (const output of outputs) expect(output.name).not.toMatch(/[\\/:]|\.\./)
    expect(outputs).toHaveLength(2)
  })
})
