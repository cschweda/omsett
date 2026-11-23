import { scriptInfo } from '../info'
import type { ConvertInput, ConvertOutput, Engine } from '../types'
import { outputName, Refusal, throwIfAborted } from '../util'
import { readDrafter, writeDrafter } from './drafter'
import { readFdx, writeFdx } from './fdx'
import { readFountain, writeFountain, type Script } from './fountain'

// Screenplays: Fountain, Final Draft (FDX) and the Drafter package. A script is read into its
// elements (scene headings, action, who speaks and what they say) and written from them.

/** Larger than this is not read as a script. A feature film is about 150 KB. */
const MAX_SCRIPT_BYTES = 16 * 1024 * 1024

export function createScriptEngine(): Engine {
  return {
    ...scriptInfo,
    available: async () => typeof DecompressionStream !== 'undefined' && typeof crypto?.subtle !== 'undefined',
    load: async () => {},
    async convert(input: ConvertInput): Promise<ConvertOutput[]> {
      throwIfAborted(input.signal)
      if (input.blob.size > MAX_SCRIPT_BYTES) throw new Refusal('This script is too large to convert in a browser')
      const bytes = new Uint8Array(await input.blob.arrayBuffer())
      const decode = () => {
        try {
          return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
        } catch {
          throw new Refusal('This file is not text in UTF-8, the encoding Omsett reads scripts in')
        }
      }
      input.onProgress(0.2)

      const [from, to] = [input.from.id, input.to.id]
      let written: string | Uint8Array
      // A package holds its script as Fountain already: taking it out changes nothing in it.
      if (from === 'drafter' && to === 'fountain') written = await readDrafter(bytes)
      else {
        const source = from === 'drafter' ? await readDrafter(bytes) : decode()
        const script: Script = from === 'fdx' ? await readFdx(source) : readFountain(source)
        if (script.elements.length === 0) throw new Refusal('This script has nothing in it to convert')
        const value = (key: string) => script.title.find((entry) => entry.key.toLowerCase() === key)?.value.replace(/[*_]/g, '')
        if (to === 'fdx') written = writeFdx(script)
        else if (to === 'fountain') written = writeFountain(script)
        // Into a package, a Fountain script goes as it was written, not as Omsett would write it.
        else if (to === 'drafter') written = await writeDrafter(from === 'fountain' ? source : writeFountain(script), input.name, { title: value('title'), author: value('author') ?? value('authors') })
        else throw new Error(`The script engine does not convert ${from} to ${to}`)
      }
      throwIfAborted(input.signal)
      input.onProgress(1)
      return [
        {
          name: outputName(input.name, input.to),
          format: input.to.id,
          blob: new Blob([written as BlobPart], { type: input.to.mime[0] }),
        },
      ]
    },
  }
}
