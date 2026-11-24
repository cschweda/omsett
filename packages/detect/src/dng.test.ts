import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { registry } from '@omsett/registry'
import { dngDimensions } from './dng'
import { detect } from './index'

const file = (path: string) => new Uint8Array(readFileSync(new URL(`../../../fixtures/${path}`, import.meta.url)))
const trap = (name: string) => file(`_traps/${name}`)

describe('DNG', () => {
  it('is known for a raw file and not for the TIFF it also is', async () => {
    const found = await detect(new Blob([file('dng/sample.dng') as BlobPart]), registry.formats, 'sample.tif')
    expect(found).toMatchObject({ kind: 'known', format: { id: 'dng' }, dimensions: { width: 320, height: 200 } })
  })

  it('gives the size of the real picture, not of the preview a camera puts first', () => {
    expect(dngDimensions(trap('preview-first.dng'))).toEqual({ width: 320, height: 200 })
  })

  it('gives the size as the picture will stand once turned the way the camera was held', () => {
    expect(dngDimensions(trap('camera-held-sideways.dng'))).toEqual({ width: 200, height: 320 })
  })

  it('follows a list that names itself once and stops', () => {
    expect(dngDimensions(trap('list-names-itself.dng'))).toEqual({ width: 32, height: 20 })
  })

  it('says nothing of a file too short to hold a list, or whose list lies past its end', () => {
    expect(dngDimensions(new Uint8Array(4))).toBeNull()
    expect(dngDimensions(new Uint8Array([0x49, 0x49, 42, 0, 0xF0, 0xFF, 0xFF, 0x7F]))).toBeNull()
    expect(dngDimensions(file('dng/sample.dng').subarray(0, 40))).toBeNull()
  })
})
