import { text as escapeXml } from '../data/xml'
import { DEFAULT_FPS, type Cue } from './read'

// Cues → subtitle files. Each writer makes the plainest file its format allows: the words and
// their times, in the layout every player expects.

const pad = (value: number, width = 2) => String(value).padStart(width, '0')

/** Hours, minutes, seconds and the thousandths left over. */
function parts(ms: number) {
  const whole = Math.max(0, Math.round(ms))
  return {
    h: Math.floor(whole / 3_600_000),
    m: Math.floor(whole / 60_000) % 60,
    s: Math.floor(whole / 1000) % 60,
    ms: whole % 1000,
  }
}

const stamp = (ms: number, separator: string, hours = 2) => {
  const t = parts(ms)
  return `${pad(t.h, hours)}:${pad(t.m)}:${pad(t.s)}${separator}${pad(t.ms, 3)}`
}
/** To the hundredth of a second, as ASS and LRC count: rounded first, so 59.996 s carries. */
const hundredths = (ms: number) => parts(Math.round(ms / 10) * 10)

const escapeMarkup = (value: string) =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

const writeSrt = (cues: Cue[]) =>
  cues.map((cue, i) => `${i + 1}\n${stamp(cue.start, ',')} --> ${stamp(cue.end, ',')}\n${cue.text}\n`).join('\n')

const writeVtt = (cues: Cue[]) =>
  `WEBVTT\n\n${cues
    .map((cue) => `${stamp(cue.start, '.')} --> ${stamp(cue.end, '.')}\n${escapeMarkup(cue.text)}\n`)
    .join('\n')}`

const writeSbv = (cues: Cue[]) =>
  cues.map((cue) => `${stamp(cue.start, '.', 1)},${stamp(cue.end, '.', 1)}\n${cue.text}\n`).join('\n')

const ASS_HEAD = `[Script Info]
ScriptType: v4.00+
PlayResX: 384
PlayResY: 288
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,16,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,1,0,2,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`
const SSA_HEAD = `[Script Info]
ScriptType: v4.00
PlayResX: 384
PlayResY: 288

[V4 Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, TertiaryColour, BackColour, Bold, Italic, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, AlphaLevel, Encoding
Style: Default,Arial,16,16777215,255,0,0,0,0,1,1,0,2,10,10,10,0,1

[Events]
Format: Marked, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`

function writeAss(cues: Cue[], old: boolean): string {
  const time = (ms: number) => {
    const t = hundredths(ms)
    return `${t.h}:${pad(t.m)}:${pad(t.s)}.${pad(t.ms / 10)}`
  }
  // A brace opens an instruction, so one that is only a brace is written with a backslash.
  const words = (value: string) => value.replaceAll('{', '\\{').replaceAll('}', '\\}').replaceAll('\n', '\\N')
  const lines = cues.map(
    (cue) =>
      `Dialogue: ${old ? 'Marked=0' : '0'},${time(cue.start)},${time(cue.end)},Default,,0,0,0,,${words(cue.text)}`,
  )
  return `${old ? SSA_HEAD : ASS_HEAD}${lines.join('\n')}\n`
}

function writeLrc(cues: Cue[]): string {
  const time = (ms: number) => {
    const t = hundredths(ms)
    return `[${pad(t.h * 60 + t.m)}:${pad(t.s)}.${pad(t.ms / 10)}]`
  }
  const lines: string[] = []
  cues.forEach((cue, i) => {
    // Words that begin with a bracket would read as another time, or as a title. A space
    // before them keeps them words.
    const words = cue.text.replaceAll('\n', ' ')
    lines.push(`${time(cue.start)}${words.startsWith('[') ? ' ' : ''}${words}`)
    // An empty line is how LRC says the words have gone, where the next line does not follow on.
    const next = cues[i + 1]
    if (!next || time(next.start) !== time(cue.end)) lines.push(time(cue.end))
  })
  return `${lines.join('\n')}\n`
}

function writeMicroDvd(cues: Cue[]): string {
  const frame = (ms: number) => Math.round((ms / 1000) * DEFAULT_FPS)
  // A bar is this format's line break, so a bar in the words cannot stay one.
  const words = (value: string) => value.replaceAll('|', '/').replaceAll('\n', '|')
  const lines = cues.map((cue) => `{${frame(cue.start)}}{${frame(cue.end)}}${words(cue.text)}`)
  return `{1}{1}${DEFAULT_FPS}\n${lines.join('\n')}\n`
}

function writeSami(cues: Cue[]): string {
  const lines = [
    '<SAMI>',
    '<HEAD>',
    '<STYLE TYPE="text/css">',
    '<!--',
    'P { font-family: Arial; font-size: 14pt; text-align: center; }',
    '.SUBCC { Name: Subtitles; lang: und; SAMIType: CC; }',
    '-->',
    '</STYLE>',
    '</HEAD>',
    '<BODY>',
  ]
  cues.forEach((cue, i) => {
    lines.push(`<SYNC Start=${Math.round(cue.start)}><P Class=SUBCC>${escapeMarkup(cue.text).replaceAll('\n', '<br>')}`)
    const next = cues[i + 1]
    if (!next || Math.round(next.start) !== Math.round(cue.end)) {
      lines.push(`<SYNC Start=${Math.round(cue.end)}><P Class=SUBCC>&nbsp;`)
    }
  })
  lines.push('</BODY>', '</SAMI>')
  return `${lines.join('\n')}\n`
}

function writeTtml(cues: Cue[]): string {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<tt xmlns="http://www.w3.org/ns/ttml" xml:lang="und">',
    '  <body>',
    '    <div>',
    ...cues.map(
      (cue) =>
        `      <p begin="${stamp(cue.start, '.')}" end="${stamp(cue.end, '.')}">${escapeXml(cue.text).replaceAll('\n', '<br/>')}</p>`,
    ),
    '    </div>',
    '  </body>',
    '</tt>',
  ]
  return `${lines.join('\n')}\n`
}

export function writeCues(format: string, cues: Cue[]): string {
  switch (format) {
    case 'srt':
      return writeSrt(cues)
    case 'vtt':
      return writeVtt(cues)
    case 'sbv':
      return writeSbv(cues)
    case 'ass':
      return writeAss(cues, false)
    case 'ssa':
      return writeAss(cues, true)
    case 'lrc':
      return writeLrc(cues)
    case 'microdvd':
      return writeMicroDvd(cues)
    case 'smi':
      return writeSami(cues)
    case 'ttml':
      return writeTtml(cues)
  }
  throw new Error(`The subtitle engine does not write ${format}`)
}
