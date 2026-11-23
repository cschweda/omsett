import { fontInfo, fontWoff2Info } from '../info'
import type { ConvertInput, ConvertOutput, Engine, EngineInfo } from '../types'
import { outputName, Refusal, throwIfAborted } from '../util'
import { invalid, MAX_FONT_BYTES, POSTSCRIPT, readSfnt, readWoff, writeSfnt, writeWoff, type Font } from './sfnt'

// Fonts: TTF, OTF, WOFF and WOFF2. These are four wrappings of the same thing, a set of tables.
// Converting takes the tables out of one wrapping and puts them in another; no letter is
// redrawn. That is also the limit: a TTF holds one kind of outline and an OTF another, and
// turning one into the other is drawing, which this does not do.

/** Larger than this is not read as a font. */
const MAX_INPUT_BYTES = 32 * 1024 * 1024

async function read(format: string, bytes: Uint8Array, name: string): Promise<Font> {
  if (format === 'woff') return readWoff(bytes)
  if (format === 'woff2') {
    let unpacked: Uint8Array
    try {
      const { default: decompress } = await import('woff2-encoder/decompress')
      unpacked = await decompress(bytes)
    } catch {
      throw invalid(name)
    }
    if (unpacked.length === 0 || unpacked.length > MAX_FONT_BYTES) throw invalid(name)
    // The decoder writes checksums of its own, so they say nothing here; the shape still does.
    return readSfnt(unpacked, name)
  }
  return readSfnt(bytes, name)
}

async function write(format: string, font: Font): Promise<Uint8Array> {
  if (format === 'woff') return writeWoff(font)
  if (format === 'woff2') {
    const { compress } = await import('woff2-encoder')
    return compress(writeSfnt(font))
  }
  // A plain font file is named for the outlines inside it. One kind cannot be saved as the other.
  const postscript = font.flavor === POSTSCRIPT
  if (format === 'ttf' && postscript) {
    throw new Refusal('This font has PostScript outlines, so it unwraps to OTF, not TTF. Choose OTF.')
  }
  if (format === 'otf' && !postscript) {
    throw new Refusal('This font has TrueType outlines, so it unwraps to TTF, not OTF. Choose TTF.')
  }
  return writeSfnt(font)
}

function createEngine(info: EngineInfo): Engine {
  return {
    ...info,
    available: async () => typeof DecompressionStream !== 'undefined' && typeof CompressionStream !== 'undefined',
    load: async () => {},
    async convert(input: ConvertInput): Promise<ConvertOutput[]> {
      throwIfAborted(input.signal)
      if (input.blob.size > MAX_INPUT_BYTES) throw new Refusal('This font is too large to convert')
      const bytes = new Uint8Array(await input.blob.arrayBuffer())
      input.onProgress(0.2)
      let font: Font
      try {
        font = await read(input.from.id, bytes, input.from.name)
      } catch (error) {
        // Reading past the end of a file that lied about its size ends here too.
        throw error instanceof Refusal ? error : invalid(input.from.name)
      }
      throwIfAborted(input.signal)
      input.onProgress(0.6)
      const written = await write(input.to.id, font)
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

/** TTF, OTF and WOFF: Omsett's own code, nothing to fetch. */
export const createFontEngine = () => createEngine(fontInfo)
/** The same, for conversions that read or write WOFF2, which needs its own compressor. */
export const createFontWoff2Engine = () => createEngine(fontWoff2Info)
