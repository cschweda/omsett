import { readFile } from 'node:fs/promises'
import { formatById, registry } from '@omsett/registry'
import { describe, expect, it } from 'vitest'
import { describeFile } from '../details'
import { createNodeEngines } from '../node'
import { createAudioEngine, readFlac, readSound, unpackFlac, type Read } from './index'
import { recode, type Layout } from './sound'

// Sound stored unpacked is numbers, and a conversion between two such formats must hand back
// the same numbers. So these tests do not listen: they read every number out of what was
// written and compare it with what went in.

const SOUNDS = ['wav', 'aiff', 'au']
const engine = createAudioEngine()
const sample = async (path: string) => new Uint8Array(await readFile(new URL(`../../../../fixtures/${path}`, import.meta.url)))

async function convert(bytes: Uint8Array, from: string, to: string, name = `sound.${from}`) {
  const [output] = await engine.convert({
    blob: new Blob([bytes as BlobPart]),
    name,
    from: formatById(registry, from)!,
    to: formatById(registry, to)!,
    options: {},
    signal: new AbortController().signal,
    onProgress: () => {},
  })
  return { ...output!, bytes: new Uint8Array(await output!.blob.arrayBuffer()) }
}

/** Every number in a sound file, in order, as the number it is. */
function numbers(format: string, bytes: Uint8Array): { read: Read; values: number[] } {
  const read = readSound(format, bytes)
  const { sound } = read
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const values: number[] = []
  for (let i = 0; i < sound.frames * sound.channels; i++) {
    const at = sound.at + i * sound.bytes
    if (sound.coding === 'float') values.push(sound.bytes === 4 ? view.getFloat32(at, sound.little) : view.getFloat64(at, sound.little))
    else if (sound.coding === 'uint') values.push(bytes[at]! - 128)
    else if (sound.coding === 'int') {
      let value = 0
      for (let b = 0; b < sound.bytes; b++) value += bytes[at + (sound.little ? b : sound.bytes - 1 - b)]! * 2 ** (8 * b)
      values.push(value >= 2 ** (8 * sound.bytes - 1) ? value - 2 ** (8 * sound.bytes) : value)
    } else values.push(bytes[at]!)
  }
  return { read, values }
}

/** Bytes that are not a pattern: every value a byte can take, in no order. */
function noise(length: number, seed = 7): Uint8Array {
  const out = new Uint8Array(length)
  let state = seed
  for (let i = 0; i < length; i++) {
    state = (Math.imul(state, 1103515245) + 12345) >>> 0
    out[i] = state >>> 16
  }
  return out
}

/** A sound file made by the engine itself from raw numbers, by way of an AU, which holds every layout but one. */
function au(data: Uint8Array, how: number, channels: number, rate = 48000): Uint8Array {
  const head = new Uint8Array(24)
  const view = new DataView(head.buffer)
  head.set([0x2E, 0x73, 0x6E, 0x64])
  ;[24, data.length, how, rate, channels].forEach((value, i) => view.setUint32(4 + i * 4, value))
  return Uint8Array.from([...head, ...data])
}

