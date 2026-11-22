// Trap files: images that are broken, hostile, or lying, each in one deliberate way.
// fixtures/_traps/manifest.json says what must happen to each; this runs them through
// detection, the size guard, and libvips in Node. e2e/traps.spec.ts does the same in browsers.
import { readFile } from 'node:fs/promises'
import { detect, nameDisagrees, sizeProblem } from '@omsett/detect'
import { createNodeEngines } from '@omsett/engines/node'
import { createRouter, deriveEdges, formatById, registry } from '@omsett/registry'
import { describe, expect, it } from 'vitest'
import manifest from './_traps/manifest.json'

const engine = createNodeEngines().vips!
const router = createRouter(registry)
const derived = deriveEdges(registry)
const png = formatById(registry, 'png')!
const webp = formatById(registry, 'webp')!
const options = derived.edge('png', 'webp')!.candidates.find((c) => c.engine === 'vips')!.defaultOptions

const load = async (file: string) => new File([await readFile(new URL(`./_traps/${file}`, import.meta.url))], file)

function convert(blob: Blob, name: string) {
  return engine.convert({
    blob,
    name,
    from: png,
    to: webp,
    options,
    signal: new AbortController().signal,
    onProgress: () => {},
  })
}

/** A trap may fail, but it may not take the engine down with it. */
async function expectEngineStillWorks() {
  const good = await readFile(new URL('./png/sample.png', import.meta.url))
  const [output] = await convert(new Blob([good]), 'sample.png')
  const found = await detect(output!.blob, registry.formats)
  expect(found.kind === 'known' && found.format.id).toBe('webp')
}

describe('trap files', () => {
  it('has a manifest entry for every file and a file for every entry', async () => {
    const { readdir } = await import('node:fs/promises')
    const files = (await readdir(new URL('./_traps/', import.meta.url))).filter(
      (name) => name !== 'manifest.json' && name !== 'README.md',
    )
    expect(files.sort()).toEqual(manifest.map((t) => t.file).sort())
  })

  for (const trap of manifest) {
    it(`${trap.file}: ${trap.why}`, async () => {
      const file = await load(trap.file)

      // 1. Identification never throws, and goes by contents.
      const found = await detect(file, registry.formats)
      const identified = found.kind === 'known' ? found.format.id : found.kind
      expect(identified, 'identified as').toBe(trap.detect)
      if (found.kind !== 'known') {
        expect(trap.node, 'an unidentified file reaches no engine').toBe('none')
        return
      }
      expect(nameDisagrees(file.name, found.format), 'name disagrees with contents').toBe(trap.mismatch)

      // 2. The guard decides from the header alone, before anything is decoded.
      const refused = sizeProblem(file.size, found.dimensions) !== null
      expect(refused ? 'refused' : 'ok', 'size guard').toBe(trap.guard)
      if (refused) {
        expect(trap.node).toBe('none')
        return
      }

      // 3. A format with no route is never handed to an engine.
      if (!router.route(found.format.id, webp.id)) {
        expect(trap.node, 'no route, so no engine').toBe('none')
        return
      }

      // 4. The engine either converts it properly or refuses it cleanly. Nothing in between:
      //    no hang, no crash, no output that is not what it claims to be.
      let outcome: 'succeeds' | 'fails'
      try {
        const outputs = await convert(file, file.name)
        expect(outputs).toHaveLength(1)
        const after = await detect(outputs[0]!.blob, registry.formats)
        expect(after.kind === 'known' && after.format.id, 'output is really WebP').toBe('webp')
        expect(after.kind === 'known' && after.dimensions, 'output keeps the declared size').toEqual(
          found.dimensions,
        )
        if (trap.absent) {
          // What was hidden in the input's metadata must not have been carried across.
          const text = Buffer.from(await outputs[0]!.blob.arrayBuffer()).toString('latin1')
          expect(text.includes(trap.absent), `output carries "${trap.absent}"`).toBe(false)
        }
        outcome = 'succeeds'
      } catch (error) {
        expect(error, 'a failure is an ordinary error').toBeInstanceOf(Error)
        outcome = 'fails'
      }
      expect(outcome, 'libvips').toBe(trap.node)

      await expectEngineStillWorks()
    }, 30_000)
  }
})
