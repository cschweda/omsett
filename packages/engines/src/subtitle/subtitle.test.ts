import { formatById, registry } from '@omsett/registry'
import { describe, expect, it } from 'vitest'
import { Refusal } from '../util'
import { createSubtitleEngine } from './index'
import { readCues } from './read'
import { writeCues } from './write'

const FORMATS = ['srt', 'vtt', 'ass', 'ssa', 'ttml', 'lrc', 'sbv', 'smi', 'microdvd']
const CUES = [
  { start: 1000, end: 4000, text: 'Drop a file.' },
  { start: 4500, end: 7250, text: 'Pick a format.\nNothing leaves your device.' },
  { start: 3_723_000, end: 3_725_500, text: 'Tom & Jerry: 2 < 3 > 1, {braces}' },
]

async function convert(text: string, from: string, to: string) {
  const [output] = await createSubtitleEngine().convert({
    blob: new Blob([text]),
    name: `film.${from}`,
    from: formatById(registry, from)!,
    to: formatById(registry, to)!,
    options: {},
    signal: new AbortController().signal,
    onProgress: () => {},
  })
  return output!.blob.text()
}

describe('subtitle engine', () => {
  for (const format of FORMATS) {
    it(`reads back what it writes as ${format}`, async () => {
      const back = await readCues(format, writeCues(format, CUES))
      const expected = CUES.map((cue) => ({
        ...cue,
        // LRC holds one line per subtitle, and MicroDVD spells a line break with a bar.
        text: format === 'lrc' ? cue.text.replace('\n', ' ') : cue.text,
      }))
      expect(back.map((cue) => cue.text)).toEqual(expected.map((cue) => cue.text))
      // MicroDVD counts frames: a time comes back to within one frame of where it was.
      const slack = format === 'microdvd' ? 42 : 0
      back.forEach((cue, i) => {
        expect(Math.abs(cue.start - CUES[i]!.start), 'start').toBeLessThanOrEqual(slack)
        expect(Math.abs(cue.end - CUES[i]!.end), 'end').toBeLessThanOrEqual(slack)
      })
    })
  }

  it('writes SRT as players expect it', () => {
    expect(writeCues('srt', CUES.slice(0, 2))).toBe(
      '1\n00:00:01,000 --> 00:00:04,000\nDrop a file.\n\n2\n00:00:04,500 --> 00:00:07,250\nPick a format.\nNothing leaves your device.\n',
    )
  })

  it('keeps the words and drops how they looked', async () => {
    const srt = '1\n00:00:01,000 --> 00:00:02,000\n<font color="red"><b>{\\an8}Stop</b></font> <i>now</i>\n'
    expect(await convert(srt, 'srt', 'vtt')).toBe('WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nStop now\n')
  })

  it('leaves a comparison alone: "a < b" is not a tag', async () => {
    const cues = await readCues('srt', '1\n00:00:01,000 --> 00:00:02,000\nif a < b then b > a\n')
    expect(cues[0]!.text).toBe('if a < b then b > a')
  })

  it('rejoins a subtitle that a blank line split in two', async () => {
    const cues = await readCues('srt', '1\n00:00:01,000 --> 00:00:02,000\nfirst\n\nsecond\n\n2\n00:00:03,000 --> 00:00:04,000\nthird\n')
    expect(cues.map((cue) => cue.text)).toEqual(['first\nsecond', 'third'])
  })

  it('reads an entity once, never twice', async () => {
    const cues = await readCues('vtt', 'WEBVTT\n\n00:01.000 --> 00:02.000\n&amp;lt;b&amp;gt; &#x41;&#66; &#xD800; &bogus;\n')
    expect(cues[0]!.text).toBe('&lt;b&gt; AB  &bogus;')
  })

  it('skips drawings and comments in ASS, and keeps commas in the words', async () => {
    const ass = [
      '[Script Info]',
      '[Events]',
      'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
      'Comment: 0,0:00:00.00,0:00:01.00,Default,,0,0,0,,not shown',
      'Dialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,{\\p1}m 0 0 l 1 1{\\p0}after',
      'Dialogue: 0,0:00:03.00,0:00:04.00,Default,,0,0,0,,one, two\\Nthree \\{kept\\}',
    ].join('\n')
    expect((await readCues('ass', ass)).map((cue) => cue.text)).toEqual(['after', 'one, two\nthree {kept}'])
  })

  it('puts ASS lines in the order they are shown', async () => {
    const ass = '[Script Info]\n[Events]\nDialogue: 0,0:00:05.00,0:00:06.00,D,,0,0,0,,second\nDialogue: 0,0:00:01.00,0:00:02.00,D,,0,0,0,,first\n'
    expect((await readCues('ass', ass)).map((cue) => cue.text)).toEqual(['first', 'second'])
  })

  it('ends each lyric where the next begins, and repeats a line that has several times', async () => {
    const cues = await readCues('lrc', '[ti:x]\n[00:10.00][00:30.00]chorus\n[00:20.00]verse\n[00:25.00]\n')
    expect(cues).toEqual([
      { start: 10_000, end: 20_000, text: 'chorus' },
      { start: 20_000, end: 25_000, text: 'verse' },
      { start: 30_000, end: 35_000, text: 'chorus' },
    ])
  })

  it('reads the frame rate a MicroDVD file states', async () => {
    const cues = await readCues('microdvd', '{1}{1}25\n{25}{50}one|two\n{100}{}three\n{200}{250}four\n')
    expect(cues).toEqual([
      { start: 1000, end: 2000, text: 'one\ntwo' },
      { start: 4000, end: 8000, text: 'three' },
      { start: 8000, end: 10_000, text: 'four' },
    ])
  })

  it('reads the ways TTML writes a time', async () => {
    const ttml = `<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttp="http://www.w3.org/ns/ttml#parameter" ttp:frameRate="25">
      <body><div>
        <p begin="00:00:01:05" end="2s">frames</p>
        <p begin="3000ms" dur="0.5s">offsets</p>
        <p begin="100f" end="0.1m">more <span>nested <span>words</span></span><br/>here</p>
        <p>no time, not a subtitle</p>
      </div></body></tt>`
    expect(await readCues('ttml', ttml)).toEqual([
      { start: 1200, end: 2000, text: 'frames' },
      { start: 3000, end: 3500, text: 'offsets' },
      { start: 4000, end: 6000, text: 'more nested words\nhere' },
    ])
  })

  it('takes the first language in a SAMI file', async () => {
    const smi = '<SAMI><BODY><SYNC Start=1000><P Class=EN>Hello<br>there<P Class=FR>Bonjour<SYNC Start=2000><P Class=EN>&nbsp;</BODY></SAMI>'
    expect(await readCues('smi', smi)).toEqual([{ start: 1000, end: 2000, text: 'Hello\nthere' }])
  })

  const refused: Array<[string, string, string, string]> = [
    ['a time that is not a time', 'srt', '1\n00:00:01,000 --> 00:61:02,000\nx\n', 'This file is not valid SRT'],
    ['an end before its start', 'srt', '1\n00:00:05,000 --> 00:00:01,000\nx\n', 'A subtitle in this file ends before it starts'],
    ['no subtitles at all', 'vtt', 'WEBVTT\n\nNOTE nothing here\n', 'This file has no subtitles in it'],
    ['words before any time', 'srt', 'hello\n\n1\n00:00:01,000 --> 00:00:02,000\nx\n', 'This file is not valid SRT'],
    ['no heading', 'vtt', '00:01.000 --> 00:02.000\nx\n', 'This file is not valid WebVTT'],
    ['no events', 'ass', '[Script Info]\nTitle: x\n', 'This file is not valid ASS'],
    ['a line cut short', 'ass', '[Script Info]\n[Events]\nDialogue: 0,0:00:01.00,0:00:02', 'This file is not valid ASS'],
    ['words where a time should be', 'lrc', '[00:01.00]one\nnot a lyric line\n', 'This file is not valid LRC'],
    ['a frame rate of nothing', 'microdvd', '{1}{1}0\n{1}{2}x\n', 'This file is not valid MicroDVD'],
    ['a tag never closed', 'ttml', '<tt><body><p begin="1s" end="2s">x</body></tt>', 'This file is not valid TTML'],
    ['a time in no known form', 'ttml', '<tt><body><p begin="soon" end="2s">x</p></body></tt>', 'This file is not valid TTML'],
    ['no syncs', 'smi', '<SAMI><BODY></BODY></SAMI>', 'This file has no subtitles in it'],
  ]
  for (const [what, format, text, message] of refused) {
    it(`refuses ${format} with ${what}`, async () => {
      const failure = await convert(text, format, format === 'srt' ? 'vtt' : 'srt').then(
        () => null,
        (error: unknown) => error,
      )
      expect(failure).toBeInstanceOf(Refusal)
      expect((failure as Error).message).toBe(message)
    })
  }

  it('refuses lyrics whose timestamps multiply one line into millions', async () => {
    const line = `${'[00:01.00]'.repeat(250_000)}${'la '.repeat(100)}`
    await expect(convert(line, 'lrc', 'srt')).rejects.toThrow('This file holds more subtitles than Omsett will convert')
  })

  it('is not slowed by a line of braces that never close', async () => {
    const ass = `[Script Info]\n[Events]\nDialogue: 0,0:00:01.00,0:00:02.00,D,,0,0,0,,${'{'.repeat(400_000)}`
    const started = performance.now()
    await convert(ass, 'ass', 'srt')
    expect(performance.now() - started).toBeLessThan(5000)
  })

  it('refuses text that is not UTF-8', async () => {
    const bytes = new Uint8Array([...new TextEncoder().encode('1\n00:00:01,000 --> 00:00:02,000\ncaf'), 0xE9, 0x0A])
    const engine = createSubtitleEngine()
    await expect(
      engine.convert({
        blob: new Blob([bytes]),
        name: 'a.srt',
        from: formatById(registry, 'srt')!,
        to: formatById(registry, 'vtt')!,
        options: {},
        signal: new AbortController().signal,
        onProgress: () => {},
      }),
    ).rejects.toThrow('This file is not text in UTF-8')
  })
})
