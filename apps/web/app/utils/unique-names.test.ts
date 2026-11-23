import { describe, expect, it } from 'vitest'
import { uniqueNames } from './unique-names'

describe('names for one folder', () => {
  it('leaves different names alone', () => {
    expect(uniqueNames(['a.webp', 'b.webp'])).toEqual(['a.webp', 'b.webp'])
  })

  it('numbers the second and third of a name, before the ending', () => {
    expect(uniqueNames(['photo.webp', 'photo.webp', 'Photo.WEBP', 'notes', 'notes'])).toEqual([
      'photo.webp',
      'photo (2).webp',
      'Photo (3).WEBP',
      'notes',
      'notes (2)',
    ])
  })

  it('does not hand out a name that is already there', () => {
    expect(uniqueNames(['a.txt', 'a (2).txt', 'a.txt'])).toEqual(['a.txt', 'a (2).txt', 'a (3).txt'])
  })
})