describe('sound, there and back', () => {
  // AU's numbers for each layout: whole numbers of one to four bytes, fractions of four and eight.
  const layouts: Array<[string, number, number]> = [['8-bit', 2, 1], ['16-bit', 3, 2], ['24-bit', 4, 3], ['32-bit', 5, 4], ['32-bit fractions', 6, 4], ['64-bit fractions', 7, 8]]
  for (const [name, how, width] of layouts) {
    for (const channels of [1, 2, 5]) {
      it(`${name}, ${channels} channel${channels > 1 ? 's' : ''}: every number survives every route`, async () => {
        // Fractions that are not numbers at all (NaN) do not compare; whole numbers get every value.
        const data = how >= 6 ? fractions(width, 999 * channels) : noise(width * channels * 999)
        const source = au(data, how, channels)
        const first = numbers('au', source).values
        expect(first).toHaveLength(999 * channels)
        for (const middle of ['wav', 'aiff']) {
          const there = await convert(source, 'au', middle)
          expect(numbers(middle, there.bytes).values, `au → ${middle}`).toEqual(first)
          for (const last of SOUNDS.filter((id) => id !== middle)) {
            const back = await convert(there.bytes, middle, last)
            const found = numbers(last, back.bytes)
            expect(found.values, `au → ${middle} → ${last}`).toEqual(first)
            expect([found.read.sound.channels, found.read.sound.rate, found.read.sound.bytes]).toEqual([channels, 48000, width])
          }
        }
      })
    }
  }

  function fractions(width: number, count: number): Uint8Array {
    const out = new Uint8Array(width * count)
    const view = new DataView(out.buffer)
    const raw = noise(count * 2)
    for (let i = 0; i < count; i++) {
      const value = ((raw[i * 2]! << 8) | raw[i * 2 + 1]!) / 32768 - 1 + (i % 7 === 0 ? 1e-7 : 0)
      if (width === 4) view.setFloat32(i * 4, value)
      else view.setFloat64(i * 8, value)
    }
    return out
  }

  it('gives back the very file after a trip through both other formats', async () => {
    const source = au(noise(4 * 1000), 3, 2)
    const wav = await convert(source, 'au', 'wav')
    const aiff = await convert(wav.bytes, 'wav', 'aiff')
    const back = await convert(aiff.bytes, 'aiff', 'au')
    // The AU written has four bytes of empty note after its six numbers; the sound is the same.
    expect([...back.bytes.subarray(28)]).toEqual([...source.subarray(24)])
  })

  it('holds the same sound in all three samples, and each becomes the others exactly', async () => {
    const samples = { wav: await sample('wav/sample.wav'), aiff: await sample('aiff/sample.aiff'), au: await sample('au/sample.au') }
    const expected = numbers('wav', samples.wav).values
    // The pattern opens with the loudest and quietest numbers sixteen bits hold.
    expect(expected.slice(0, 8)).toEqual([32767, -32768, -32768, 32767, 0, 0, 1, -1])
    for (const [from, bytes] of Object.entries(samples)) {
      expect(numbers(from, bytes).values, from).toEqual(expected)
      for (const to of SOUNDS.filter((id) => id !== from)) expect(numbers(to, (await convert(bytes, from, to)).bytes).values, `${from} → ${to}`).toEqual(expected)
    }
  })

  it('writes a single byte without a sign in WAV and with one elsewhere, as each format requires', async () => {
    const wav = await sample('wav/one-byte.wav')
    const expected = numbers('wav', wav).values
    expect(Math.min(...expected)).toBeLessThan(-100)
    for (const to of ['aiff', 'au']) {
      const made = numbers(to, (await convert(wav, 'wav', to)).bytes)
      expect(made.read.sound.coding).toBe('int')
      expect(made.values).toEqual(expected)
    }
    const mac = await sample('aiff/old-mac.aiff')
    const made = numbers('wav', (await convert(mac, 'aiff', 'wav')).bytes)
    expect(made.read.sound.coding).toBe('uint')
    expect(made.values).toEqual(numbers('aiff', mac).values)
  })
})

describe('Wave64, RF64 and BW64: WAV with room for longer lengths', () => {
  it('reads RF64 and BW64 as the WAV they are, to the very numbers of the WAV they were made from', async () => {
    const original = numbers('wav', await sample('wav/sample.wav')).values
    for (const path of ['wav/rf64.wav', 'wav/bw64.wav']) expect(numbers('wav', await sample(path)).values, path).toEqual(original)
  })

  it('writes Wave64 byte for byte as ffmpeg does, and reads it back to the same numbers', async () => {
    // fixtures/w64/sample.w64 is ffmpeg's, from wav/sample.wav (make-samples.sh).
    const wav = await sample('wav/sample.wav')
    const written = await convert(wav, 'wav', 'w64')
    expect(Buffer.from(written.bytes).equals(Buffer.from(await sample('w64/sample.w64')))).toBe(true)
    expect(numbers('w64', written.bytes).values).toEqual(numbers('wav', wav).values)
    expect(numbers('wav', (await convert(written.bytes, 'w64', 'wav')).bytes).values).toEqual(numbers('wav', wav).values)
  })

  it('goes to AIFF and back with not a number changed, fractions, single bytes and many channels included', async () => {
    for (const path of ['wav/fractions.wav', 'wav/six-channels.wav', 'wav/three-bytes.wav', 'wav/one-byte.wav']) {
      const wav = await sample(path)
      const back = await convert((await convert(wav, 'wav', 'w64')).bytes, 'w64', 'aiff')
      expect(numbers('wav', (await convert(back.bytes, 'aiff', 'w64').then((w64) => convert(w64.bytes, 'w64', 'wav'))).bytes).values, path).toEqual(numbers('wav', wav).values)
    }
  })

  it('refuses an RF64 without its table of lengths, and one whose table says more than the file holds', async () => {
    const rf64 = await sample('wav/rf64.wav')
    const untabled = rf64.slice()
    untabled.set([0x4A, 0x55, 0x4E, 0x4B], 12) // "JUNK" where "ds64" was
    expect(() => readSound('wav', untabled)).toThrow('This file is not a valid WAV file')
    const longer = rf64.slice()
    new DataView(longer.buffer).setBigUint64(28, 1n << 40n, true) // the sound's length, in the table
    expect(() => readSound('wav', longer)).toThrow(/cut short/)
  })

  it('refuses a Wave64 cut short, and one whose part lengths cannot be followed', async () => {
    const w64 = await sample('w64/sample.w64')
    expect(() => readSound('w64', w64.subarray(0, w64.length - 100))).toThrow(/cut short/)
    const zero = w64.slice()
    new DataView(zero.buffer).setBigUint64(40 + 16, 3n, true) // a part shorter than its own head
    expect(() => readSound('w64', zero)).toThrow('This file is not a valid Wave64 file')
    const huge = w64.slice()
    new DataView(huge.buffer).setBigUint64(40 + 16, 1n << 62n, true)
    expect(() => readSound('w64', huge)).toThrow('This file is not a valid Wave64 file')
  })
})

