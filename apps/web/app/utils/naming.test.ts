import { describe, expect, it } from 'vitest'
import { cleanAffix, MAX_AFFIX, namedAs, readNaming } from './naming'

describe('what a converted file is called', () => {
  it('is its own name, unless the person has asked for more', () => {
    expect(namedAs('report.html', { prefix: '', suffix: '' })).toBe('report.html')
  })

  it('takes words before the name, after it, or both, ahead of the ending', () => {
    expect(namedAs('report.html', { prefix: 'omsett-', suffix: '' })).toBe('omsett-report.html')
    expect(namedAs('report.html', { prefix: '', suffix: '-converted' })).toBe('report-converted.html')
    expect(namedAs('report.final.html', { prefix: 'a_', suffix: '_b' })).toBe('a_report.final_b.html')
    expect(namedAs('notes.tar.gz', { prefix: '', suffix: '-new' })).toBe('notes-new.tar.gz')
    expect(namedAs('README', { prefix: 'x-', suffix: '-y' })).toBe('x-README-y')
  })

  it('keeps out of the words anything a file name cannot hold or should not', () => {
    expect(cleanAffix('../../etc/')).toBe('etc')
    expect(cleanAffix('a/b\\c:d*e?f"g<h>i|j')).toBe('abcdefghij')
    expect(cleanAffix(`safe${String.fromCodePoint(0x202E)}gnp${String.fromCodePoint(0)}`)).toBe('safegnp')
    expect(cleanAffix('...hidden')).toBe('hidden')
    expect([...cleanAffix('x'.repeat(500))]).toHaveLength(MAX_AFFIX)
    expect(namedAs('report.html', { prefix: '../', suffix: '/..' })).toBe('report.html')
    // Words after the name do not get to end it with a dot or a space before the real ending.
    expect(namedAs('report.html', { prefix: '', suffix: '-v2. ' })).toBe('report-v2.html')
  })

  it('reads back what was stored, and takes anything else for no choice', () => {
    expect(readNaming('{"prefix":"a-","suffix":"-b"}')).toEqual({ prefix: 'a-', suffix: '-b' })
    expect(readNaming('{"prefix":"../x","suffix":7}')).toEqual({ prefix: 'x', suffix: '' })
    for (const not of [null, '', 'nonsense', '[]', '"x"', '{"__proto__":{"prefix":"p"}}']) expect(readNaming(not)).toEqual({ prefix: '', suffix: '' })
  })
})
