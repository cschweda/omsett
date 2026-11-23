// Trap files: images that are broken, hostile, or lying, each in one deliberate way.
// fixtures/_traps/manifest.json says what must happen to each; this runs them through
// detection, the size guard, and libvips in Node. e2e/traps.spec.ts does the same in browsers.
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { detect, MAX_PIXELS, nameDisagrees, sizeProblem } from '@omsett/detect'
import { describeFile } from '@omsett/engines'
import { createNodeEngines } from '@omsett/engines/node'
import { createRouter, deriveEdges, formatById, registry, switches, type Format } from '@omsett/registry'
import { afterEach, describe, expect, it } from 'vitest'
import manifest from './_traps/manifest.json'

const engines = createNodeEngines()
const router = createRouter(registry)
const derived = deriveEdges(registry)
const png = formatById(registry, 'png')!
const webp = formatById(registry, 'webp')!
const json = formatById(registry, 'json')!
const yaml = formatById(registry, 'yaml')!
const srt = formatById(registry, 'srt')!
const vtt = formatById(registry, 'vtt')!
const md = formatById(registry, 'md')!
const html = formatById(registry, 'html')!
const woff = formatById(registry, 'woff')!
const ttf = formatById(registry, 'ttf')!
const zip = formatById(registry, 'zip')!
const tar = formatById(registry, 'tar')!
const fdx = formatById(registry, 'fdx')!
const fountain = formatById(registry, 'fountain')!

const load = async (file: string) => new File([await readFile(new URL(`./_traps/${file}`, import.meta.url))], file)

/** Convert along the registry's route, each step at its registered defaults, as the app would. */
async function convert(blob: Blob, name: string, from: Format, to: Format) {
  let outputs = [{ name, format: from.id, blob }]
  for (const edge of router.route(from.id, to.id)!.edges) {
    // Whichever engine the registry names for the step that also runs in Node.
    const candidate = derived.edge(edge.from, edge.to)!.candidates.find((c) => c.engine in engines)!
    outputs = await engines[candidate.engine]!.convert({
      blob: outputs[0]!.blob,
      name,
      from: formatById(registry, edge.from)!,
      to: formatById(registry, edge.to)!,
      options: candidate.defaultOptions,
      maxPixels: MAX_PIXELS,
      signal: new AbortController().signal,
      onProgress: () => {},
    })
  }
  return outputs
}

/** A trap may fail, but it may not take the engine down with it. */
async function expectEngineStillWorks() {
  const good = await readFile(new URL('./png/sample.png', import.meta.url))
  const [output] = await convert(new Blob([good]), 'sample.png', png, webp)
  const found = await detect(output!.blob, registry.formats)
  expect(found.kind === 'known' && found.format.id).toBe('webp')
}

/**
 * Whatever a trap was, nothing in it ran. The code traps carry a payload that would leave one
 * of these marks if any part of it were ever executed; every trap is held to the same check.
 */
export function expectNoCodeRan() {
  expect((globalThis as { __omsett_canary?: unknown }).__omsett_canary, 'a payload set its mark').toBeUndefined()
  expect(({} as { polluted?: unknown }).polluted, 'every object was given a new property').toBeUndefined()
  expect(Object.keys(Object.prototype), 'the prototype every object shares was added to').toEqual([])
  expect(existsSync('/tmp/omsett-canary'), 'a command from a payload ran').toBe(false)
}

describe('trap files', () => {
  afterEach(expectNoCodeRan)

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
      const found = await detect(file, registry.formats, file.name)
      const identified = found.kind === 'known' ? found.format.id : found.kind
      if (switches[trap.detect]?.on === false) {
        // Its format is switched off: the file must be turned away before any engine sees it.
        expect(identified).toBe('unregistered')
        return
      }
      expect(identified, 'identified as').toBe(trap.detect)
      if (found.kind !== 'known') {
        expect(trap.node, 'an unidentified file reaches no engine').toBe('none')
        return
      }
      expect(nameDisagrees(file.name, found.format), 'name disagrees with contents').toBe(trap.mismatch)

      // 1b. Asking what the file holds never fails, whatever the file: a list comes back.
      expect(Array.isArray(await describeFile(file, found.format)), 'details are a list').toBe(true)

      // 2. The guard decides from the header alone, before anything is decoded.
      const refused = sizeProblem(file.size, found.dimensions) !== null
      expect(refused ? 'refused' : 'ok', 'size guard').toBe(trap.guard)
      if (refused) {
        expect(trap.node).toBe('none')
        return
      }

      // 3. Convert it to something it is not: WebP, or PNG if it is a WebP already; for data,
      //    JSON, or YAML if it is JSON already; for subtitles, SRT, or WebVTT.
      const from = found.format
      //    for Markdown and HTML, the other of the two; for fonts, WOFF, or TTF; for archives, ZIP, or TAR.
      const [usual, otherwise] =
        from.category === 'data' || from.category === 'spreadsheet'
          ? [json, yaml]
          : from.category === 'subtitle'
            ? [srt, vtt]
            : from.category === 'text'
              ? [md, html]
              : from.category === 'font'
                ? [woff, ttf]
                : from.category === 'archive'
                  ? [zip, tar]
                  : from.category === 'document' || from.category === 'presentation' || from.category === 'pdf'
                    ? [html, md]
                    : from.category === 'screenplay'
                      ? [fdx, fountain]
                    : [webp, png]
      const to = from.id === usual.id ? otherwise : usual
      if (!router.route(from.id, to.id)) {
        expect(trap.node, 'no route, so no engine').toBe('none')
        return
      }

      // 4. The engine either converts it properly or refuses it cleanly. Nothing in between:
      //    no hang, no crash, no output that is not what it claims to be.
      let outcome: 'succeeds' | 'fails'
      try {
        const outputs = await convert(file, file.name, from, to)
        expect(outputs).toHaveLength(1)
        // Markdown and Fountain are known by name alone, so for those two the name is given.
        const after = await detect(outputs[0]!.blob, registry.formats, ['md', 'fountain'].includes(to.id) ? outputs[0]!.name : undefined)
        expect(after.kind === 'known' && after.format.id, `output is really ${to.name}`).toBe(to.id)
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
        // Where the app must give a particular reason, the engine is where it comes from.
        if (trap.note && ['data', 'spreadsheet', 'subtitle', 'text', 'font', 'archive', 'document', 'presentation', 'screenplay', 'pdf'].includes(from.category)) expect((error as Error).message).toBe(trap.note)
      }
      expect(outcome, 'the engine').toBe(trap.node)

      await expectEngineStillWorks()
    }, 30_000)
  }
})
