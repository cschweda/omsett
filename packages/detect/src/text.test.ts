import { describe, expect, it } from 'vitest'
import { sniffText } from './text'

const sniff = (text: string, name?: string, complete = true) =>
  sniffText(new TextEncoder().encode(text), complete, name)?.ext ?? null

describe('telling text formats apart', () => {
  it('knows JSON and XML from their first characters, whatever the file is called', () => {
    expect(sniff('{"a": 1}')).toBe('json')
    expect(sniff('  [\n  1,\n  2\n]\n', 'list.yaml')).toBe('json')
    expect(sniff('<?xml version="1.0"?><a/>', 'feed.txt')).toBe('xml')
    expect(sniff('<!-- note -->\n<a><b/></a>')).toBe('xml')
    expect(sniff('<a:b xmlns:a="u"/>', 'x.csv')).toBe('xml')
  })

  it('does not take a bracket for JSON when the whole file is there to read', () => {
    expect(sniff('[x] buy milk\n[ ] post letter\n', 'todo.txt')).toBeNull()
    expect(sniff('{not json at all}')).toBeNull()
    // Named as JSON, a broken file is JSON that is broken, and is reported as that.
    expect(sniff('{"a": ', 'cut-short.json')).toBe('json')
    // A sample of a longer file cannot be judged this way.
    expect(sniff('[\n{"a": 1},\n{"a": ', undefined, false)).toBe('json')
  })

  it('does not take a web page for XML', () => {
    expect(sniff('<!DOCTYPE html>\n<html></html>')).toBeNull()
    expect(sniff('<html lang="en"><body/></html>', 'page.xml')).toBeNull()
    expect(sniff('< not a tag')).toBeNull()
  })

  it('knows JSON Lines by more than one whole value, one to a line', () => {
    expect(sniff('{"a":1}\n{"a":2}\n')).toBe('jsonl')
    expect(sniff('[1,2]\n[3,4]\n')).toBe('jsonl')
    // One line is JSON, unless the name says it is a list of one.
    expect(sniff('{"a":1}\n')).toBe('json')
    expect(sniff('{"a":1}\n', 'log.ndjson')).toBe('jsonl')
    // Ordinary JSON spread over lines is not.
    expect(sniff('{\n"a":1\n}\n', 'log.jsonl')).toBe('json')
  })

  it('knows a TOML section heading from a JSON list', () => {
    expect(sniff('[package]\nname = "x"\n')).toBe('toml')
    expect(sniff('[[person]]\nid = 1\n')).toBe('toml')
    expect(sniff('["package"]\n')).toBe('json')
    expect(sniff('[[1, 2]]\n')).toBe('json')
  })

  it('tells TOML, YAML, TSV and CSV from how the first lines read, when there is no name', () => {
    expect(sniff('# settings\ntitle = "x"\n')).toBe('toml')
    expect(sniff('a.b = 1\n')).toBe('toml')
    expect(sniff('# people\n- id: 1\n  name: Ada\n')).toBe('yaml')
    expect(sniff('---\nname: Ada\n')).toBe('yaml')
    expect(sniff('people:\n  - Ada\n')).toBe('yaml')
    expect(sniff('"quoted key": 1\n')).toBe('yaml')
    expect(sniff('id\tname\n1\tAda\n')).toBe('tsv')
    expect(sniff('id,name\n1,Ada\n')).toBe('csv')
    expect(sniff('id;name\n1;Ada\n')).toBe('csv')
    expect(sniff('id,note\n1,"a, b"\n')).toBe('csv')
  })

  it('lets a name settle which kind of text it is, where the text cannot', () => {
    expect(sniff('only one column\nAda\n', 'names.csv')).toBe('csv')
    expect(sniff('just some words', 'notes.yml')).toBe('yaml')
    expect(sniff('id,name\n1,Ada\n', 'table.tsv')).toBe('tsv')
    expect(sniff('# nothing set yet\n', 'empty.toml')).toBe('toml')
    // A name does not make TOML of something that does not read as TOML.
    expect(sniff('id,name\n1,Ada\n', 'table.toml')).toBeNull()
  })

  it('offers nothing when the name says the text is something else', () => {
    expect(sniff('id,name\n1,Ada\n', 'table.txt')).toBeNull()
    expect(sniff('title = "x"\n', 'readme.md')).toBeNull()
    expect(sniff('name: Ada\n', 'photo.png')).toBeNull()
    // No ending at all is no claim.
    expect(sniff('name: Ada\n', 'Brewfile')).toBe('yaml')
  })

  it('offers nothing for text that reads as none of them', () => {
    expect(sniff('Dear Ada,\nThank you for the notes.\n')).toBeNull()
    expect(sniff('one line, with a comma')).toBeNull()
    expect(sniff('')).toBeNull()
    expect(sniff('   \n\n')).toBeNull()
  })

  it('is not fooled by bytes that are not text', () => {
    expect(sniffText(new Uint8Array([0x7B, 0x22, 0x00, 0x22, 0x7D]), true)).toBeNull()
    expect(sniffText(new Uint8Array([0x61, 0x2C, 0x62, 0x0A, 0xFF, 0x2C, 0x31, 0x0A]), true, 'x.csv')).toBeNull()
    expect(sniffText(new TextEncoder().encode('{"a":1}').slice(0), true)?.ext).toBe('json')
  })

  it('reads past a byte-order mark, and does not trust the last line of a sample cut short', () => {
    expect(sniff('\uFEFF{"a":1}')).toBe('json')
    // Complete, these two lines are JSON Lines. Cut short, the second proves nothing.
    expect(sniff('{"a":1}\n{"a":', undefined, false)).toBe('json')
    // A character cut in half by the end of the sample is not an error.
    const cut = new TextEncoder().encode('id,name\n1,Zoë\n2,Renée\n').slice(0, 21)
    expect(sniffText(cut, false)?.ext).toBe('csv')
  })

  it('knows subtitles by how they begin, whatever the file is called', () => {
    const time = '00:00:01,000 --> 00:00:04,000'
    expect(sniff(`1\n${time}\nHello\n`)).toBe('srt')
    expect(sniff(`${time}\nHello\n`, 'notes.txt')).toBe('srt')
    expect(sniff('WEBVTT\n\n00:01.000 --> 00:04.000\nHello\n', 'x.csv')).toBe('vtt')
    expect(sniff('WEBVTT - a title\n')).toBe('vtt')
    expect(sniff('WEBVTTX\n\n00:01.000 --> 00:04.000\nHello\n')).toBeNull()
    expect(sniff('0:00:01.000,0:00:04.000\nHello\n', 'captions.csv')).toBe('sbv')
    expect(sniff('{25}{100}Hello\n{113}{181}there\n')).toBe('microdvd')
    expect(sniff('{1}{1}23.976\n{25}{100}Hello\n', 'x.json')).toBe('microdvd')
    expect(sniff('[00:12.00]la la\n[00:15.50]la\n')).toBe('lrc')
    expect(sniff('[ti:Song]\n[ar:Singer]\n[00:12.00]la la\n')).toBe('lrc')
    expect(sniff('[ti:Song]\n[ar:Singer]\n', 'x.lrc')).toBeNull()
  })

  it('tells ASS from SSA by their headings, and neither is TOML', () => {
    expect(sniff('[Script Info]\nScriptType: v4.00+\n\n[V4+ Styles]\n', 'x.toml')).toBe('ass')
    expect(sniff('[Script Info]\nScriptType: v4.00\n\n[V4 Styles]\n')).toBe('ssa')
    expect(sniff('[Script Info]\n[Events]\n')).toBe('ass')
    expect(sniff('[package]\nname = "x"\n')).toBe('toml')
  })

  it('knows TTML and SAMI from their outermost tag', () => {
    expect(sniff('<?xml version="1.0"?>\n<!-- x -->\n<tt xmlns="http://www.w3.org/ns/ttml"><body/></tt>', 'x.xml')).toBe('ttml')
    expect(sniff('<tt:tt xmlns:tt="http://www.w3.org/ns/ttml"/>')).toBe('ttml')
    expect(sniff('<!DOCTYPE tt [<!ENTITY a "b>">]>\n<tt/>')).toBe('ttml')
    expect(sniff('<!-- <tt> -->\n<people/>', 'x.ttml')).toBe('xml')
    expect(sniff('<ttx/>')).toBe('xml')
    expect(sniff('<SAMI>\n<BODY>\n<SYNC Start=1000><P>Hello\n')).toBe('smi')
    expect(sniff('<sami>\n')).toBe('smi')
  })
})
