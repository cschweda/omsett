// Fountain: a screenplay written as plain text, where what a line is (a scene heading, a
// character's name, a line of dialogue) is told from how it is written. Reading it gives the
// script as a list of elements; writing it starts from that list.

export interface Run {
  text: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
}

export type Kind = 'scene' | 'action' | 'character' | 'parenthetical' | 'dialogue' | 'transition' | 'centered' | 'lyric' | 'page-break'

export interface Element {
  kind: Kind
  runs: Run[]
  /** A scene's number, where the script gives one: "12", "12A". */
  number?: string
  /** A character who speaks at the same time as the one before. */
  dual?: boolean
}

export interface Script {
  /** The title page: "Title", "Author", "Draft date" and so on, in the order written. */
  title: Array<{ key: string; value: string }>
  elements: Element[]
}

const SCENE = /^(?:INT|EXT|EST|INT\.?\/EXT|I\/E)[. ]/i
const plain = (runs: Run[]) => runs.map((run) => run.text).join('')

/** "*italic*", "**bold**", "***both***" and "_underline_" → runs. A backslash makes a mark a character. */
export function runsOf(text: string): Run[] {
  const runs: Run[] = []
  let bold = false
  let italic = false
  let underline = false
  let current = ''
  // Where each mark last appears, found once: a line of ten thousand marks that open nothing
  // is then ten thousand quick checks, not ten thousand searches to the end of the line.
  const last: Record<string, number> = { '*': text.lastIndexOf('*'), '**': text.lastIndexOf('**'), '***': text.lastIndexOf('***'), _: text.lastIndexOf('_') }
  const flush = () => {
    if (current !== '') runs.push({ text: current, ...(bold && { bold }), ...(italic && { italic }), ...(underline && { underline }) })
    current = ''
  }
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!
    if (char === '\\' && (text[i + 1] === '*' || text[i + 1] === '_')) {
      current += text[++i]
      continue
    }
    if (char === '*' || char === '_') {
      let length = 1
      while (char === '*' && text[i + length] === '*' && length < 3) length++
      const mark = char.repeat(length)
      // A mark opens only if it is closed further on, and is not followed by a space; it
      // closes only if it is open. Anything else is the character itself.
      const open = char === '_' ? underline : length === 1 ? italic : length === 2 ? bold : bold && italic
      const closes = open && text[i - 1] !== ' '
      const opens = !open && text[i + length] !== undefined && text[i + length] !== ' ' && last[mark]! >= i + length
      if (closes || opens) {
        flush()
        if (char === '_') underline = !underline
        else {
          if (length !== 2) italic = !italic
          if (length !== 1) bold = !bold
        }
        i += length - 1
        continue
      }
    }
    current += char
  }
  flush()
  return runs
}

/** Everything between the marks, with a loop so that a thousand unclosed ones cost nothing. */
function without(text: string, open: string, close: string): string {
  let out = ''
  let from = 0
  for (;;) {
    const start = text.indexOf(open, from)
    if (start < 0) return out + text.slice(from)
    const end = text.indexOf(close, start + open.length)
    if (end < 0) return out + text.slice(from)
    out += text.slice(from, start)
    from = end + close.length
  }
}

