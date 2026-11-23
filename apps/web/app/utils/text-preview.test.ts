import { describe, expect, it } from 'vitest'
import { PREVIEW_COLUMNS, PREVIEW_LINES, previewOf } from './text-preview'

const bytes = (text: string) => new TextEncoder().encode(text)
const mark = String.fromCodePoint(0xFFFD)

describe('text preview', () => {
  it('shows a short file whole', () => {
    expect(previewOf(bytes('a: 1\r\nb: 2\n'), true)).toEqual({ lines: ['a: 1', 'b: 2'], more: false })
    expect(previewOf(bytes(''), true)).toEqual({ lines: [], more: false })
  })

  it('stops at the line limit and says there is more', () => {
    const preview = previewOf(bytes('x\n'.repeat(PREVIEW_LINES + 50)), true)
    expect(preview.lines).toHaveLength(PREVIEW_LINES)
    expect(preview.more).toBe(true)
  })

  it('cuts a long line, and never in the middle of a character', () => {
    const preview = previewOf(bytes(String.fromCodePoint(0x1F600).repeat(PREVIEW_COLUMNS + 10)), true)
    expect([...preview.lines[0]!]).toHaveLength(PREVIEW_COLUMNS + 1)
    expect(preview.lines[0]!.endsWith('…')).toBe(true)
    expect(preview.lines[0]!.includes(mark)).toBe(false)
    expect(preview.more).toBe(true)
  })

  it('drops the last line of a sample, which is cut wherever the sample ended', () => {
    expect(previewOf(bytes('whole line\nhalf a li'), false)).toEqual({ lines: ['whole line'], more: true })
  })

  it('shows control codes and direction marks as a mark, so nothing is hidden or reversed', () => {
    const line = `a${String.fromCodePoint(0)}b${String.fromCodePoint(0x202E)}c${String.fromCodePoint(0x1B)}[31m\tend`
    expect(previewOf(bytes(line), true).lines[0]).toBe(`a${mark}b${mark}c${mark}[31m\tend`)
  })

  it('reads bytes that are not UTF-8 without failing', () => {
    expect(previewOf(new Uint8Array([0x63, 0x61, 0x66, 0xE9]), true).lines[0]).toBe(`caf${mark}`)
  })

  it('leaves out a byte-order mark', () => {
    expect(previewOf(new Uint8Array([0xEF, 0xBB, 0xBF, 0x61]), true).lines).toEqual(['a'])
  })
})
