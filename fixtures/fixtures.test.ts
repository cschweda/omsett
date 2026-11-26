import { readdir, readFile, stat } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { detect, MAX_PIXELS } from '@omsett/detect'
import { engineInfo } from '@omsett/engines'
import { createNodeEngines } from '@omsett/engines/node'
import { deriveEdges, engineIds, everything, formatById, registry, writtenSize } from '@omsett/registry'
import { describe, expect, it } from 'vitest'

const nodeEngines = createNodeEngines()
// The few conversions that depend on what a sample holds, and the exact words each is refused
// in when it holds the other thing. Every conversion must still succeed for at least one sample.
const UNWRAPS_TO_THE_OTHER = [
  // A web font unwraps to TTF or to OTF, whichever its outlines are.
  'This font has PostScript outlines, so it unwraps to OTF, not TTF. Choose OTF.',
  'This font has TrueType outlines, so it unwraps to TTF, not OTF. Choose TTF.',
  // A table of people is not a calendar, and a table of events is not an address book.
  'No events found. An event needs a column called summary (or title) and one called start',
  'No contacts found. A contact needs a column called name, email or phone',
  // MP3 holds one or two channels, and one sample of sound has six.
  'MP3 holds one or two channels of sound, and this file has 6. Choose FLAC or WAV',
]
const derived = deriveEdges(registry)

async function fixturesFor(formatId: string): Promise<Array<{ name: string; blob: Blob }>> {
  const dir = new URL(`./${formatId}/`, import.meta.url)
  const names = await readdir(dir).catch(() => [] as string[])
  return Promise.all(
    names.map(async (name) => ({ name, blob: new Blob([await readFile(new URL(name, dir))]) })),
  )
}

describe('engine table', () => {
  it('has an implementation fact sheet for every capability, and a capability for every engine', () => {
    expect(engineIds(everything).sort()).toEqual(Object.keys(engineInfo).sort())
  })

  it('declares a license and a source for every engine', () => {
    for (const info of Object.values(engineInfo)) {
      expect(info.license, info.id).toMatch(/\S/)
      expect(info.sourceUrl, info.id).toMatch(/^https:\/\//)
    }
  })

  it('is covered somewhere: every engine names at least one runtime', () => {
    for (const info of Object.values(engineInfo)) expect(info.runtimes.length, info.id).toBeGreaterThan(0)
  })

  it('states the real download size of vips', async () => {
    const lib = createRequire(new URL('../packages/engines/package.json', import.meta.url))
    const sizes = await Promise.all(
      ['wasm-vips/vips.wasm', 'wasm-vips'].map(async (id) => (await stat(lib.resolve(id))).size),
    )
    const wasm = sizes[0]!
    // the loader script differs by a few hundred bytes between the node and browser builds
    expect(Math.abs(engineInfo.vips!.sizeBytes - wasm)).toBeLessThan(200_000)
  })
})

describe('fixtures through every Node-capable engine', () => {
  for (const edge of derived.edges) {
    for (const candidate of edge.candidates) {
      const info = engineInfo[candidate.engine]!
      const title = `${edge.from} → ${edge.to} via ${candidate.engine}`

      if (!info.runtimes.includes('node')) {
        // Covered by e2e/fixtures.spec.ts in real browsers. Never skipped silently.
        it.skip(`${title} (browser-only: runs in Playwright)`, () => {})
        continue
      }

      it(title, async () => {
        const from = formatById(registry, edge.from)!
        const to = formatById(registry, edge.to)!
        const fixtures = await fixturesFor(edge.from)
        expect(fixtures.length, `no fixture for ${edge.from}`).toBeGreaterThan(0)
        const engine = nodeEngines[candidate.engine]!

        let converted = 0
        for (const fixture of fixtures) {
          const before = await detect(fixture.blob, registry.formats)
          const outputs = await engine
            .convert({
              blob: fixture.blob,
              name: fixture.name,
              from,
              to,
              options: candidate.defaultOptions,
              maxPixels: MAX_PIXELS,
              signal: new AbortController().signal,
              onProgress: () => {},
            })
            .catch((error: unknown) => {
              // Refused in the words listed at the top, and in no others.
              if (error instanceof Error && UNWRAPS_TO_THE_OTHER.includes(error.message)) return null
              throw error
            })
          if (outputs === null) continue
          converted++
          expect(outputs).toHaveLength(1)
          const output = outputs[0]!
          // The ending is replaced whole: "sample.tar.gz" becomes "sample.zip", not "sample.tar.zip".
          expect(output.name).toBe(fixture.name.replace(/(?:\.tar)?\.[^.]+$/, `.${to.extensions[0]}`))
          expect(output.format).toBe(to.id)

          // Decodable as the target format, same dimensions, judged from the bytes. An icon is
          // the one thing written at another size, and the registry says which.
          // Markdown and Fountain are plain text with no mark of their own, known by name alone,
          // so for those two the name is given.
          const after = await detect(output.blob, registry.formats, ['md', 'fountain', 'txt'].includes(to.id) ? output.name : undefined)
          expect(after.kind === 'known' && after.format.id).toBe(to.id)
          expect(after.kind === 'known' && after.dimensions).toEqual(
            writtenSize(candidate.defaultOptions, before.kind === 'known' ? before.dimensions : null),
          )
          expect(output.blob.size, 'output is not empty').toBeGreaterThan(0)
        }
        expect(converted, 'at least one sample converts').toBeGreaterThan(0)
      })
    }
  }
})
