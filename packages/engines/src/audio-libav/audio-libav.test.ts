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

/** A WAV of a rising and falling line in two channels, as 32-bit whole numbers or 32-bit fractions. */
function madeWav(kind: 'int32' | 'float', frames = 4000): Uint8Array {
  const out = new Uint8Array(44 + frames * 8)
  const view = new DataView(out.buffer)
  const tag = (at: number, text: string) => [...text].forEach((letter, i) => (out[at + i] = letter.charCodeAt(0)))
  tag(0, 'RIFF')
  view.setUint32(4, 36 + frames * 8, true)
  tag(8, 'WAVEfmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, kind === 'float' ? 3 : 1, true)
  view.setUint16(22, 2, true)
  view.setUint32(24, 44100, true)
  view.setUint32(28, 44100 * 8, true)
  view.setUint16(32, 8, true)
  view.setUint16(34, 32, true)
  tag(36, 'data')
  view.setUint32(40, frames * 8, true)
  for (let i = 0; i < frames * 2; i++) {
    const wave = Math.sin(i / 7) * 0.9
    // Whole numbers that use every bit, down to the last: odd numbers, all of them.
    if (kind === 'int32') view.setInt32(44 + i * 4, Math.round(wave * 2 ** 30) * 2 + 1, true)
    else view.setFloat32(44 + i * 4, wave, true)
  }
  return out
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

  it('keeps fractions exactly in WavPack, and refuses fractions and 32-bit numbers for Apple Lossless, which would change them', async () => {
    const float = madeWav('float')
    const original = numbers(float)
    const back = numbers(await convert(await convert(float, 'wav', 'wv'), 'wv', 'wav'))
    expect(back.sound.coding).toBe(original.sound.coding)
    expect(Buffer.from(back.data).equals(Buffer.from(original.data))).toBe(true)
    await expect(convert(float, 'wav', 'm4a')).rejects.toThrow(/fractions/)
    await expect(convert(madeWav('int32'), 'wav', 'm4a')).rejects.toThrow(/32 bits/)
  })

  it('writes 32-bit numbers into WavPack, and refuses to read them back, in words that say why', async () => {
    // FFmpeg's reader fails its own check on such a file. The reference tool accepts what is
    // written here (`wvunpack -v`, run by hand); Omsett will not read it without that check.
    const packed = await convert(madeWav('int32'), 'wav', 'wv')
    await expect(convert(packed, 'wv', 'wav')).rejects.toThrow(/32-bit whole numbers, which Omsett cannot yet check/)
  })

  it('goes on converting after refusals, with nothing left behind to spoil the next', async () => {
    const wav = await fixture('wav/sample.wav')
    const cut = (await fixture('ogg/sample.ogg')).slice(0, 3430)
    for (let i = 0; i < 20; i++) {
      await expect(convert(madeWav('float'), 'wav', 'm4a')).rejects.toThrow()
      await expect(convert(cut, 'ogg', 'wav')).rejects.toThrow()
      await expect(convert(new Uint8Array(100), 'm4a', 'wav')).rejects.toThrow()
    }
    expect(numbers(await convert(await convert(wav, 'wav', 'wv'), 'wv', 'wav')).data.length).toBe(numbers(wav).data.length)
  })

  it('writes nothing about the program that wrote it', async () => {
    const wav = await fixture('wav/sample.wav')
    for (const to of ['opus', 'ogg', 'wv', 'm4a']) {
      expect(Buffer.from(await convert(wav, 'wav', to)).toString('latin1'), to).not.toMatch(/Lavf|Lavc|encoder/i)
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
