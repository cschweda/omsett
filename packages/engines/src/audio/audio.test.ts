import { readFile } from 'node:fs/promises'
import { formatById, registry } from '@omsett/registry'
import { describe, expect, it } from 'vitest'
import { describeFile } from '../details'
import { createAudioEngine, readSound, type Read } from './index'
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
