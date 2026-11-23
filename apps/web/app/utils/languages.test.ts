import { describe, expect, it } from 'vitest'
import { closestLanguage, languages } from './languages'

describe('the language offered first', () => {
  it('is the browser\'s own, where that is on the list', () => {
    expect(closestLanguage('fr', 'en')).toBe('fr')
    expect(closestLanguage('fr-CA', 'en')).toBe('fr')
    expect(closestLanguage('EN-us', 'en')).toBe('en')
    expect(closestLanguage('zh-TW', 'en')).toBe('zh-Hant')
    expect(closestLanguage('zh-CN', 'en')).toBe('zh-Hans')
    expect(closestLanguage('zh', 'en')).toBe('zh-Hans')
    expect(closestLanguage('no', 'en')).toBe('nb')
  })

  it('is the registry\'s default otherwise', () => {
    expect(closestLanguage('tlh', 'en')).toBe('en')
    expect(closestLanguage(undefined, 'en')).toBe('en')
    expect(closestLanguage('', 'en')).toBe('en')
  })

  it('offers only tags the engine will write, each once', () => {
    const tags = languages.map((language) => language.tag)
    expect(new Set(tags).size).toBe(tags.length)
    for (const tag of tags) expect(tag).toMatch(/^[a-z]{2,3}(?:-[a-z0-9]{2,8}){0,3}$/i)
  })
})
