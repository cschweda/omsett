import { subtitleInfo } from '../info'
import type { ConvertInput, ConvertOutput, Engine } from '../types'
import { outputName, Refusal, throwIfAborted } from '../util'
import { invalid, readCues } from './read'
import { writeCues } from './write'

// Subtitles and lyrics: SRT, WebVTT, ASS, SSA, TTML, LRC, SBV, SAMI and MicroDVD. Each is read
// into the same thing, lines of words with a start and an end, and written out from that. How
// the words looked is not carried: a subtitle that was yellow and at the top comes out plain.

/** Larger than this is not read as subtitles. A feature film's worth is well under 1 MB. */
const MAX_SUBTITLE_BYTES = 32 * 1024 * 1024

export function createSubtitleEngine(): Engine {
  return {
    ...subtitleInfo,
    available: async () => true,
    load: async () => {},
    async convert(input: ConvertInput): Promise<ConvertOutput[]> {
      throwIfAborted(input.signal)
      if (input.blob.size > MAX_SUBTITLE_BYTES) throw new Refusal('This file is too large to convert as subtitles')
      let text: string
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(await input.blob.arrayBuffer())
      } catch {
        throw new Refusal('This file is not text in UTF-8, the encoding Omsett reads subtitles in')
      }
      input.onProgress(0.2)

      let cues
      try {
        cues = await readCues(input.from.id, text)
      } catch (error) {
        // A parser's own complaint is written for programmers. The file's format is what to say.
        throw error instanceof Refusal ? error : invalid(input.from.name)
      }
      throwIfAborted(input.signal)
      input.onProgress(0.6)

      const written = writeCues(input.to.id, cues)
      input.onProgress(1)
      return [
        {
          name: outputName(input.name, input.to),
          format: input.to.id,
          blob: new Blob([written], { type: input.to.mime[0] }),
        },
      ]
    },
  }
}