describe('telephone codes', () => {
  it('unpacks each of the 256 codes to the 16-bit number the standard gives for it', () => {
    const codes = Uint8Array.from({ length: 256 }, (_, code) => code)
    const unpack = (coding: Layout['coding']) => [...new Int16Array(recode(codes, { coding, bytes: 1, little: true }, { coding: 'int', bytes: 2, little: true }).buffer)]
    const ulaw = unpack('ulaw')
    // G.711: the loudest and quietest codes, and the two that both mean silence.
    expect([ulaw[0x00], ulaw[0x80], ulaw[0x7F], ulaw[0xFF], ulaw[0x01], ulaw[0xFE]]).toEqual([-32124, 32124, 0, 0, -31100, 8])
    const alaw = unpack('alaw')
    expect([alaw[0x2A], alaw[0xAA], alaw[0x55], alaw[0xD5], alaw[0x54]]).toEqual([-32256, 32256, -8, 8, -24])
    // Each side of silence mirrors the other, and no two codes of one sign share a number.
    for (const table of [ulaw, alaw]) {
      for (let code = 0; code < 128; code++) expect(table[code]! + table[code + 128]!, String(code)).toBe(0)
      expect(new Set(table.slice(128)).size).toBe(128)
    }
  })

  it('writes 16-bit sound, and says so', async () => {
    for (const [path, from, law] of [['au/telephone.au', 'au', 'µ-law'], ['au/a-law.au', 'au', 'A-law'], ['wav/telephone.wav', 'wav', 'µ-law']] as const) {
      const bytes = await sample(path)
      for (const to of SOUNDS.filter((id) => id !== from)) {
        const made = await convert(bytes, from, to)
        const { read, values } = numbers(to, made.bytes)
        expect([read.sound.coding, read.sound.bytes, read.sound.channels]).toEqual(['int', 2, 1])
        expect(values).toHaveLength(numbers(from, bytes).values.length)
        expect(Math.max(...values)).toBeGreaterThan(20000)
        expect(made.note).toContain(`stored in ${law}`)
      }
    }
  })
})

describe('what a sound file says about itself', () => {
  it('keeps a rate with a fraction where the format can state one, and says when it cannot', async () => {
    const mac = await sample('aiff/old-mac.aiff')
    expect(readSound('aiff', mac).sound.rate).toBeCloseTo(22254.54545, 4)
    const wav = await convert(mac, 'aiff', 'wav')
    expect(readSound('wav', wav.bytes).sound.rate).toBe(22255)
    expect(wav.note).toBe("The file's rate, 22,254.545 a second, has a fraction. WAV states whole numbers, so it is written as 22,255.")
    // A whole rate goes into AIFF and comes out the same, whatever it is.
    for (const rate of [1, 8000, 11025, 44100, 48000, 96000, 192000, 352800, 4_000_000]) {
      const made = await convert(au(noise(64), 3, 1, rate), 'au', 'aiff')
      expect(readSound('aiff', made.bytes).sound.rate, String(rate)).toBe(rate)
      expect(made.note).toBeUndefined()
    }
  })

  it('says that channels beyond two are kept in order and not named', async () => {
    const six = await sample('wav/six-channels.wav')
    const made = await convert(six, 'wav', 'aiff')
    expect(made.note).toMatch(/^This sound has 6 channels\. They are written in the order the file had them\./)
    // And back to WAV, where more than two channels take the longer label.
    const back = await convert(made.bytes, 'aiff', 'wav')
    expect(new DataView(back.bytes.buffer).getUint16(20, true)).toBe(0xFFFE)
    expect(numbers('wav', back.bytes).values).toEqual(numbers('wav', six).values)
  })

  it('leaves a title, an artist and a comment behind', async () => {
    for (const [path, from] of [['wav/sample.wav', 'wav'], ['aiff/sample.aiff', 'aiff'], ['au/sample.au', 'au']] as const) {
      const bytes = await sample(path)
      expect(new TextDecoder('latin1').decode(bytes)).toContain('Test pattern')
      for (const to of SOUNDS.filter((id) => id !== from)) {
        expect(new TextDecoder('latin1').decode((await convert(bytes, from, to)).bytes), `${from} → ${to}`).not.toMatch(/Test pattern|Omsett|sound\.py/)
      }
    }
  })

  it('lists them beforehand, with how long the sound is and how it is stored', async () => {
    const details = await describeFile(new Blob([(await sample('wav/sample.wav')) as BlobPart]), formatById(registry, 'wav')!)
    expect(details).toEqual([
      { label: 'Length', value: '0.25 seconds', fate: 'kept' },
      { label: 'Rate', value: '11,025 samples a second', fate: 'kept' },
      { label: 'Channels', value: '2 (stereo)', fate: 'kept' },
      { label: 'Stored as', value: '16-bit whole numbers', fate: 'kept' },
      { label: 'Title', value: 'Test pattern', fate: 'removed' },
      { label: 'Artist', value: 'Omsett', fate: 'removed' },
      { label: 'Made with', value: 'fixtures/_tools/sound.py', fate: 'removed' },
    ])
    const phone = await describeFile(new Blob([(await sample('au/telephone.au')) as BlobPart]), formatById(registry, 'au')!)
    expect(phone.map((detail) => detail.value)).toEqual(['0.34 seconds', '8,000 samples a second', '1 (mono)', 'µ-law, a telephone code of 8 bits. It is unpacked to 16-bit numbers'])
    expect((await describeFile(new Blob([(await sample('aiff/sample.aiff')) as BlobPart]), formatById(registry, 'aiff')!)).at(-1)).toEqual({ label: 'Title', value: 'Test pattern', fate: 'removed' })
  })

  it('reads a long recording from its first part alone', async () => {
    // An hour of sound, of which only the label is held: the lengths are checked against the whole.
    const head = (await sample('wav/sample.wav')).slice(0, 44)
    new DataView(head.buffer).setUint32(40, 3600 * 11025 * 4, true)
    const { sound } = readSound('wav', head, 44 + 3600 * 11025 * 4)
    expect(sound.frames / sound.rate).toBe(3600)
    expect(() => readSound('wav', head, 44 + 3600 * 11025 * 4 - 1)).toThrow('more sound than the file has')
  })
})

