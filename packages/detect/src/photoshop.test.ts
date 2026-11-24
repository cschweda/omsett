import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { photoshopProblem } from './photoshop'

const sample = async (path: string) => new Uint8Array(await readFile(new URL(`../../../fixtures/${path}`, import.meta.url)))

describe('a Photoshop file must hold what it says it holds', () => {
  it('passes both sound samples', async () => {
    expect(photoshopProblem(await sample('psd/sample.psd'))).toBeNull()
    expect(photoshopProblem(await sample('psb/sample.psb'))).toBeNull()
  })

  it('refuses either one cut short anywhere, down to its last byte', async () => {
    for (const path of ['psd/sample.psd', 'psb/sample.psb']) {
      const bytes = await sample(path)
      for (const keep of [0, 10, 25, 26, 40, bytes.length >> 2, bytes.length >> 1, bytes.length - 1]) {
        expect(photoshopProblem(bytes.subarray(0, keep)), `${path} cut to ${keep}`).not.toBeNull()
      }
    }
  })

  it('refuses a section that says it is longer than the file, and a version that does not exist', async () => {
    const bytes = await sample('psb/sample.psb')
    const long = bytes.slice()
    new DataView(long.buffer).setUint32(30, 0x7FFFFFFF)
    expect(photoshopProblem(long)).toBe('a part of the file is longer than the file')
    const third = bytes.slice()
    third[5] = 3
    expect(photoshopProblem(third)).toBe('the file gives a version that does not exist')
  })

  it('counts a picture stored unpacked by its size, not by a list', () => {
    const header = new Uint8Array(26 + 4 + 4 + 4 + 2)
    header.set([0x38, 0x42, 0x50, 0x53, 0, 1])
    const view = new DataView(header.buffer)
    view.setUint16(12, 3)
    view.setUint32(14, 4)
    view.setUint32(18, 4)
    view.setUint16(22, 8)
    const whole = new Uint8Array(header.length + 48)
    whole.set(header)
    expect(photoshopProblem(whole)).toBeNull()
    expect(photoshopProblem(whole.subarray(0, whole.length - 1))).toBe('the picture stops partway')
  })
})
