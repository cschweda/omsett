import { readFile } from 'node:fs/promises'
import { formatById, registry } from '@omsett/registry'
import { describe, expect, it } from 'vitest'
import { readZip, writeZip } from '../archive/zip'
import { Refusal } from '../util'
import { MEDIA_TYPE, readDrafter, writeDrafter } from './drafter'
import { readFdx, writeFdx } from './fdx'
import { readFountain, runsOf, writeFountain } from './fountain'
import { createScriptEngine } from './index'

const bytes = async (path: string) => new Uint8Array(await readFile(new URL(`../../../../fixtures/${path}`, import.meta.url)))
const text = async (path: string) => new TextDecoder().decode(await bytes(path))
async function convert(input: Uint8Array | string, from: string, to: string) {
  const [output] = await createScriptEngine().convert({
    blob: new Blob([input as BlobPart]),
    name: `film.${from}`,
    from: formatById(registry, from)!,
    to: formatById(registry, to)!,
    options: {},
    signal: new AbortController().signal,
    onProgress: () => {},
  })
  return new Uint8Array(await output!.blob.arrayBuffer())
}
const refusal = (work: Promise<unknown>) =>
  work.then(
    () => null,
    (error: unknown) => (error instanceof Refusal ? error.message : `not a Refusal: ${String(error)}`),
  )
