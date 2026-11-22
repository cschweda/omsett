import { registry } from '@omsett/registry'
import { describe, expect, it } from 'vitest'
import { outputName, safeBaseName } from './util'

const webp = registry.formats.find((f) => f.id === 'webp')!

describe('output names', () => {
  it('swaps the extension and keeps the rest', () => {
    expect(outputName('photo.final.png', webp)).toBe('photo.final.webp')
    expect(outputName('no-extension', webp)).toBe('no-extension.webp')
    expect(outputName('Übersicht 2026 (final).png', webp)).toBe('Übersicht 2026 (final).webp')
  })

  it('never offers a folder back', () => {
    expect(outputName('../../etc/passwd.png', webp)).toBe('passwd.webp')
    expect(outputName('C:\\Users\\me\\secret.png', webp)).toBe('secret.webp')
    expect(outputName('/abs/path/x.png', webp)).toBe('x.webp')
  })

  it('removes characters that reverse or hide what a name says', () => {
    // U+202E makes "invoice[RLO]gnp.exe" display as "invoiceexe.png"
    expect(outputName('invoice\u202Egnp.exe.png', webp)).toBe('invoicegnp.exe.webp')
    expect(safeBaseName('a\u0000b\u0007c\u200Fd.png')).toBe('abcd')
    expect(safeBaseName('line\nbreak\ttab.png')).toBe('line break tab')
  })

  it('replaces characters a file system refuses', () => {
    expect(safeBaseName('"><img src=x onerror=alert(1)>.png')).toBe('___img src=x onerror=alert(1)_')
    expect(safeBaseName('what?*.png')).toBe('what__')
  })

  it('does not produce a hidden or empty name', () => {
    expect(outputName('.png', webp)).toBe('png.webp')
    expect(outputName('...', webp)).toBe('converted.webp')
    expect(outputName('', webp)).toBe('converted.webp')
    expect(outputName('   .png', webp)).toBe('converted.webp')
  })

  it('caps the length', () => {
    const name = outputName(`${'a'.repeat(3000)}.png`, webp)
    expect(name).toBe(`${'a'.repeat(120)}.webp`)
    // counted in characters, so an emoji is never cut in half
    expect([...safeBaseName('😀'.repeat(500))]).toHaveLength(120)
  })
})
