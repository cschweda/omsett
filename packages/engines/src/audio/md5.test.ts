import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { Md5 } from './md5'

const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString('hex')

describe('MD5', () => {
  it('gives the standard answers', () => {
    expect(hex(new Md5().digest())).toBe('d41d8cd98f00b204e9800998ecf8427e')
    expect(hex(new Md5().update(new TextEncoder().encode('abc')).digest())).toBe('900150983cd24fb0d6963f7d28e17f72')
  })

  it('agrees with Node for every length around a block, fed whole and in pieces', () => {
    const bytes = Uint8Array.from({ length: 1000 }, (_, i) => (i * 131 + 7) & 0xFF)
    for (const length of [1, 55, 56, 57, 63, 64, 65, 119, 120, 121, 128, 999, 1000]) {
      const part = bytes.subarray(0, length)
      const expected = createHash('md5').update(part).digest('hex')
      expect(hex(new Md5().update(part).digest()), `${length} at once`).toBe(expected)
      const pieces = new Md5()
      for (let at = 0; at < length; at += 7) pieces.update(part.subarray(at, Math.min(length, at + 7)))
      expect(hex(pieces.digest()), `${length} in sevens`).toBe(expected)
    }
  })
})
