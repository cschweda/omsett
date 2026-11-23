import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { Refusal } from '../util'
import { gunzipWithin, pack, safeName, type Entry } from './entries'
import { zipFiles } from './index'
import { readTar, writeTar } from './tar'
import { readZip, writeZip } from './zip'

const fixture = async (path: string) => new Uint8Array(await readFile(new URL(`../../../../fixtures/${path}`, import.meta.url)))
const refusal = async (work: () => unknown) => {
  try {
    await work()
    return null
  } catch (error) {
    return error instanceof Refusal ? error.message : `not a Refusal: ${String(error)}`
  }
}
const words = (entry: Entry) => new TextDecoder().decode(entry.data)
const shape = (entries: Entry[]) =>
  entries.map((entry) => [entry.name, entry.directory ? 'folder' : entry.data.length, entry.executable, entry.modified?.toISOString() ?? null])
const file = (name: string, text = 'x', more: Partial<Entry> = {}): Entry => ({
  name,
  data: new TextEncoder().encode(text),
  directory: false,
  modified: new Date('2026-11-23T12:00:00Z'),
  executable: false,
  ...more,
})
const ESCAPES = 'This archive holds a file named so that it would land outside the folder it is unpacked into'

describe('archives', () => {
  const expected = [
    ['readme.txt', 56, false, '2026-11-23T12:00:00.000Z'],
    ['docs', 'folder', false, '2026-11-23T12:00:00.000Z'],
    ['docs/notes.md', 2329, false, '2026-11-23T12:00:00.000Z'],
    ['docs/café 字幕.txt', 43, false, '2026-11-23T12:00:00.000Z'],
    ['bin/run.sh', 37, true, '2026-11-23T12:00:00.000Z'],
    ['empty.dat', 0, false, '2026-11-23T12:00:00.000Z'],
  ]

  it('reads a ZIP: names, contents, dates, and which files are programs', async () => {
    const entries = await readZip(await fixture('zip/sample.zip'))
    expect(shape(entries)).toEqual(expected)
    expect(words(entries[0]!)).toBe('Drop a file. Pick a format.\nNothing leaves your device.\n')
  })

  it('reads a TAR the same, and leaves the link in it out', async () => {
    const tar = await fixture('tar/sample.tar')
    expect(Buffer.from(tar).includes('latest')).toBe(true)
    const entries = readTar(tar, 'TAR')
    expect(shape(entries)).toEqual(expected)
    expect(entries.some((entry) => entry.name === 'latest')).toBe(false)
  })

  it('reads a TAR.GZ the same', async () => {
    const tar = await gunzipWithin(await fixture('tgz/sample.tar.gz'), 1024 * 1024)
    expect(shape(readTar(tar as Uint8Array, 'TAR.GZ'))).toEqual(expected)
  })

  it('writes a TAR that does not say who owned the files', async () => {
    const original = await fixture('tar/sample.tar')
    expect(Buffer.from(original).includes('ada')).toBe(true)
    const written = writeTar(readTar(original, 'TAR'))
    expect(Buffer.from(written).includes('ada')).toBe(false)
    expect(Buffer.from(written).includes('staff')).toBe(false)
    expect(shape(readTar(written, 'TAR'))).toEqual(expected)
  })

  it('goes round every format and comes back the same', async () => {
    const start = await readZip(await fixture('zip/sample.zip'))
    const viaTar = readTar(writeTar(start), 'TAR')
    const viaGzip = readTar((await gunzipWithin(await pack(writeTar(viaTar), 'gzip'), 1024 * 1024)) as Uint8Array, 'TAR.GZ')
    const back = await readZip(await writeZip(viaGzip))
    expect(shape(back)).toEqual(expected)
    expect(back.map(words)).toEqual(start.map(words))
  })

  it('keeps names too long for a TAR header, both ways they can be written', async () => {
    const splittable = `${'folder/'.repeat(20)}file.txt`
    const unsplittable = `${'字'.repeat(120)}.txt`
    const entries = [file(splittable, 'one'), file(unsplittable, 'two')]
    const back = readTar(writeTar(entries), 'TAR')
    expect(back.map((entry) => [entry.name, words(entry)])).toEqual([[splittable, 'one'], [unsplittable, 'two']])
    expect((await readZip(await writeZip(entries))).map((entry) => entry.name)).toEqual([splittable, unsplittable])
  })

  it('packs several files into one ZIP', async () => {
    const zip = await zipFiles([
      { name: 'a.webp', data: new Uint8Array([1, 2, 3]) },
      { name: 'b.webp', data: new Uint8Array(5000) },
    ])
    expect((await readZip(zip)).map((entry) => [entry.name, entry.data.length])).toEqual([['a.webp', 3], ['b.webp', 5000]])
  })

  describe('names', () => {
    it('are kept inside the archive', () => {
      expect(safeName('docs/notes.md', 'ZIP')).toBe('docs/notes.md')
      expect(safeName('./docs//notes.md', 'ZIP')).toBe('docs/notes.md')
      expect(safeName('docs\\notes.md', 'ZIP')).toBe('docs/notes.md')
      expect(safeName('./', 'ZIP')).toBeNull()
      // Dots inside a name are only dots. (At the end of one they are refused: see the audit tests.)
      expect(safeName('a..b/..c/d..e', 'ZIP')).toBe('a..b/..c/d..e')
    })

    it('that point outside it are refused, however they are spelled', async () => {
      for (const name of ['../x', 'a/../../x', '..', 'a/..', '/etc/passwd', '\\Windows\\x', 'C:\\Windows\\x', 'c:x', '..\\..\\x', 'a\0b']) {
        expect(await refusal(() => safeName(name, 'ZIP')), JSON.stringify(name)).toBe(ESCAPES)
      }
    })

    it('are checked after invisible characters are removed, not before', async () => {
      const mark = String.fromCodePoint(0x202E)
      const control = String.fromCodePoint(1)
      for (const name of [`.${mark}.`, `a/.${control}./x`, `.${mark}./.${mark}./etc/passwd`, `${mark}/etc/passwd`, `C${control}:\\x`, `${control}..`, '.. ', '...', 'a/.. ./x']) {
        expect(await refusal(() => safeName(name, 'ZIP')), JSON.stringify(name)).toBe(ESCAPES)
      }
    })

    it('lose characters that hide what they are', () => {
      const reversed = `invoice${String.fromCodePoint(0x202E)}gnp.exe`
      expect(safeName(reversed, 'ZIP')).toBe('invoicegnp.exe')
      expect(safeName('a\r\nb\tc', 'ZIP')).toBe('abc')
    })
  })

  describe('refuses', () => {
    it('a ZIP written by this code and then altered', async () => {
      const zip = await writeZip([file('a.txt', 'hello '.repeat(100)), file('b.txt', 'world '.repeat(100))])
      const altered = (change: (copy: Uint8Array, data: DataView) => void) => {
        const copy = zip.slice()
        change(copy, new DataView(copy.buffer))
        return copy
      }
      const end = zip.length - 22
      const listAt = new DataView(zip.buffer).getUint32(end + 16, true)
      // One byte of a packed file changed.
      expect(await refusal(() => readZip(altered((copy) => (copy[40] = copy[40]! ^ 0xFF))))).toMatch(/not a valid ZIP|damaged/)
      // The list says a file is larger than it is.
      expect(await refusal(() => readZip(altered((_, data) => data.setUint32(listAt + 24, 5, true))))).toBe('This file is not a valid ZIP archive')
      // The list says both files are in the same place.
      expect(await refusal(() => readZip(altered((_, data) => data.setUint32(listAt + 42 + 46 + 5, 0, true))))).toBe('This file is not a valid ZIP archive')
      // The list says a file is protected by a password.
      expect(await refusal(() => readZip(altered((_, data) => data.setUint16(listAt + 8, 0x0801, true))))).toBe(
        'This archive is protected by a password, which Omsett cannot open',
      )
      // The list says a file is packed some other way.
      expect(await refusal(() => readZip(altered((_, data) => data.setUint16(listAt + 10, 14, true))))).toBe('This archive is packed in a way Omsett does not read')
      // Cut short, and with something added after.
      expect(await refusal(() => readZip(zip.subarray(0, zip.length - 5)))).toBe('This file is not a valid ZIP archive')
      expect(await refusal(() => readZip(new Uint8Array([...zip, 1, 2, 3])))).toBe('This file is not a valid ZIP archive')
    })

    it('two files with one name, and an archive of nothing but folders', async () => {
      expect(await refusal(async () => readZip(await writeZip([file('a.txt'), file('a.txt')])))).toBe('This archive holds two files with the same name')
      expect(await refusal(() => readTar(writeTar([file('a.txt'), file('./a.txt')]), 'TAR'))).toBe('This archive holds two files with the same name')
      expect(await refusal(() => readTar(writeTar([file('docs', '', { directory: true })]), 'TAR'))).toBe('This archive has no files in it')
    })

    it('a TAR cut short, or with a header changed', async () => {
      const tar = await fixture('tar/sample.tar')
      expect(await refusal(() => readTar(tar.subarray(0, 700), 'TAR'))).toBe('This file is not a valid TAR archive')
      expect(await refusal(() => readTar(tar.subarray(0, 100), 'TAR'))).toBe('This file is not a valid TAR archive')
      const changed = tar.slice()
      changed[3] = changed[3]! ^ 0xFF
      expect(await refusal(() => readTar(changed, 'TAR'))).toBe('This file is not a valid TAR archive')
    })

    it('more than it will unpack, from the stated size alone', async () => {
      const tar = writeTar([file('big.bin')])
      // The size field, rewritten to claim seven gigabytes, with the checksum made to match.
      tar.set(new TextEncoder().encode('64000000000\0'), 124)
      tar.fill(0x20, 148, 156)
      const sum = tar.subarray(0, 512).reduce((total, byte) => total + byte, 0)
      tar.set(new TextEncoder().encode(`${sum.toString(8).padStart(6, '0')}\0 `), 148)
      expect(await refusal(() => readTar(tar, 'TAR'))).toMatch(/not a valid TAR archive|more than Omsett will handle/)
      expect(await gunzipWithin(await pack(new Uint8Array(4 * 1024 * 1024), 'gzip'), 1024 * 1024)).toBe('too-large')
    })
  })
})
