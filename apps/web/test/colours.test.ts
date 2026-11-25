import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Red means only that something went wrong or cannot be done. A format's own colour is drawn
// as a rule above its tile; a red one there reads as a warning about a conversion that is fine.

const css = readFileSync(fileURLToPath(new URL('../app/assets/css/tokens.css', import.meta.url)), 'utf8')

/** Where a colour sits on the wheel, in degrees, and how strong it is (0 to 1). */
function hueOf(hex: string): { hue: number; strength: number } {
  const [r, g, b] = [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16) / 255) as [number, number, number]
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const spread = max - min
  if (spread === 0) return { hue: 0, strength: 0 }
  const raw = max === r ? ((g - b) / spread) % 6 : max === g ? (b - r) / spread + 2 : (r - g) / spread + 4
  return { hue: (raw * 60 + 360) % 360, strength: spread / max }
}

const isRed = (hex: string) => {
  const { hue, strength } = hueOf(hex)
  return strength > 0.2 && (hue >= 340 || hue <= 20)
}

describe('colours', () => {
  const categories = [...css.matchAll(/--cat-([a-z]+):\s*(#[0-9a-f]{6});/g)].map((match) => ({ name: match[1]!, hex: match[2]! }))

  it('finds the category colours', () => {
    expect(categories.length).toBeGreaterThan(10)
  })

  it('can tell red from what is not', () => {
    for (const signal of css.matchAll(/--signal:\s*(#[0-9a-f]{6});/g)) expect(isRed(signal[1]!)).toBe(true)
    expect(isRed('#ef4444')).toBe(true)
    expect(isRed('#f43f5e')).toBe(true)
    expect(isRed('#3b6cff')).toBe(false)
  })

  it('gives no kind of file a red', () => {
    expect(categories.filter((category) => isRed(category.hex)).map((category) => category.name)).toEqual([])
  })
})
