import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { checksum, oggProblem } from './ogg'

const fixture = async (path: string) => new Uint8Array(await readFile(new URL(`../../../../fixtures/${path}`, import.meta.url)))
/** Where each page begins. */
const pages = (bytes: Uint8Array) => [...Buffer.from(bytes).toString('latin1').matchAll(/OggS/g)].map((found) => found.index)

describe('the walk over an Ogg file', () => {
  for (const path of ['ogg/sample.ogg', 'opus/sample.opus']) {
    it(`passes a whole file, and catches each way of spoiling it: ${path}`, async () => {
      const whole = await fixture(path)
      expect(oggProblem(whole)).toBeNull()
      const starts = pages(whole)
      const last = starts.at(-1)!

      // One byte changed inside the sound: the page's checksum no longer matches.
      const flipped = whole.slice()
      flipped[whole.length - 5]! ^= 0x01
      expect(oggProblem(flipped)).toBe('damaged')
      // Cut at the edge of a page, so that every page left is whole: the end is never marked.
      expect(oggProblem(whole.slice(0, last))).toBe('cut')
      // Cut inside a page.
      expect(oggProblem(whole.slice(0, whole.length - 10))).toBe('cut')
      // A page taken out of the middle: the count of pages skips one.
      expect(oggProblem(new Uint8Array([...whole.subarray(0, starts[1]!), ...whole.subarray(starts[2]!)]))).not.toBeNull()
      // Anything after the last page.
      expect(oggProblem(new Uint8Array([...whole, 0, 0, 0, 0]))).not.toBeNull()
      // A second stream, as a second track, a picture, a film or a file chained on would be.
      const other = whole.slice()
      const view = new DataView(other.buffer)
      const starts2 = [...pages(other), other.length]
      for (let i = 0; i + 1 < starts2.length; i++) {
        const at = starts2[i]!
        other[at + 14]! ^= 0xFF
        view.setUint32(at + 22, checksum(other, at, starts2[i + 1]!, at + 22), true)
      }
      expect(oggProblem(other), 'the other file is whole by itself').toBeNull()
      expect(oggProblem(new Uint8Array([...whole, ...other]))).toBe('tracks')
      // Not Ogg at all.
      expect(oggProblem(new Uint8Array(64))).toBe('damaged')
    })
  }
})
