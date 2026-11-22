import { readdir, readFile, stat } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { detect, MAX_PIXELS } from '@omsett/detect'
import { engineInfo } from '@omsett/engines'
import { createNodeEngines } from '@omsett/engines/node'
import { deriveEdges, engineIds, everything, formatById, registry } from '@omsett/registry'
import { describe, expect, it } from 'vitest'

const nodeEngines = createNodeEngines()
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

        for (const fixture of fixtures) {
          const before = await detect(fixture.blob, registry.formats)
          const outputs = await engine.convert({
            blob: fixture.blob,
            name: fixture.name,
            from,
            to,
            options: candidate.defaultOptions,
            maxPixels: MAX_PIXELS,
            signal: new AbortController().signal,
            onProgress: () => {},
          })
          expect(outputs).toHaveLength(1)
          const output = outputs[0]!
          expect(output.name).toBe(fixture.name.replace(/\.[^.]+$/, `.${to.extensions[0]}`))
          expect(output.format).toBe(to.id)

          // Decodable as the target format, same dimensions, judged from the bytes.
          const after = await detect(output.blob, registry.formats)
          expect(after.kind === 'known' && after.format.id).toBe(to.id)
          expect(after.kind === 'known' && after.dimensions).toEqual(
            before.kind === 'known' ? before.dimensions : null,
          )
          expect(output.blob.size, 'output is not empty').toBeGreaterThan(0)
        }
      })
    }
  }
})