const shape = (script: { elements: Array<{ kind: string; runs: Array<{ text: string }>; number?: string; dual?: boolean }> }) =>
  script.elements.map((element) => `${element.kind}${element.number ? ` #${element.number}` : ''}${element.dual ? ' ^' : ''}: ${element.runs.map((run) => run.text).join('')}`)

describe('Fountain', () => {
  it('reads a script into what each line is', async () => {
    const script = readFountain(await text('fountain/sample.fountain'))
    expect(script.title).toEqual([
      { key: 'Title', value: '_**OMSETT**_' },
      { key: 'Credit', value: 'Written by' },
      { key: 'Author', value: 'Ada Lovelace' },
      { key: 'Draft date', value: '23 November 2026' },
      { key: 'Contact', value: "12 St James's Square\nLondon" },
    ])
    expect(shape(script)).toEqual([
      'scene #1: INT. KITCHEN - NIGHT',
      'action: A laptop on the table. ADA (30s) drops a file onto the screen. Nothing happens. Then everything does, and fast.\nShe waits.',
      'character: ADA',
      'parenthetical: (to herself)',
      'dialogue: Pick a format.',
      'character: GRACE (V.O.)',
      'dialogue: Nothing leaves your device.\nNot one byte.',
      'character ^: ADA',
      'dialogue: I heard you.',
      'scene: THE SCREEN',
      'centered: THE WORD "DONE"',
      'action: SHE CLOSES THE LAPTOP.',
      'character: McKENNA',
      'dialogue: Is it converted?',
      'lyric: A song, sung low',
      'transition: CUT TO:',
      'scene: EXT. STREET - DAY',
      'action: Café tables. A sign: 字幕.',
      'transition: Burn to white.',
      'page-break: ',
      'scene: EST. HARBOUR - DAWN',
      'action: The end, with a literal *asterisk* and an under_score.',
    ])
  })

  it('reads emphasis, and leaves alone a mark that is only a character', () => {
    expect(runsOf('a *b* **c** ***d*** _e_ f')).toEqual([
      { text: 'a ' },
      { text: 'b', italic: true },
      { text: ' ' },
      { text: 'c', bold: true },
      { text: ' ' },
      { text: 'd', bold: true, italic: true },
      { text: ' ' },
      { text: 'e', underline: true },
      { text: ' f' },
    ])
    expect(runsOf('2 * 3 = 6, and snake_case, and \\*not\\*')).toEqual([{ text: '2 * 3 = 6, and snake_case, and *not*' }])
  })

  it('writes a script that reads back as the same script, and writes it the same again', async () => {
    const script = readFountain(await text('fountain/sample.fountain'))
    const written = writeFountain(script)
    expect(readFountain(written)).toEqual(script)
    expect(writeFountain(readFountain(written))).toBe(written)
  })

  it('leaves out what the writer set aside', async () => {
    const written = writeFountain(readFountain(await text('fountain/sample.fountain')))
    for (const gone of ['SECRET-NOTE', 'SECRET-BONEYARD', 'INT. NOWHERE', 'Act two', 'Where it all goes wrong']) expect(written.includes(gone), gone).toBe(false)
  })

  it('is not slowed by ten thousand marks that open nothing', () => {
    const started = performance.now()
    readFountain(`${'*a _b '.repeat(40_000)}\n\n${'/*'.repeat(40_000)}\n\n${'[['.repeat(40_000)}\n`)
    expect(performance.now() - started).toBeLessThan(3000)
  })
})

describe('Final Draft', () => {
  it('reads a script, with two characters speaking at once and nothing from its notes', async () => {
    const script = await readFdx(await text('fdx/sample.fdx'))
    expect(script.title).toEqual([
      { key: 'Title', value: 'OMSETT' },
      { key: 'Credit', value: 'Written by' },
      { key: 'Author', value: 'Ada Lovelace' },
    ])
    expect(shape(script)).toEqual([
      'scene #1: INT. KITCHEN - NIGHT',
      'action: A laptop on the table. ADA (30s) drops a file onto the screen. Nothing happens. Then everything does, and fast.',
      'character: ADA',
      'parenthetical: (to herself)',
      'dialogue: Pick a format.',
      'character: GRACE (V.O.)',
      'dialogue: Nothing leaves your device.',
      'character ^: ADA',
      'dialogue: I heard you.',
      'action: THE SCREEN',
      'centered: THE WORD "DONE"',
      'character: McKenna',
      'dialogue: Is it converted? Tom & Jerry, 2 < 3.',
      'transition: CUT TO:',
      'page-break: ',
      'scene: EXT. STREET - DAY',
      'action: Café tables. A sign: 字幕.',
      'transition: Burn to white.',
    ])
    expect(JSON.stringify(script).includes('SECRET')).toBe(false)
  })

  it('comes back from Fountain with every element in place', async () => {
    const script = readFountain(await text('fountain/sample.fountain'))
    const back = await readFdx(writeFdx(script))
    // A line break inside an element is a paragraph of its own in Final Draft.
    expect(shape(back).join('\n')).toBe(shape(script).join('\n').replace('fast.\nShe waits.', 'fast.\naction: She waits.').replace('device.\nNot one byte.', 'device.\ndialogue: Not one byte.'))
    expect(back.elements[1]!.runs).toEqual(script.elements[1]!.runs.map((run) => ({ ...run, text: run.text.replace('\nShe waits.', '') })))
  })

  it('writes a file in which nothing typed can become a tag', async () => {
    const hostile = 'INT. ROOM - DAY\n\n</Text></Paragraph><Paragraph Type="Scene Heading"><Text>INJECTED ]]> & "quoted" \u0001\n'
    const fdx = writeFdx(readFountain(hostile))
    const back = await readFdx(fdx)
    expect(shape(back)).toEqual(['scene: INT. ROOM - DAY', 'action: </Text></Paragraph><Paragraph Type="Scene Heading"><Text>INJECTED ]]> & "quoted" '])
  })

  it('refuses what is not a script', async () => {
    const NOT = 'This file is not a valid Final Draft script'
    const sample = await text('fdx/sample.fdx')
    expect(await refusal(readFdx(sample.slice(0, 900)))).toBe(NOT)
    expect(await refusal(readFdx('<people><name>Ada</name></people>'))).toBe(NOT)
    expect(await refusal(readFdx('<FinalDraft></FinalDraft>'))).toBe(NOT)
    expect(await refusal(readFdx(`<!DOCTYPE x [<!ENTITY a "aaaa">]>${sample}`))).toBe(NOT)
    expect(await refusal(readFdx('<FinalDraft><Content><Paragraph Type="Action"><Text></Text></Paragraph></Content></FinalDraft>'))).toBe('This script has nothing in it to convert')
  })
})

describe('the Drafter package', () => {
  it('gives up its script exactly as it was written, and none of the papers beside it', async () => {
    const fountain = await readDrafter(await bytes('drafter/sample.drafter'))
    expect(fountain).toBe(await text('fountain/sample.fountain'))
    const fdx = new TextDecoder().decode(await convert(await bytes('drafter/sample.drafter'), 'drafter', 'fdx'))
    for (const gone of ['SECRET-EARLIER-DRAFT', 'SECRET-CUT-MATERIAL', 'SECRET-WORKBOOK', 'SECRET-NOTE', 'SECRET-BONEYARD']) expect(fdx.includes(gone), gone).toBe(false)
    expect(fdx).toContain('<Paragraph Number="1" Type="Scene Heading"><Text>INT. KITCHEN - NIGHT</Text></Paragraph>')
  })

  it('is written as the specification asks', async () => {
    const source = await text('fountain/sample.fountain')
    const now = new Date('2026-11-23T12:00:00.500Z')
    const packed = await writeDrafter(source, 'My Film.fountain', { title: 'OMSETT', author: 'Ada Lovelace' }, now)
    // The first entry is "mimetype", stored as it is, with nothing between its name and its bytes.
    const head = new TextDecoder('latin1').decode(packed.subarray(0, 38 + MEDIA_TYPE.length))
    expect(head.slice(30)).toBe(`mimetype${MEDIA_TYPE}`)
    expect([packed[8], packed[9], packed[28], packed[29]]).toEqual([0, 0, 0, 0])
    const entries = await readZip(packed)
    expect(entries.map((entry) => entry.name)).toEqual(['mimetype', 'drafter.json', 'My Film.fountain'])
    const manifest = JSON.parse(new TextDecoder().decode(entries[1]!.data)) as Record<string, unknown>
    expect(manifest).toMatchObject({
      format: 'drafter-package',
      version: '0.1',
      generator: 'Omsett',
      created: '2026-11-23T12:00:00Z',
      title: 'OMSETT',
      author: 'Ada Lovelace',
      kind: 'screenplay',
      main: 'My Film.fountain',
    })
    // The script goes in as it was written, and the manifest's hash of it is true.
    expect(new TextDecoder().decode(entries[2]!.data)).toBe(source)
    const digest = Buffer.from(await crypto.subtle.digest('SHA-256', entries[2]!.data as BufferSource)).toString('hex')
    expect((manifest.files as Record<string, string>)['My Film.fountain']).toBe(`sha256:${digest}`)
    expect(await readDrafter(packed)).toBe(source)
  })

  it('refuses a package that is not one, or that points outside itself', async () => {
    const NOT = 'This file is not a valid Drafter package'
    const sample = await readZip(await bytes('drafter/sample.drafter'))
    const withManifest = async (change: (manifest: Record<string, unknown>) => unknown) => {
      const entries = sample.map((entry) => ({ ...entry }))
      const manifest = JSON.parse(new TextDecoder().decode(entries[1]!.data)) as Record<string, unknown>
      const changed = change(manifest)
      entries[1]!.data = new TextEncoder().encode(typeof changed === 'string' ? changed : JSON.stringify(manifest))
      return writeZip(entries)
    }
    expect(await refusal(readDrafter(new TextEncoder().encode('not a package')))).toBe(NOT)
    expect(await refusal(readDrafter(await bytes('zip/sample.zip')))).toBe(NOT)
    expect(await refusal(readDrafter(await writeZip([...sample.slice(1), sample[0]!])))).toBe(NOT)
    expect(await refusal(readDrafter(await withManifest(() => '{not json')))).toBe(NOT)
    expect(await refusal(readDrafter(await withManifest(() => '[]')))).toBe(NOT)
    expect(await refusal(readDrafter(await withManifest((m) => void (m.format = 'something-else'))))).toBe(NOT)
    for (const main of ['../../etc/passwd', '/etc/passwd', 'Missing.fountain', './Omsett.fountain', 'omsett.fountain', 42]) {
      expect(await refusal(readDrafter(await withManifest((m) => void (m.main = main)))), String(main)).toBe(NOT)
    }
    expect(await refusal(readDrafter(await withManifest((m) => void (m.main = 'cuts.md'))))).toBe(
      'This Drafter package holds prose, not a script. Its text is the Markdown file inside it',
    )
  })
})
