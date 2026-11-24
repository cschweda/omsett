import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { formatById, registry } from '@omsett/registry'
import { dicomDimensions, dicomPicture, dicomProblem, readDicom } from './dicom'
import { detect, layoutProblem, pictureOnly } from './index'

const file = (path: string) => new Uint8Array(readFileSync(new URL(`../../../fixtures/${path}`, import.meta.url)))
const sample = file('dcm/sample.dcm')
const trap = (name: string) => file(`_traps/${name}`)
const text = (bytes: Uint8Array) => Buffer.from(bytes).toString('latin1')

describe('DICOM', () => {
  it('is known by the letters after its first 128 bytes, and gives its size', async () => {
    const found = await detect(new Blob([sample as BlobPart]), registry.formats)
    expect(found).toMatchObject({ kind: 'known', format: { id: 'dcm' }, dimensions: { width: 320, height: 200 } })
    expect(dicomDimensions(sample.subarray(0, 4096))).toEqual({ width: 320, height: 200 })
  })

  it('reads what the file says about its picture', () => {
    expect(readDicom(sample)).toMatchObject({ width: 320, height: 200, samples: 3, bits: 8, frames: 1, plain: true, broken: null })
    expect(readDicom(sample)!.picture).toMatchObject({ length: 320 * 200 * 3, start: sample.length - 320 * 200 * 3 })
    expect(readDicom(trap('grey.dcm'))).toMatchObject({ width: 320, height: 200, samples: 1 })
    expect(readDicom(trap('kinds-left-out.dcm'))).toMatchObject({ width: 320, height: 200, samples: 3, broken: null })
    expect(readDicom(new Uint8Array(200))).toBeNull()
  })

  it('takes the size from the scan and never from a list inside it', () => {
    const found = readDicom(trap('a-huge-picture-inside-a-list.dcm'))!
    expect([found.width, found.height]).toEqual([320, 200])
    expect(found.picture!.length).toBe(320 * 200 * 3)
    expect(dicomProblem(trap('a-huge-picture-inside-a-list.dcm'))).toBeNull()
  })

  it('adds up what a file says against what it holds', () => {
    expect(dicomProblem(sample)).toBeNull()
    expect(dicomProblem(trap('grey.dcm'))).toBeNull()
    expect(dicomProblem(trap('kinds-left-out.dcm'))).toBeNull()
    expect(dicomProblem(trap('truncated.dcm'))).toBe('the picture stops partway')
    expect(dicomProblem(trap('picture-shorter-than-it-says.dcm'))).toBe('the picture is shorter than the size it gives')
    expect(dicomProblem(trap('picture-two-gigabytes-long.dcm'))).toBe('the picture stops partway')
    expect(dicomProblem(trap('no-picture.dcm'))).toBe('the file holds no picture')
    expect(dicomProblem(trap('note-longer-than-the-file.dcm'))).toBe('a part of the file is longer than the file')
    expect(dicomProblem(trap('lists-forty-deep.dcm'))).toBe('its lists sit deeper inside one another than any real file needs')
    expect(dicomProblem(trap('letters-without-a-scan.dcm'))).toBe('the file does not say how large its picture is')
    expect(layoutProblem(formatById(registry, 'dcm')!, trap('truncated.dcm'))).toBe('the picture stops partway')
  })

  it('hands a decoder the picture and its description, and nothing about the patient', () => {
    expect(text(sample)).toContain('Sample^Pattern')
    const shown = dicomPicture(sample)!
    expect(text(shown)).not.toContain('Sample^Pattern')
    expect(text(shown)).not.toContain('OMSETT-0001')
    expect(text(shown)).not.toContain('19700101')
    // What is left is still a file that says the same of its picture, and the picture whole.
    expect(readDicom(shown)).toMatchObject({ width: 320, height: 200, samples: 3, bits: 8, broken: null })
    expect(shown.subarray(-320 * 200 * 3)).toEqual(sample.subarray(-320 * 200 * 3))
    expect(dicomProblem(shown)).toBeNull()

    const planted = dicomPicture(trap('code.dcm'))!
    expect(text(trap('code.dcm'))).toContain('omsett_canary')
    expect(text(planted)).not.toContain('omsett_canary')
    const listed = dicomPicture(trap('a-huge-picture-inside-a-list.dcm'))!
    expect(readDicom(listed)).toMatchObject({ width: 320, height: 200 })
    expect(listed.length).toBe(shown.length)
  })

  it('leaves every other format as it was', () => {
    const png = file('png/sample.png')
    expect(pictureOnly(formatById(registry, 'png')!, png)).toBe(png)
    expect(pictureOnly(formatById(registry, 'dcm')!, sample).length).toBeLessThan(sample.length)
  })
})