describe('sound files that are refused', () => {
  const refusal = async (bytes: Uint8Array, from: string) => convert(bytes, from, from === 'wav' ? 'aiff' : 'wav').then(() => 'converted', (error: Error) => `${error.name}: ${error.message}`)

  it('refuses a file cut short, in each format', async () => {
    for (const [path, from, name] of [['wav/sample.wav', 'wav', 'WAV'], ['aiff/sample.aiff', 'aiff', 'AIFF'], ['au/sample.au', 'au', 'AU']] as const) {
      const bytes = await sample(path)
      expect(await refusal(bytes.slice(0, bytes.length >> 1), from)).toBe(`Refusal: This ${name} says it holds more sound than the file has. It may have been cut short`)
    }
  })

  it('refuses sound that is packed, and names the packing where it knows it', async () => {
    const wav = await sample('wav/sample.wav')
    new DataView(wav.buffer).setUint16(20, 0x55, true)
    expect(await refusal(wav, 'wav')).toBe('Refusal: This WAV holds its sound as MP3, which Omsett cannot read yet. It reads sound that is stored unpacked')
    new DataView(wav.buffer).setUint16(20, 0x1234, true)
    expect(await refusal(wav, 'wav')).toBe('Refusal: This WAV holds its sound packed, which Omsett cannot read yet. It reads sound that is stored unpacked')
    const au = await sample('au/sample.au')
    new DataView(au.buffer).setUint32(12, 23)
    expect(await refusal(au, 'au')).toBe('Refusal: This AU holds its sound as ADPCM, which Omsett cannot read yet. It reads sound that is stored unpacked')
    const aifc = await sample('aiff/smallest-first.aifc')
    aifc.set([...'ima4'].map((letter) => letter.charCodeAt(0)), 12 + 12 + 8 + 18)
    expect(await refusal(aifc, 'aiff')).toBe('Refusal: This AIFF holds its sound as ADPCM, which Omsett cannot read yet. It reads sound that is stored unpacked')
  })

  it('refuses channels, rates and lengths no sound has', async () => {
    const wav = async (change: (view: DataView) => void) => {
      const bytes = await sample('wav/sample.wav')
      change(new DataView(bytes.buffer))
      return refusal(bytes, 'wav')
    }
    const invalid = 'Refusal: This file is not a valid WAV file'
    expect(await wav((view) => view.setUint32(24, 0, true)), 'no rate').toBe(invalid)
    expect(await wav((view) => view.setUint32(24, 0xFFFFFFFF, true)), 'an absurd rate').toBe(invalid)
    expect(await wav((view) => view.setUint16(22, 0, true)), 'no channels').toBe(invalid)
    expect(await wav((view) => view.setUint16(32, 3, true)), 'a moment that is not its channels times its bytes').toBe(invalid)
    expect(await wav((view) => view.setUint16(34, 0, true)), 'no bits').toBe(invalid)
    expect(await wav((view) => view.setUint16(34, 64, true)), 'whole numbers of 64 bits').toBe(invalid)
    expect(await wav((view) => view.setUint32(40, 3, true)), 'less than one moment of sound').toBe('Refusal: This WAV has no sound in it')
    const many = au(noise(400), 2, 200)
    expect(await refusal(many, 'au')).toBe('Refusal: This AU says it has 200 channels of sound. Omsett reads up to 64')
  })

  it('refuses anything else it cannot follow as not valid, and never throws another kind of error', async () => {
    for (const [from, name] of [['wav', 'WAV'], ['aiff', 'AIFF'], ['au', 'AU']] as const) {
      const bytes = await sample(`${from}/sample.${from}`)
      for (let at = 4; at < 64; at++) {
        for (const value of [0x00, 0x7F, 0x80, 0xFF]) {
          const damaged = bytes.slice()
          damaged[at] = value
          const outcome = await refusal(damaged, from)
          expect(outcome === 'converted' || outcome.startsWith('Refusal: '), `${name} byte ${at} = ${value}: ${outcome}`).toBe(true)
        }
      }
      expect(await refusal(new Uint8Array(3), from)).toBe(`Refusal: This file is not a valid ${name} file`)
    }
  })
})

