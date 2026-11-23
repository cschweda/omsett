import { formatById, registry } from '@omsett/registry'
import { describe, expect, it } from 'vitest'
import { createDataEngine } from '.'

const engine = createDataEngine()

async function convert(text: string, from: string, to: string): Promise<string> {
  const [output] = await engine.convert({
    blob: new Blob([text]),
    name: `in.${from}`,
    from: formatById(registry, from)!,
    to: formatById(registry, to)!,
    options: {},
    signal: new AbortController().signal,
    onProgress: () => {},
  })
  return output!.blob.text()
}
const json = async (text: string, from: string) => JSON.parse(await convert(text, from, 'json')) as unknown

const people = [
  { id: 1, name: 'Ada', tags: ['a', 'b'], home: { city: 'London' }, note: 'said "hi", twice' },
  { id: 2, name: 'Grace', tags: [], home: { city: 'New York' }, note: 'line one\nline two' },
]

describe('every format holds what it is given', () => {
  // Formats that keep lists and groups as they are: there and back changes nothing.
  for (const format of ['yaml', 'jsonl', 'json']) {
    it(`JSON → ${format} → JSON is the same data`, async () => {
      const there = await convert(JSON.stringify(people), 'json', format)
      expect(await json(there, format)).toEqual(people)
    })
  }

  it('TOML names the list "item" and gives it back', async () => {
    const there = await convert(JSON.stringify(people), 'json', 'toml')
    expect(there).toContain('[[item]]')
    expect(await json(there, 'toml')).toEqual({ item: people })
  })

  it('XML wraps a list in <root><item> and reads back the same names', async () => {
    const there = await convert(JSON.stringify([{ id: 1, name: 'Ada' }, { id: 2, name: 'Grace' }]), 'json', 'xml')
    expect(there).toContain('<root>\n  <item>\n    <id>1</id>')
    expect(await json(there, 'xml')).toEqual({ root: { item: [{ id: 1, name: 'Ada' }, { id: 2, name: 'Grace' }] } })
  })

  for (const format of ['csv', 'tsv']) {
    it(`${format} keeps text, numbers, quotes and line breaks; lists and groups become text`, async () => {
      const there = await convert(JSON.stringify(people), 'json', format)
      expect(await json(there, format)).toEqual(
        people.map((p) => ({ ...p, tags: JSON.stringify(p.tags), home: JSON.stringify(p.home) })),
      )
    })
  }
})

describe('tables', () => {
  it('reads semicolons where a file uses them', async () => {
    expect(await json('a;b\n1;x,y\n', 'csv')).toEqual([{ a: 1, b: 'x,y' }])
  })

  it('makes a number only of what is plainly one', async () => {
    const [row] = (await json('a,b,c,d,e,f\n42,-1.5,007,1.50,1e5,99999999999999999999\n', 'csv')) as [object]
    expect(row).toEqual({ a: 42, b: -1.5, c: '007', d: '1.50', e: '1e5', f: '99999999999999999999' })
  })

  it('names columns that have no name or share one, and keeps a ragged row', async () => {
    expect(await json('a,,a\n1,2,3,4\n5\n', 'csv')).toEqual([
      { a: 1, column_2: 2, a_3: 3, column_4: 4 },
      { a: 5 },
    ])
  })

  it('writes one column for every name any row has', async () => {
    expect(await convert('[{"a":1},{"b":true,"a":null}]', 'json', 'csv')).toBe('a,b\r\n1,\r\n,true\r\n')
  })

  it('finds the rows inside the wrappers XML and TOML put around them', async () => {
    expect(await convert('<list><row><a>1</a></row><row><a>2</a></row></list>', 'xml', 'csv')).toBe('a\r\n1\r\n2\r\n')
    expect(await convert('[[row]]\na = 1\n[[row]]\na = 2\n', 'toml', 'jsonl')).toBe('{"a":1}\n{"a":2}\n')
  })

  it('refuses a quoted value that never ends', async () => {
    await expect(convert('a,b\n1,"never closed\n', 'csv', 'json')).rejects.toThrow('never closed')
  })
})

describe('XML', () => {
  it('keeps attributes as @names and text beside them as #text, both ways', async () => {
    const source = '<a x="1" y="two &amp; &quot;three&quot;">words<b/></a>'
    const value = await json(source, 'xml')
    expect(value).toEqual({ a: { '@x': '1', '@y': 'two & "three"', '#text': 'words', b: '' } })
    expect(await json(await convert(JSON.stringify(value), 'json', 'xml'), 'xml')).toEqual(value)
  })

  it('escapes what would otherwise be markup', async () => {
    const there = await convert('{"a":"<script>alert(1)</script> & more"}', 'json', 'xml')
    expect(there).toContain('<a>&lt;script&gt;alert(1)&lt;/script&gt; &amp; more</a>')
  })

  it('turns a name that is not a legal tag into one', async () => {
    const there = await convert('{"doc":{"first name":1,"2nd":2,"a<b":3}}', 'json', 'xml')
    expect(there).toContain('<first_name>1</first_name>')
    expect(there).toContain('<_2nd>2</_2nd>')
    expect(there).toContain('<a_b>3</a_b>')
  })

  it('refuses a document that is not well formed, or has two outermost tags', async () => {
    await expect(convert('<a><b>1</a>', 'xml', 'json')).rejects.toThrow('not valid XML')
    await expect(convert('<a/><b/>', 'xml', 'json')).rejects.toThrow('not valid XML')
  })
})