export function readFountain(source: string): Script {
  // What the writer set aside (/* … */) and notes to self ([[ … ]]) are not the script.
  // A byte-order mark at the very start is not part of the script.
  const unmarked = source.codePointAt(0) === 0xFEFF ? source.slice(1) : source
  const text = without(without(unmarked.replace(/\r\n|\r/g, '\n'), '/*', '*/'), '[[', ']]')
  const lines = text.split('\n')
  const title: Script['title'] = []
  let at = 0

  // A title page is "Key: value" lines at the very top, up to the first blank line.
  if (/^[A-Z][A-Z ]{0,30}:/i.test(lines[0] ?? '') && !SCENE.test(lines[0]!)) {
    for (; at < lines.length && lines[at]!.trim() !== ''; at++) {
      const pair = /^([A-Z][A-Z ]{0,30}):(.*)$/i.exec(lines[at]!)
      if (pair) title.push({ key: pair[1]!.trim(), value: pair[2]!.trim() })
      // An indented line under a key is more of that key's value.
      else if (title.length > 0) title.at(-1)!.value = [title.at(-1)!.value, lines[at]!.trim()].filter(Boolean).join('\n')
    }
  }

  const elements: Element[] = []
  const blank = (index: number) => index < 0 || index >= lines.length || lines[index]!.trim() === ''
  while (at < lines.length) {
    const raw = lines[at]!
    const line = raw.trim()
    if (line === '') {
      at++
      continue
    }
    const alone = blank(at - 1) && blank(at + 1)
    // Three or more equals signs: a new page.
    if (/^={3,}$/.test(line)) elements.push({ kind: 'page-break', runs: [] })
    // Headings of the outline (#) and one-line summaries (=) organise the writing; they are not printed.
    else if (/^#{1,6}\s/.test(line) || /^=(?!=)/.test(line)) {
      // left out
    } else if (/^>.*<$/.test(line)) elements.push({ kind: 'centered', runs: runsOf(line.slice(1, -1).trim()) })
    else if (line.startsWith('>')) elements.push({ kind: 'transition', runs: runsOf(line.slice(1).trim()) })
    else if (line.startsWith('~')) elements.push({ kind: 'lyric', runs: runsOf(line.slice(1).trim()) })
    else if ((line.startsWith('.') && /^\.[^.]/.test(line)) || (alone && SCENE.test(line))) {
      const heading = line.startsWith('.') && !SCENE.test(line) ? line.slice(1) : line.replace(/^\.(?=\S)/, '')
      // A scene's number is written after its heading, between two hash signs.
      const numbered = /#([\w.-]{1,12})#$/.exec(heading)
      const words = numbered ? heading.slice(0, numbered.index) : heading
      elements.push({ kind: 'scene', runs: [{ text: words.trim() }], ...(numbered && { number: numbered[1]! }) })
    } else if (alone && !line.startsWith('!') && /[A-Z]/.test(line) && line === line.toUpperCase() && line.endsWith('TO:')) {
      elements.push({ kind: 'transition', runs: runsOf(line) })
    } else if (isCharacter(line, at)) {
      const dual = line.endsWith('^')
      const name = line.replace(/\^$/, '').replace(/^@/, '').trim()
      elements.push({ kind: 'character', runs: [{ text: name }], ...(dual && { dual }) })
      // What follows, up to a blank line, is what they say, with any directions in brackets.
      let speech: string[] = []
      const say = () => {
        if (speech.length > 0) elements.push({ kind: 'dialogue', runs: runsOf(speech.join('\n')) })
        speech = []
      }
      for (at++; at < lines.length && lines[at]!.trim() !== ''; at++) {
        const spoken = lines[at]!.trim()
        if (/^\(.*\)$/.test(spoken)) {
          say()
          elements.push({ kind: 'parenthetical', runs: [{ text: spoken }] })
        } else if (spoken.startsWith('~')) {
          say()
          elements.push({ kind: 'lyric', runs: runsOf(spoken.slice(1).trim()) })
        } else speech.push(spoken)
      }
      say()
      continue
    } else {
      // Everything else is action. Its line breaks are the writer's and are kept.
      const block: string[] = []
      for (; at < lines.length && lines[at]!.trim() !== ''; at++) {
        const part = lines[at]!
        // A line that starts something of its own ends the action above it.
        if (block.length > 0 && /^(?:>|~|={3,}$|#{1,6}\s|\.[^.])/.test(part.trim())) break
        block.push(part.replace(/^!/, '').replace(/\s+$/, ''))
      }
      elements.push({ kind: 'action', runs: runsOf(block.join('\n')) })
      continue
    }
    at++
  }
  return { title, elements }

  /** A name in capitals with a blank line above and something to say below; or anything after "@". */
  function isCharacter(line: string, index: number): boolean {
    if (!blank(index - 1) || blank(index + 1)) return false
    if (line.startsWith('@')) return line.length > 1
    if (line.startsWith('!')) return false
    // "(V.O.)" and "(cont'd)" after the name may be in any case.
    const name = line.replace(/\^$/, '').replace(/\([^)]*\)/g, '').trim()
    return /[A-Z]/.test(name) && name === name.toUpperCase() && !/^\d+$/.test(name)
  }
}

/** Runs → text with its marks, and with any mark that is only a character written as one. */
function marked(runs: Run[]): string {
  return runs
    .map((run) => {
      const text = run.text.replace(/([*_])/g, '\\$1')
      if (text.trim() === '') return text
      // Marks hug the words: the space around them stays outside.
      const words = text.trim()
      const before = text.slice(0, text.length - text.trimStart().length)
      const after = text.slice(text.trimEnd().length)
      const star = run.bold && run.italic ? '***' : run.bold ? '**' : run.italic ? '*' : ''
      const line = run.underline ? '_' : ''
      return `${before}${line}${star}${words}${star}${line}${after}`
    })
    .join('')
}

export function writeFountain(script: Script): string {
  const out: string[] = []
  if (script.title.length > 0) {
    for (const { key, value } of script.title) {
      const lines = value.split('\n')
      out.push(lines.length === 1 ? `${key}: ${value}` : `${key}:\n${lines.map((line) => `    ${line}`).join('\n')}`)
    }
    out.push('')
  }
  let speaking = false
  for (const element of script.elements) {
    const text = plain(element.runs)
    // A lyric is sung by the character above it only where it comes straight after their name
    // or a direction; anywhere else it stands by itself.
    const inSpeech: boolean = element.kind === 'parenthetical' || element.kind === 'dialogue' || (element.kind === 'lyric' && speaking)
    // Speech follows its speaker with no blank line; everything else stands apart.
    if (!inSpeech) out.push('')
    speaking = element.kind === 'character' || element.kind === 'parenthetical'
    switch (element.kind) {
      case 'scene': {
        const number = element.number ? ` #${element.number}#` : ''
        out.push(`${SCENE.test(text) ? '' : '.'}${text}${number}`)
        break
      }
      case 'character': {
        const natural = /[A-Z]/.test(text) && text.replace(/\([^)]*\)/g, '') === text.replace(/\([^)]*\)/g, '').toUpperCase() && !text.startsWith('!')
        out.push(`${natural ? '' : '@'}${text}${element.dual ? ' ^' : ''}`)
        break
      }
      case 'parenthetical':
        out.push(/^\(.*\)$/.test(text) ? text : `(${text})`)
        break
      case 'dialogue':
        out.push(marked(element.runs))
        break
      case 'transition':
        out.push(text === text.toUpperCase() && text.endsWith('TO:') ? text : `> ${marked(element.runs)}`)
        break
      case 'centered':
        out.push(`> ${marked(element.runs)} <`)
        break
      case 'lyric':
        out.push(`~${marked(element.runs)}`)
        break
      case 'page-break':
        out.push('===')
        break
      case 'action': {
        const written = marked(element.runs)
        // Action that would be taken for something else is marked as action.
        const first = written.split('\n')[0]!
        const mistaken = SCENE.test(first) || (/[A-Z]/.test(first) && first === first.toUpperCase()) || /^[.>~@#=]/.test(first)
        out.push(`${mistaken ? '!' : ''}${written}`)
        break
      }
    }
  }
  return `${out.join('\n').replace(/^\n+/, '').replace(/\n{3,}/g, '\n\n')}\n`
}