describe('FLAC: sound packed and unpacked without loss', () => {
  /** Every number in a FLAC, by unpacking it. */
  const unpacked = (bytes: Uint8Array) => {
    const { sound, data } = unpackFlac(bytes)
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
    const values: number[] = []
    for (let at = 0; at < data.length; at += sound.bytes) {
      values.push(sound.bytes === 1 ? view.getInt8(at) : sound.bytes === 2 ? view.getInt16(at, true) : sound.bytes === 3 ? (view.getInt8(at + 2) << 16) | view.getUint16(at, true) : view.getInt32(at, true))
    }
    return { sound, values }
  }

  // Sound a packer finds easy, and sound it cannot pack at all: every kind must come back whole.
  const kinds: Record<string, (i: number, c: number, top: number) => number> = {
    'a note': (i, c, top) => Math.round(top * 0.8 * Math.sin(i / (9 + c * 4))),
    'noise': (i, c, top) => Math.floor(((Math.imul(i * 8 + c + 1, 2654435761) >>> 0) / 2 ** 32) * 2 * top - top),
    'silence': () => 0,
    'one number throughout': (_, c) => 1234 - c,
    'the loudest and the quietest by turns': (i, c, top) => ((i + c) % 2 ? top - 1 : -top),
    'quiet with one loud click': (i, _, top) => (i === 5000 ? top - 1 : i % 3) ,
    'numbers that all end in zeros': (i, c, top) => (Math.round(top * 0.5 * Math.sin(i / 20 + c)) >> 6) << 6,
  }
  for (const [width, how] of [[1, 2], [2, 3], [3, 4], [4, 5]] as const) {
    for (const channels of [1, 2, 3, 8]) {
      it(`${width * 8}-bit, ${channels} channel${channels > 1 ? 's' : ''}: every number comes back, whatever the sound`, async () => {
        const top = 2 ** (width * 8 - 1)
        // Long enough for three stretches, the last of them short.
        const frames = 4096 * 2 + 777
        for (const [name, make] of Object.entries(kinds)) {
          const data = new Uint8Array(frames * channels * width)
          const expected: number[] = []
          for (let i = 0; i < frames; i++) {
            for (let c = 0; c < channels; c++) {
              // Adding nothing turns the minus-nothing that rounding can give into plain nothing.
              const value = Math.max(-top, Math.min(top - 1, make(i, c, top))) + 0
              expected.push(value)
              for (let b = 0; b < width; b++) data[(i * channels + c) * width + b] = Math.floor(value / 2 ** (8 * (width - 1 - b))) & 0xFF
            }
          }
          const flac = await convert(au(data, how, channels), 'au', 'flac')
          const found = unpacked(flac.bytes)
          expect(found.values, name).toEqual(expected)
          expect([found.sound.channels, found.sound.rate, found.sound.bytes, found.sound.frames], name).toEqual([channels, 48000, width, frames])
          // Packed sound is never larger than the sound itself, bar a few bytes to a stretch.
          expect(flac.bytes.length, `${name}: size`).toBeLessThan(data.length + 42 + 3 * (16 + channels * 2))
          if (name !== 'noise' && name !== 'the loudest and the quietest by turns') expect(flac.bytes.length, `${name}: smaller`).toBeLessThan(data.length * 0.75)
        }
      })
    }
  }

  it('unpacks files made by the reference packer and by ffmpeg to the numbers they were made from', async () => {
    const from = async (path: string, format: string) => numbers(format, await sample(path)).values
    const sixteen = await from('wav/sample.wav', 'wav')
    for (const name of ['sample', 'fixed-rules', 'from-ffmpeg']) expect(unpacked(await sample(`flac/${name}.flac`)).values, name).toEqual(sixteen)
    expect(unpacked(await sample('flac/three-bytes.flac')).values).toEqual(await from('wav/three-bytes.wav', 'wav'))
    expect(unpacked(await sample('flac/one-byte.flac')).values).toEqual(await from('wav/one-byte.wav', 'wav'))
    expect(unpacked(await sample('flac/six-channels.flac')).values).toEqual(await from('wav/six-channels.wav', 'wav'))
  })

  it('goes to and from every other format with not a number changed', async () => {
    const flac = await sample('flac/sample.flac')
    const expected = unpacked(flac).values
    for (const to of SOUNDS) {
      const there = await convert(flac, 'flac', to)
      expect(numbers(to, there.bytes).values, `flac → ${to}`).toEqual(expected)
      const back = await convert(there.bytes, to, 'flac')
      expect(unpacked(back.bytes).values, `flac → ${to} → flac`).toEqual(expected)
    }
  })

  it('signs what it packs: the checksum in the file is the checksum of the sound', async () => {
    const { createHash } = await import('node:crypto')
    const wav = await sample('wav/three-bytes.wav')
    const flac = await convert(wav, 'wav', 'flac')
    const sound = wav.subarray(44, 44 + new DataView(wav.buffer).getUint32(40, true))
    expect(Buffer.from(flac.bytes.subarray(26, 42)).toString('hex')).toBe(createHash('md5').update(sound).digest('hex'))
    // And a reader that checks it is given something to check: change one number and it fails.
    const changed = flac.bytes.slice()
    changed[30]! ^= 1
    await expect(convert(changed, 'flac', 'wav')).rejects.toThrow('the sound it unpacks to is not the sound its checksum was made from')
  })

  it('writes fractions as the nearest 24-bit numbers, and says so', async () => {
    const wav = await sample('wav/fractions.wav')
    const flac = await convert(wav, 'wav', 'flac')
    expect(flac.note).toMatch(/^The sound was stored as fractions, which FLAC cannot hold\. It is written as 24-bit whole numbers/)
    const found = unpacked(flac.bytes)
    expect(found.sound.bytes).toBe(3)
    const source = numbers('wav', wav).values
    // The sample's fractions are sixteen-bit numbers over 32,768, so here the 24-bit numbers are exact.
    expect(found.values).toEqual(source.map((value) => Math.max(-8388608, Math.min(8388607, Math.round(value * 8388608)))))
    // Too loud, too quiet and not a number at all are each given the nearest number there is.
    const odd = new Uint8Array(16)
    const view = new DataView(odd.buffer)
    ;[4, -4, Number.NaN, 0.5].forEach((value, i) => view.setFloat32(i * 4, value))
    expect(unpacked((await convert(au(odd, 6, 1), 'au', 'flac')).bytes).values).toEqual([8388607, -8388608, 0, 4194304])
  })

  it('unpacks telephone sound first, as every other format does', async () => {
    const flac = await convert(await sample('au/telephone.au'), 'au', 'flac')
    expect(flac.note).toContain('stored in µ-law')
    expect(unpacked(flac.bytes).values).toEqual(numbers('wav', (await convert(await sample('au/telephone.au'), 'au', 'wav')).bytes).values)
  })

  it('refuses what FLAC cannot say', async () => {
    const refusal = (bytes: Uint8Array) => convert(bytes, 'au', 'flac').then(() => 'converted', (error: Error) => `${error.name}: ${error.message}`)
    expect(await refusal(au(noise(9 * 16), 2, 9))).toBe('Refusal: FLAC holds up to 8 channels of sound, and this file has 9. Choose WAV or AIFF')
    expect(await refusal(au(noise(64), 3, 1, 2_000_000))).toBe('Refusal: FLAC cannot state a rate above 1,048,575 a second, and this sound runs at 2,000,000. Choose WAV or AIFF')
  })

  it('lifts numbers of twenty bits to the top of three bytes, where the other formats keep them', async () => {
    // Built by hand: one stretch of four moments, one channel, twenty bits, written as they are.
    const flac = await sample('_traps/low-bits-left-out.flac')
    const found = unpacked(flac)
    expect(found.values.every((value) => value % 256 === 0)).toBe(true)
    expect(numbers('wav', (await convert(flac, 'flac', 'wav')).bytes).values).toEqual(found.values)
  })

  it('says what a FLAC holds from its label alone', async () => {
    const details = await describeFile(new Blob([(await sample('flac/sample.flac')) as BlobPart]), formatById(registry, 'flac')!)
    expect(details).toEqual([
      { label: 'Length', value: '0.25 seconds', fate: 'kept' },
      { label: 'Rate', value: '11,025 samples a second', fate: 'kept' },
      { label: 'Channels', value: '2 (stereo)', fate: 'kept' },
      { label: 'Stored as', value: '16-bit whole numbers, packed by FLAC, with nothing lost', fate: 'kept' },
      { label: 'Title', value: 'Test pattern', fate: 'removed' },
      { label: 'Artist', value: 'Omsett', fate: 'removed' },
      { label: 'Made with', value: expect.stringMatching(/^reference libFLAC/) as string, fate: 'removed' },
    ])
    // An hour's recording is described from its first few bytes; nothing is unpacked to do it.
    const label = readSound('flac', (await sample('flac/sample.flac')).subarray(0, 64), 300_000_000)
    expect([label.sound.rate, label.sound.channels, label.sound.frames]).toEqual([11025, 2, 2756])
  })

  it('never throws anything but a refusal, whatever is done to a file', async () => {
    for (const name of ['sample', 'from-ffmpeg', 'three-bytes']) {
      const bytes = await sample(`flac/${name}.flac`)
      // Where the sound starts. Before it are the label, words about the sound, and empty room.
      const { first } = readFlac(bytes)
      for (let at = 0; at < bytes.length; at += 3) {
        for (const value of [0x00, 0xFF, bytes[at]! ^ 0x01]) {
          if (value === bytes[at]) continue
          const damaged = bytes.slice()
          damaged[at] = value
          const outcome = await convert(damaged, 'flac', 'wav').then(() => 'converted', (error: Error) => `${error.name}: ${error.message}`)
          expect(outcome === 'converted' || outcome.startsWith('Refusal: '), `${name} byte ${at} = ${value}: ${outcome}`).toBe(true)
          // No change to the sound itself gets through, wherever it is and whatever it is: every
          // stretch is covered by its own checksums, and all of it by the file's.
          if (at >= first) expect(outcome, `${name} byte ${at} = ${value}`).not.toBe('converted')
        }
      }
    }
  })
})

