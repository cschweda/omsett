import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import manifest from '../../../fixtures/_traps/manifest.json'
import { MAX_PIXELS } from './guard'
import { pngStructureProblem } from './png-structure'

const read = async (path: string) => new Blob([await readFile(new URL(`../../../fixtures/${path}`, import.meta.url))])

describe('PNG structure check', () => {
  it('passes sound files, including the unusual ones', async () => {
    for (const file of [
      'png/sample.png',
      '_cases/alpha.png',
      '_cases/tiny-1x1.png',
      '_traps/sixteen-bit.png',
      '_traps/palette-with-transparency.png',
      '_traps/one-bit-grey.png',
      '_traps/interlaced.png',
      '_traps/trailing-garbage.png',
      '_traps/png-then-zip.png',
      '_traps/image-data-in-single-bytes.png',
      '_traps/five-thousand-comments.png',
      '_traps/metadata-bomb.png',
      '_traps/script-in-metadata.png',
    ]) {
      expect(await pngStructureProblem(await read(file), MAX_PIXELS), file).toBeNull()
    }
  })

  // Every kind of damage a forgiving decoder has been seen to turn into a partial picture,
  // and the reason each is caught.
  const damaged: Record<string, RegExp> = {
    'truncated.png': /cut off|past the end|end marker/,
    'short-image-data.png': /less image data/,
    'too-much-image-data.png': /more image data/,
    'corrupt-image-data.png': /corrupt|filter|less|more/,
    'bad-checksum.png': /wrong checksum/,
    'inner-checksum-wrong.png': /corrupt/,
    'bad-filter-type.png': /filter that does not exist/,
    'bad-bit-depth.png': /bit depth/,
    'bad-colour-type.png': /colour type/,
    'header-not-first.png': /header is not first/,
    'no-image-data.png': /no image data/,
    'no-end-marker.png': /end marker/,
    'unknown-critical-chunk.png': /essential chunk CRIT/,
    'interlace-flag-lies.png': /image data|filter/,
    'palette-index-out-of-range.png': /outside the palette/,
    'palette-wrong-length.png': /palette is malformed/,
    'declares-zero-size.png': /no size/,
  }
  for (const [file, reason] of Object.entries(damaged)) {
    it(`refuses ${file}`, async () => {
      expect(await pngStructureProblem(await read(`_traps/${file}`), MAX_PIXELS)).toMatch(reason)
    })
  }

  it('refuses an oversized declaration before decompressing anything', async () => {
    expect(await pngStructureProblem(await read('_traps/bomb-20000x20000.png'), MAX_PIXELS)).toMatch(/too large/)
  })

  it('has an opinion on every PNG trap', () => {
    // A reminder to classify a new trap above, as sound or as damaged.
    const pngTraps = manifest.filter((t) => t.detect === 'png' && t.guard === 'ok').map((t) => t.file)
    expect(pngTraps.length).toBeGreaterThan(20)
  })
})
