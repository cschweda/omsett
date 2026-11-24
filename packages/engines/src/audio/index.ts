import { audioInfo } from '../info'
import type { ConvertInput, ConvertOutput, Engine } from '../types'
import { outputName, Refusal, throwIfAborted } from '../util'
import { readAiff, writeAiff } from './aiff'
import { readAu, writeAu } from './au'
import { readFlac, unpackFlac } from './flac'
import { writeFlac } from './flac-write'
import { notValid, type Read, type Sound } from './sound'
import { readWav, writeWav } from './wav'

export { readAiff } from './aiff'
export { readAu } from './au'
export { readWav } from './wav'
export { readFlac, unpackFlac } from './flac'
export type { Read, Sound } from './sound'

// Sound, kept exactly. WAV, AIFF and AU store it unpacked: each is a label and then the same
// numbers, and converting writes a new label and copies the numbers, turning their bytes round
// where two formats disagree about which comes first. FLAC packs the numbers without loss, and
// unpacking gives every one of them back. So every conversion here hands back exactly the
// sound it was given, and nothing is worked out from the sound on the way.

const READERS: Record<string, (bytes: Uint8Array, length?: number) => Read> = { wav: readWav, aiff: readAiff, au: readAu, flac: readFlac }
const WRITERS: Record<string, (sound: Sound, data: Uint8Array, notes: string[], onProgress?: (fraction: number) => void) => Uint8Array[]> = { wav: writeWav, aiff: writeAiff, au: writeAu, flac: writeFlac }

/** Read a sound file's label: what it holds and where, without unpacking anything. Refuses what it cannot follow. */
export function readSound(format: string, bytes: Uint8Array, length = bytes.length): Read {
  const reader = READERS[format]
  if (!reader) throw new Refusal('This kind of sound file cannot be read')
  return reader(bytes, length)
}

export function createAudioEngine(): Engine {
  return {
    ...audioInfo,
    available: async () => true,
    load: async () => {},
    async convert(input: ConvertInput): Promise<ConvertOutput[]> {
      throwIfAborted(input.signal)
      const bytes = new Uint8Array(await input.blob.arrayBuffer())
      input.onProgress(0.2)
      let read: Read
      try {
        // Packed sound is unpacked here, which is most of the work; the rest of the bar is for writing.
        read = input.from.id === 'flac' ? unpackFlac(bytes, (fraction) => input.onProgress(0.2 + fraction * 0.5)) : readSound(input.from.id, bytes)
      } catch (error) {
        // Reading past the end of a file that lied about a length ends here too.
        throw error instanceof Refusal ? error : notValid(input.from.name)
      }
      throwIfAborted(input.signal)
      const { sound } = read
      const writer = WRITERS[input.to.id]
      if (!writer) throw new Refusal(`${input.to.name} cannot be written`)
      const notes = [...read.notes]
      if (sound.channels > 2) {
        notes.push(`This sound has ${sound.channels} channels. They are written in the order the file had them. Formats differ on which speaker each is for, so check that each plays where it should.`)
      }
      const data = (read as { data?: Uint8Array }).data ?? bytes.subarray(sound.at, sound.at + sound.frames * sound.channels * sound.bytes)
      const parts = writer(sound, data, notes, (fraction) => input.onProgress(0.7 + fraction * 0.3))
      input.onProgress(1)
      return [
        {
          name: outputName(input.name, input.to),
          format: input.to.id,
          blob: new Blob(parts as BlobPart[], { type: input.to.mime[0] }),
          ...(notes.length > 0 ? { note: notes.join(' ') } : {}),
        },
      ]
    },
  }
}