describe('MP3: sound made small by leaving some out', () => {
  const mp3Engine = createNodeEngines()['audio-mp3']!
  async function through(bytes: Uint8Array, from: string, to: string, options: Record<string, unknown> = {}) {
    const [output] = await mp3Engine.convert({
      blob: new Blob([bytes as BlobPart]),
      name: `sound.${from}`,
      from: formatById(registry, from)!,
      to: formatById(registry, to)!,
      options,
      signal: new AbortController().signal,
      onProgress: () => {},
    })
    return { ...output!, bytes: new Uint8Array(await output!.blob.arrayBuffer()) }
  }
  const outcome = (work: Promise<unknown>) => work.then(() => 'converted', (error: Error) => `${error.name}: ${error.message}`)

  /** Two notes, one to a channel, as a 16-bit AU: something a packer handles well. */
  function notes(seconds: number, rate: number, channels: number): { file: Uint8Array; values: number[] } {
    const frames = Math.round(seconds * rate)
    const data = new Uint8Array(frames * channels * 2)
    const view = new DataView(data.buffer)
    const values: number[] = []
    for (let i = 0; i < frames; i++) {
      for (let c = 0; c < channels; c++) {
        const value = Math.round(12000 * Math.sin((2 * Math.PI * (440 + 220 * c) * i) / rate))
        values.push(value)
        view.setInt16((i * channels + c) * 2, value)
      }
    }
    return { file: au(data, 3, channels, rate), values }
  }
  /** How far apart two sounds are, as a share of how loud the first is. */
  const apart = (a: number[], b: number[]) => {
    let [gap, loud] = [0, 0]
    for (let i = 0; i < a.length; i++) {
      gap += (a[i]! - b[i]!) ** 2
      loud += a[i]! ** 2
    }
    return Math.sqrt(gap / loud)
  }

  it('comes back the same length and in step with what was packed, at every setting', async () => {
    const source = notes(2, 44100, 2)
    const sizes: number[] = []
    for (const soundQuality of ['smaller', 'standard', 'best']) {
      const mp3 = await through(source.file, 'au', 'mp3', { soundQuality })
      sizes.push(mp3.bytes.length)
      // The label counts exactly the moments that were packed: not the padding at either end.
      expect(readSound('mp3', mp3.bytes).sound.frames, soundQuality).toBe(88200)
      const back = numbers('wav', (await through(mp3.bytes, 'mp3', 'wav')).bytes)
      expect([back.read.sound.frames, back.read.sound.channels, back.read.sound.rate, back.read.sound.bytes], soundQuality).toEqual([88200, 2, 44100, 2])
      // Not the same numbers, but the same sound, starting at the same moment: within two
      // percent. A sound that had slipped by one moment would be six percent out.
      expect(apart(source.values, back.values), soundQuality).toBeLessThan(0.02)
    }
    expect(sizes[0]!).toBeLessThan(sizes[1]!)
    expect(sizes[1]!).toBeLessThan(sizes[2]!)
    // The most MP3 holds is 320,000 bits a second: two seconds are 80,000 bytes and a little.
    expect(sizes[2]!).toBeGreaterThan(80_000)
    expect(sizes[2]!).toBeLessThan(82_000)
    // Left to itself the setting is the middle one.
    expect((await through(source.file, 'au', 'mp3')).bytes.length).toBe(sizes[1])
  })

  it('opens what it writes with a list of contents, so that a player shows the right length', async () => {
    const uneven = (await through(notes(1, 44100, 1).file, 'au', 'mp3')).bytes
    const even = (await through(notes(1, 44100, 1).file, 'au', 'mp3', { soundQuality: 'best' })).bytes
    const text = (bytes: Uint8Array) => new TextDecoder('latin1').decode(bytes.subarray(0, 200))
    expect(text(uneven).indexOf('Xing')).toBe(21)
    expect(text(even).indexOf('Info')).toBe(21)
    expect(text(uneven)).toContain('LAME3.100')
  })

  it('unpacks files made by another program to the sound they were made from', async () => {
    const pattern = numbers('wav', await sample('wav/sample.wav'))
    const back = numbers('wav', (await through(await sample('mp3/sample.mp3'), 'mp3', 'wav')).bytes)
    expect(back.read.sound.frames).toBe(pattern.read.sound.frames)
    expect(apart(pattern.values, back.values)).toBeLessThan(0.25)
    // One with no count of its stretches comes out with the padding its packer added: a little longer.
    const even = numbers('wav', (await through(await sample('mp3/even-speed.mp3'), 'mp3', 'wav')).bytes)
    expect(even.read.sound.rate).toBe(44100)
    expect(even.read.sound.frames).toBeGreaterThanOrEqual(11024)
    expect(even.read.sound.frames).toBeLessThan(11024 + 3 * 1152)
    expect(numbers('aiff', (await through(await sample('mp3/one-channel.mp3'), 'mp3', 'aiff')).bytes).read.sound.channels).toBe(1)
  })

  it('goes to and from each of the other formats', async () => {
    const mp3 = await sample('mp3/sample.mp3')
    for (const other of ['wav', 'flac', 'aiff', 'au']) {
      const there = await through(mp3, 'mp3', other)
      const read = other === 'flac' ? unpackFlac(there.bytes) : readSound(other, there.bytes)
      expect([read.sound.frames, read.sound.rate, read.sound.channels], `mp3 → ${other}`).toEqual([2756, 11025, 2])
      const back = await through(await sample(`${other}/sample.${other}`), other, 'mp3')
      expect(readSound('mp3', back.bytes).sound.frames, `${other} → mp3`).toBe(2756)
    }
  })

  it('writes sound at the nearest rate MP3 has, and says so', async () => {
    const fast = await through(notes(0.5, 96000, 1).file, 'au', 'mp3')
    expect(fast.note).toBe('MP3 cannot hold sound at 96,000 a second. It is written at 48,000, the nearest rate it has.')
    expect([readSound('mp3', fast.bytes).sound.rate, readSound('mp3', fast.bytes).sound.frames]).toEqual([48000, 24000])
    const mac = await through(await sample('aiff/old-mac.aiff'), 'aiff', 'mp3')
    expect(mac.note).toBe('MP3 cannot hold sound at 22,254.545 a second. It is written at 22,050, the nearest rate it has.')
    expect((await through(notes(0.5, 8000, 1).file, 'au', 'mp3', { soundQuality: 'best' })).note).toBeUndefined()
  })

  it('takes every way the other formats store sound', async () => {
    for (const path of ['wav/one-byte.wav', 'wav/three-bytes.wav', 'wav/fractions.wav', 'wav/telephone.wav', 'aiff/fractions.aifc', 'au/four-bytes.au', 'au/a-law.au', 'flac/three-bytes.flac']) {
      const from = path.split('/')[0]!
      const source = await sample(path)
      const mp3 = await through(source, from, 'mp3')
      const back = numbers('wav', (await through(mp3.bytes, 'mp3', 'wav')).bytes)
      const expected = numbers('wav', (await convert(source, from, 'wav')).bytes)
      expect(back.read.sound.frames, path).toBe(expected.read.sound.frames)
      // Brought to the same scale, it is the same sound, as near as MP3 keeps it.
      const scale = 32768 / (expected.read.sound.coding === 'float' ? 1 : 2 ** (expected.read.sound.bytes * 8 - 1))
      expect(apart(expected.values.map((value) => value * scale), back.values), path).toBeLessThan(0.3)
    }
  })

  it('refuses what MP3 cannot hold and what is not sound', async () => {
    expect(await outcome(through(await sample('wav/six-channels.wav'), 'wav', 'mp3'))).toBe('Refusal: MP3 holds one or two channels of sound, and this file has 6. Choose FLAC or WAV')
    expect(await outcome(through(new Uint8Array(400), 'mp3', 'wav'))).toBe('Refusal: This file is not a valid MP3 file')
  })

  it('says what an MP3 holds from its start alone, and that sound was left out', async () => {
    const details = await describeFile(new Blob([(await sample('mp3/sample.mp3')) as BlobPart]), formatById(registry, 'mp3')!)
    expect(details.slice(0, 3)).toEqual([
      { label: 'Length', value: '0.25 seconds', fate: 'kept' },
      { label: 'Rate', value: '11,025 samples a second', fate: 'kept' },
      { label: 'Channels', value: '2 (stereo)', fate: 'kept' },
    ])
    expect(details[3]).toEqual({ label: 'Stored as', value: expect.stringMatching(/^MP3, about \d+ kbps\. Sound was left out to make the file small, and converting does not bring it back$/) as string })
    expect(details.slice(4)).toEqual([
      { label: 'Artist', value: 'Omsett', fate: 'removed' },
      { label: 'Title', value: 'Test pattern', fate: 'removed' },
    ])
    // An hour at even speed, from its first four bytes and its size.
    const head = (await sample('mp3/even-speed.mp3')).subarray(0, 4)
    const label = readSound('mp3', head, 3600 * 16000)
    expect(Math.round(label.sound.frames / label.sound.rate)).toBe(3600)
  })

  it('never throws anything but a refusal, whatever is done to a file', async () => {
    const bytes = await sample('mp3/even-speed.mp3')
    for (let at = 0; at < bytes.length; at += 7) {
      for (const value of [0x00, 0xFF, bytes[at]! ^ 0x10]) {
        const damaged = bytes.slice()
        damaged[at] = value
        const result = await outcome(through(damaged, 'mp3', 'wav'))
        expect(result === 'converted' || result.startsWith('Refusal: '), `byte ${at} = ${value}: ${result}`).toBe(true)
      }
    }
  }, 60_000)
})