describe('TOML', () => {
  it('leaves out an empty value, and refuses one inside a list', async () => {
    expect(await convert('{"a":null,"b":1}', 'json', 'toml')).toBe('b = 1\n')
    await expect(convert('{"a":[1,null]}', 'json', 'toml')).rejects.toThrow('empty value inside a list')
  })

  it('turns dates and times into text', async () => {
    expect(await json('d = 2024-01-02T03:04:05Z\nl = 2024-01-02\n', 'toml')).toEqual({
      d: '2024-01-02T03:04:05.000Z',
      l: '2024-01-02',
    })
  })
})

describe('YAML', () => {
  it('reads several documents as a list of them', async () => {
    expect(await json('a: 1\n---\nb: 2\n', 'yaml')).toEqual([{ a: 1 }, { b: 2 }])
  })

  it('follows anchors and merges, and writes none back', async () => {
    const value = await json('base: &b {x: 1}\nmore:\n  <<: *b\n  y: 2\n', 'yaml')
    expect(value).toEqual({ base: { x: 1 }, more: { x: 1, y: 2 } })
  })

  it('builds nothing from a tag: a file that asks for a function gets text', async () => {
    expect(await json('a: !!js/function "function () {}"\n', 'yaml')).toEqual({ a: 'function () {}' })
  })
})

describe('hostile and broken input', () => {
  it('treats __proto__ as a name and nothing more', async () => {
    for (const [text, from] of [
      ['{"__proto__":{"polluted":true},"a":1}', 'json'],
      ['__proto__:\n  polluted: true\na: 1\n', 'yaml'],
      ['a = 1\n[__proto__]\npolluted = true\n', 'toml'],
    ] as const) {
      const out = await convert(text, from, 'json')
      expect(out, from).toContain('"__proto__"')
      expect(({} as Record<string, unknown>).polluted, from).toBeUndefined()
    }
    // XML's parser will not take the name at all.
    await expect(convert('<a><__proto__><polluted>1</polluted></__proto__></a>', 'xml', 'json')).rejects.toThrow()
  })

  it('refuses nesting deep enough to exhaust the stack', async () => {
    const deep = `${'['.repeat(100_000)}${']'.repeat(100_000)}`
    await expect(convert(deep, 'json', 'yaml')).rejects.toThrow()
    await expect(convert(`${'['.repeat(300)}${']'.repeat(300)}`, 'json', 'yaml')).rejects.toThrow('nested too deeply')
  })

  it('refuses a YAML file whose aliases multiply', async () => {
    let bomb = 'a: &a [x, x, x, x, x, x, x, x, x]\n'
    for (const [i, name] of [...'bcdefghi'].entries()) {
      const previous = i === 0 ? 'a' : 'bcdefghi'[i - 1]
      bomb += `${name}: &${name} [${Array.from({ length: 9 }, () => `*${previous}`).join(', ')}]\n`
    }
    await expect(convert(bomb, 'yaml', 'json')).rejects.toThrow('not valid YAML')
  })

  it('does not expand an XML file whose entities multiply, and refuses one that names a file', async () => {
    let entities = '<!ENTITY a0 "aaaaaaaaaa">'
    for (let i = 1; i < 9; i++) entities += `<!ENTITY a${i} "${`&a${i - 1};`.repeat(10)}">`
    const out = await convert(`<!DOCTYPE l [${entities}]><l>&a8;</l>`, 'xml', 'json')
    expect(out.length).toBeLessThan(200)
    await expect(
      convert('<!DOCTYPE l [<!ENTITY x SYSTEM "file:///etc/passwd">]><l>&x;</l>', 'xml', 'json'),
    ).rejects.toThrow('not valid XML')
  })

  it('says which format a broken file is not', async () => {
    await expect(convert('{"a": ', 'json', 'yaml')).rejects.toThrow('This file is not valid JSON')
    await expect(convert('{"a":1}\n{oops}\n', 'jsonl', 'json')).rejects.toThrow('This file is not valid JSON Lines')
    await expect(convert('a = \n', 'toml', 'json')).rejects.toThrow('This file is not valid TOML')
    await expect(convert('a: [1, 2\nb: }', 'yaml', 'json')).rejects.toThrow('This file is not valid YAML')
  })

  it('refuses bytes that are not UTF-8', async () => {
    const [from, to] = [formatById(registry, 'csv')!, formatById(registry, 'json')!]
    const blob = new Blob([new Uint8Array([0x61, 0x2C, 0x62, 0x0A, 0xFF, 0xFE, 0x2C, 0x31])])
    await expect(
      engine.convert({ blob, name: 'x.csv', from, to, options: {}, signal: new AbortController().signal, onProgress() {} }),
    ).rejects.toThrow('not text in UTF-8')
  })
})
