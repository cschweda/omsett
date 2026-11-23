// The code traps, in every combination. Each carries the same adversarial payload wherever its
// format holds text (fixtures/_tools/make-traps.py, "code"). traps.test.ts converts each to one
// format; this converts each to every format its kind can become, so that what is written is
// tested against hostile input as thoroughly as what is read.
//
// For every pair, one of two things must happen: the conversion is refused with an ordinary
// error, or it produces a real file of the format asked for. Either way nothing in the payload
// ran, and a result that a browser would open holds no live script.
import { readFile } from 'node:fs/promises'
import { detect, MAX_PIXELS } from '@omsett/detect'
import { createNodeEngines } from '@omsett/engines/node'
import { createRouter, deriveEdges, formatById, registry, type Format } from '@omsett/registry'
import { afterEach, describe, expect, it } from 'vitest'
import manifest from './_traps/manifest.json'
import { expectNoCodeRan } from './traps.test'

const engines = createNodeEngines()
const router = createRouter(registry)
const derived = deriveEdges(registry)

async function convert(blob: Blob, name: string, from: Format, to: Format) {
  let outputs = [{ name, format: from.id, blob }]
  for (const edge of router.route(from.id, to.id)!.edges) {
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
  return outputs[0]!
}

/** Every real tag in a page. Text is escaped when it is written, so a "<" that opens a tag is a tag. */
const tagsOf = (html: string) => html.match(/<[a-z][^>]*>/gi) ?? []

/** A page a browser will open must hold nothing a browser will run. */
function expectNoLiveScript(format: string, text: string) {
  if (format === 'html') {
    for (const tag of tagsOf(text)) {
      expect(/^<(?:script|iframe|object|embed|form|base|link|meta http-equiv)/i.test(tag), tag).toBe(false)
      expect(/\son[a-z]+\s*=/i.test(tag), `a handler in ${tag}`).toBe(false)
      expect(/(?:java|vb)script:/i.test(tag), `a link that is code in ${tag}`).toBe(false)
    }
  }
  if (format === 'md') {
    // In Markdown a tag is live unless the "<" is escaped, and a link is live as written.
    expect(/(?<!\\)<(?:script|iframe|object|embed)/i.test(text), 'an unescaped tag').toBe(false)
    expect(/\]\(\s*(?:java|vb)script:/i.test(text), 'a link that is code').toBe(false)
  }
}

describe('code traps, to every format they can become', () => {
  afterEach(expectNoCodeRan)

  const traps = manifest.filter((trap) => trap.group === 'code' && formatById(registry, trap.detect))
  it('there is one for every kind of file Omsett reads', () => {
    const covered = new Set(traps.map((trap) => formatById(registry, trap.detect)!.category))
    const read = new Set(registry.capabilities.flatMap((c) => c.reads).map((id) => formatById(registry, id)!.category))
    expect([...covered].sort()).toEqual([...read].sort())
  })

  for (const trap of traps) {
    const from = formatById(registry, trap.detect)!
    const targets = router.targetsFor([from.id]).filter((target) => target.route)
    for (const { format: to } of targets) {
      it(`${trap.file} → ${to.name}`, async () => {
        const file = new File([await readFile(new URL(`./_traps/${trap.file}`, import.meta.url))], trap.file)
        let output: Awaited<ReturnType<typeof convert>>
        try {
          output = await convert(file, file.name, from, to)
        } catch (error) {
          // Refused, in the ordinary way. The check after every test still applies.
          expect(error).toBeInstanceOf(Error)
          return
        }
        // Identified as the app would identify it if it were dropped back in: by its contents,
        // with its name to settle the few plain-text formats that contents alone cannot (one
        // row of JSON Lines is JSON; one column of CSV is a list of words).
        const found = await detect(output.blob, registry.formats, output.name)
        expect(found.kind === 'known' && found.format.id, `the output is really ${to.name}`).toBe(to.id)
        if (to.id === 'html' || to.id === 'md') expectNoLiveScript(to.id, await output.blob.text())
      }, 60_000)
    }
  }
})
