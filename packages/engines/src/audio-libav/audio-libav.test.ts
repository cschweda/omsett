import { readFile } from 'node:fs/promises'
import { formatById, registry } from '@omsett/registry'
import { describe, expect, it } from 'vitest'
import { readSound } from '../audio'
import { createNodeEngines } from '../node'

// The long tail of sound, through Omsett's own build of libav.js. Every sample is written by
// ffmpeg from wav/sample.wav (fixtures/_tools/make-samples.sh), so the lossless ones must give
// back exactly its numbers, and the others its length.

const engine = createNodeEngines()['audio-libav']!
const fixture = async (path: string) => new Uint8Array(await readFile(new URL(`../../../../fixtures/${path}`, import.meta.url)))
async function convert(bytes: Uint8Array, from: string, to: string, options: Record<string, unknown> = {}) {
  const [output] = await engine.convert({
    blob: new Blob([bytes as BlobPart]),
    name: `sample.${from}`,
    from: formatById(registry, from)!,
    to: formatById(registry, to)!,
    options,
    signal: new AbortController().signal,
    onProgress: () => {},
  })
  return new Uint8Array(await output!.blob.arrayBuffer())
}
const numbers = (wav: Uint8Array) => {
  const { sound } = readSound('wav', wav)
  return { sound, data: wav.subarray(sound.at, sound.at + sound.frames * sound.channels * sound.bytes) }
}

describe('the long tail of sound', () => {
  it('unpacks what is kept whole to exactly the numbers it was made from', async () => {
    const original = numbers(await fixture('wav/sample.wav'))
    for (const [path, from] of [['m4a/alac.m4a', 'm4a'], ['wv/sample.wv', 'wv'], ['tta/sample.tta', 'tta']] as const) {
      const back = numbers(await convert(await fixture(path), from, 'wav'))
      expect([back.sound.rate, back.sound.channels, back.sound.frames], path).toEqual([original.sound.rate, original.sound.channels, original.sound.frames])
      expect(Buffer.from(back.data).equals(Buffer.from(original.data)), path).toBe(true)
    }
  })

  it('unpacks what leaves sound out to a sound of the same length, at its own rate', async () => {
    const original = numbers(await fixture('wav/sample.wav')).sound
    for (const [path, from] of [['m4a/sample.m4a', 'm4a'], ['aac/sample.aac', 'aac'], ['ac3/sample.ac3', 'ac3'], ['ac3/sample.eac3', 'ac3'], ['wma/sample.wma', 'wma'], ['ogg/sample.ogg', 'ogg'], ['opus/sample.opus', 'opus']] as const) {
      const { sound } = numbers(await convert(await fixture(path), from, 'wav'))
      expect(sound.channels, path).toBe(2)
      // Within a fifth of a second: a coder that leaves sound out pads its first and last frames,
      // AAC by some thousands of numbers, which a file without a container cannot say to trim.
      expect(Math.abs(sound.frames / sound.rate - original.frames / original.rate), path).toBeLessThan(0.2)
    }
  })

  it('packs whole and reads back exactly: WavPack and Apple Lossless', async () => {
    const wav = await fixture('wav/sample.wav')
    const original = numbers(wav)
    for (const to of ['wv', 'm4a']) {
      const back = numbers(await convert(await convert(wav, 'wav', to), to, 'wav'))
      expect(Buffer.from(back.data).equals(Buffer.from(original.data)), to).toBe(true)
    }
  })

  it('packs small as asked: Opus and Ogg Vorbis, smaller when asked for smaller, and as long as the original', async () => {
    const wav = await fixture('wav/sample.wav')
    const original = numbers(wav).sound
    for (const to of ['opus', 'ogg']) {
      const smaller = await convert(wav, 'wav', to, { soundQuality: 'smaller' })
      const best = await convert(wav, 'wav', to, { soundQuality: 'best' })
      expect(smaller.length, to).toBeLessThan(best.length)
      const { sound } = numbers(await convert(best, to, 'wav'))
      expect(Math.abs(sound.frames / sound.rate - original.frames / original.rate), to).toBeLessThan(0.1)
    }
  })

  it('carries no title, name or note across', async () => {
    for (const [path, from] of [['m4a/sample.m4a', 'm4a'], ['ogg/sample.ogg', 'ogg'], ['opus/sample.opus', 'opus'], ['wv/sample.wv', 'wv'], ['wma/sample.wma', 'wma']] as const) {
      const source = await fixture(path)
      // Written as plain letters, or two bytes to a letter, as WMA writes them.
      const tagged = (bytes: Uint8Array) => Buffer.from(bytes).includes('Test pattern') || Buffer.from(bytes).includes(Buffer.from('Test pattern', 'utf16le'))
      expect(tagged(source), `${path} is tagged`).toBe(true)
      for (const to of ['wav', 'opus', 'wv', 'm4a'].filter((target) => target !== from)) {
        expect(tagged(await convert(source, from, to)), `${path} → ${to}`).toBe(false)
      }
    }
  })
})
