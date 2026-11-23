// One format's sample, damaged in a few hundred deliberate ways, each converted. Run in a
// process of its own, started and watched by fixtures/fuzz.test.ts: a conversion that never
// returns can only be stopped from outside.
//
// Which format, where to begin and where to write progress come from the environment
// (OMSETT_FUZZ_FORMAT, OMSETT_FUZZ_FIRST, OMSETT_FUZZ_LOG). One line of JSON is written for each
// variant as it starts and as it ends.
import { appendFileSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { detect, MAX_PIXELS, sizeProblem } from '@omsett/detect'
import { createNodeEngines } from '@omsett/engines/node'
import { createRouter, deriveEdges, formatById, registry, type Format } from '@omsett/registry'
import { variantsOf } from './fuzz-variants'
import { it } from 'vitest'

const formatId = process.env.OMSETT_FUZZ_FORMAT!
const first = process.env.OMSETT_FUZZ_FIRST ?? '0'
const log = process.env.OMSETT_FUZZ_LOG!
const from = formatById(registry, formatId)!
const engines = createNodeEngines()
const router = createRouter(registry)
const derived = deriveEdges(registry)
// The first format this one can become: what the app shows first.
const to = router.targetsFor([from.id]).find((target) => target.route)!.format

async function convert(blob: Blob, source: Format): Promise<Blob> {
  let current = blob
  for (const edge of router.route(source.id, to.id)!.edges) {
    const candidate = derived.edge(edge.from, edge.to)!.candidates.find((c) => c.engine in engines)!
    const outputs = await engines[candidate.engine]!.convert({
      blob: current,
      name: `fuzz.${source.extensions[0]}`,
      from: formatById(registry, edge.from)!,
      to: formatById(registry, edge.to)!,
      options: candidate.defaultOptions,
      maxPixels: MAX_PIXELS,
      signal: new AbortController().signal,
      onProgress: () => {},
    })
    current = outputs[0]!.blob
  }
  return current
}

it(`fuzz ${formatId} from ${first}`, async () => {
  const dir = new URL(`../${from.id}/`, import.meta.url)
  const name = (await readdir(dir)).find((file) => file.startsWith('sample.'))!
  const sample = new Uint8Array(await readFile(new URL(name, dir)))
  const say = (line: Record<string, unknown>) => appendFileSync(log, `${JSON.stringify(line)}\n`)

  const variants = variantsOf(sample)
  for (let index = Number(first); index < variants.length; index++) {
    const variant = variants[index]!
    say({ start: index, what: variant.what })
    const blob = new Blob([variant.bytes as BlobPart])
    let outcome: string
    try {
      const found = await detect(blob, registry.formats, name)
      // Damaged past recognising, or into something else: turned away before any engine.
      if (found.kind !== 'known' || found.format.id !== from.id) outcome = 'not-recognised'
      else if (sizeProblem(blob.size, found.dimensions) !== null) outcome = 'refused-by-size'
      else {
        const output = await convert(blob, from)
        const after = await detect(output, registry.formats, `fuzz.${to.extensions[0]}`)
        outcome = after.kind === 'known' && after.format.id === to.id && output.size > 0 ? 'converted' : 'bad-output'
      }
    } catch (error) {
      outcome = error instanceof Error ? 'refused' : 'threw-something-that-is-not-an-error'
    }
    say({ end: index, outcome })
    // Every so often, and after anything was refused inside an engine, the sound sample must
    // still convert. If it does not, the damaged file took the engine down with it.
    if (index % 25 === 24 || index === variants.length - 1) {
      const alive = await convert(new Blob([sample as BlobPart]), from).then(
        () => true,
        () => false,
      )
      if (!alive) {
        say({ dead: index })
        return
      }
    }
  }
  say({ done: variants.length, to: to.id })
}, 10 * 60_000)
