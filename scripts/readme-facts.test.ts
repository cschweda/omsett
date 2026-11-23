import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { withFacts } from './readme-facts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

describe('README.md', () => {
  it('states the formats, conversions and tests as they are (run `pnpm readme:facts`)', () => {
    const path = join(root, 'README.md')
    // `pnpm readme:facts` runs this same test with leave to write: the registry is read as the
    // tests read it, so what is written is what is checked.
    if (process.env.OMSETT_WRITE_README) writeFileSync(path, withFacts(readFileSync(path, 'utf8')))
    const readme = readFileSync(path, 'utf8')
    expect(withFacts(readme)).toBe(readme)
  })

  it('opens with the social card, with the badges directly under it', () => {
    const readme = readFileSync(join(root, 'README.md'), 'utf8')
    expect(readme.trimStart().startsWith('<p align="center">\n  <img src="brand/og.png"')).toBe(true)
  })
})
