import { audioLibavInfo } from '../info'
import type { ConvertInput, ConvertOutput, Engine } from '../types'
import { outputName, Refusal, throwIfAborted } from '../util'
import { oggProblem } from './ogg'

// The long tail of sound formats: AAC and Apple Lossless (M4A), AC-3, WMA, Ogg Vorbis, Opus,
// WavPack and TTA, read by FFmpeg, built to WebAssembly by libav.js in a variant Omsett makes
// itself (vendor/libav, LGPL). It writes Opus, Ogg Vorbis, WavPack and Apple Lossless, and
// WAV, from which Omsett's own code and LAME make the rest. It has no AAC or AC-3 encoder:
// those are covered by patents, and are left out of the build on purpose.
//
// FFmpeg forgives a damaged file and plays what it can find. Omsett does not: every decoder is
// told to stop at damage it would otherwise cover (`err_detect explode`), and a file that
// gives less sound than its container says it holds is refused, not handed back short. The
// metadata (titles, names, pictures) is never copied into what is written.

/** The functions of libav.js used here. Each returns a promise; its numbers are pointers into its memory. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- libav.js's own types are a large generated file
export type LibAV = Record<string, any>
export interface LibavHost {
  /** An instance of libav.js, started from its verified binary. */
  libav(): Promise<LibAV>
}

/** The most sound a conversion may hold, unpacked: an hour and a half of CD-quality stereo, a little over. */
const MAX_PCM_BYTES = 1024 ** 3
/** How short of its stated length a decoded sound may come before it is called cut short, in seconds. */
const SLACK_SECONDS = 0.1

interface Target {
  codec: string
  format: string
  /** The sample format the encoder takes, by libav's name for it. */
  sampleFormat: 'flt' | 'fltp' | 's16p' | 's32p'
  /** A rate the encoder insists on, where it has one. */
  rate?: number
  /** Keeps every number, so is written at the sound's own depth or refused. */
  lossless?: boolean
  /**
   * The type the file is handed back with, where the format's own would cost it its name. Firefox
   * on Linux renames any Ogg download it is given as Ogg to ".ogx"; as plain bytes it keeps ".opus".
   */
  blobType?: string
}
const TARGETS: Record<string, Target> = {
  opus: { codec: 'libopus', format: 'ogg', sampleFormat: 'flt', rate: 48000, blobType: 'application/octet-stream' },
  ogg: { codec: 'libvorbis', format: 'ogg', sampleFormat: 'fltp' },
  wv: { codec: 'wavpack', format: 'wv', sampleFormat: 's32p', lossless: true },
  m4a: { codec: 'alac', format: 'ipod', sampleFormat: 's32p', lossless: true },
}
/** How much is left out, by the person's choice: Opus by bits a second, Vorbis by its own quality scale. */
const OPUS_BITS: Record<string, number> = { smaller: 64000, standard: 128000, best: 192000 }
const VORBIS_QUALITY: Record<string, number> = { smaller: 3, standard: 5, best: 7 }

/** Formats that are frames end to end with no container: every byte belongs to a frame, past a tag in front. */
const RAW = new Set(['aac', 'ac3'])
/** Room for a tag in front of a raw stream (ID3), which no frame takes. */
const RAW_SLACK = 64 * 1024

/** Ogg files, walked page by page before FFmpeg sees them. */
const OGG = new Set(['ogg', 'opus'])
/** How much is read before what was read is unpacked and counted. */
const READ_STEP = 1024 * 1024
/** Codecs whose fractions, where they give fractions, are the sound exactly, and are kept as fractions. */
const EXACT_FLOAT = new Set(['pcm_f32le', 'pcm_f32be', 'pcm_f64le', 'pcm_f64be', 'wavpack'])
/** Picture codecs: a stream of one of these beside the sound is its cover. */
const PICTURES = new Set(['mjpeg', 'png', 'bmp', 'gif', 'tiff', 'webp'])
/** FFmpeg's flag on a file it writes, to leave out its own name and version. */
const AVFMT_FLAG_BITEXACT = 0x0400

/** FFmpeg's step from a quality to its scale. */
const QP2LAMBDA = 118
/** The usual speakers for so many channels, as FFmpeg numbers them: mono, stereo, 2.1, quad, 5.0, 5.1, 6.1, 7.1. */
const DEFAULT_LAYOUTS: Record<number, number> = { 1: 0x4, 2: 0x3, 3: 0x7, 4: 0x33, 5: 0x37, 6: 0x3F, 7: 0x13F, 8: 0x63F }

const damaged = () => new Refusal('This sound file is damaged: part of it could not be read')
const tracks = () => new Refusal('This file holds more than one track. Omsett converts a file with one track of sound')
// FFmpeg 9.0.2's WavPack reader gets the check on the last eight bits of a 32-bit whole number
// wrong, and fails every such file, even one the reference tool verifies. Its checks are not
// turned off to read them: they are what catches damage. Such a file is refused in words that say so.
const INT32_WAVPACK = () =>
  new Refusal('This WavPack file holds 32-bit whole numbers, which Omsett cannot yet check, so it is not converted. It may also be damaged')
/** Whether a WavPack's first block says it stores whole numbers four bytes wide. */
function wavpackStoresInt32(bytes: Uint8Array): boolean {
  if (bytes.length < 32 || String.fromCharCode(...bytes.subarray(0, 4)) !== 'wvpk') return false
  const flags = new DataView(bytes.buffer, bytes.byteOffset).getUint32(24, true)
  return (flags & 3) === 3 && (flags & 0x80) === 0
}
const cutShort = () => new Refusal('This sound file holds less sound than it says. It may have been cut short')

export function createAudioLibavEngine(host: LibavHost): Engine {
  let started: Promise<LibAV> | null = null
  const start = () =>
    (started ??= host.libav().catch((error: unknown) => {
      started = null
      throw error
    }))

  async function convert(input: ConvertInput): Promise<ConvertOutput[]> {
    throwIfAborted(input.signal)
    const libav = await start()
    const bytes = new Uint8Array(await input.blob.arrayBuffer())
    // Ogg is walked first: FFmpeg's reader would play a damaged page, and read a cut file as whole.
    if (OGG.has(input.from.id)) {
      const problem = oggProblem(bytes)
      if (problem === 'damaged') throw damaged()
      if (problem === 'cut') throw cutShort()
      if (problem === 'tracks') throw tracks()
    }
    const inName = 'in'
    const outName = 'out'
    await libav.writeFile(inName, bytes)
    // Everything made inside libav.js is freed here, refused or not: the worker is used again.
    const cleanup: Array<() => Promise<unknown>> = []
    try {
      let fmt: number
      let streams: Array<{ ptr: number; index: number; codec_type: number; codec_id: number; codecpar: number; time_base_num: number; time_base_den: number }>
      try {
        ;[fmt, streams] = await libav.ff_init_demuxer_file(inName)
      } catch {
        throw new Refusal(`This file is not a valid ${input.from.name} file`)
      }
      cleanup.push(() => libav.avformat_close_input_js(fmt))
      const audio = streams.filter((stream) => stream.codec_type === libav.AVMEDIA_TYPE_AUDIO)
      // A picture stored as a stream is a cover, and is not carried; anything else that moves is a film.
      for (const stream of streams.filter((found) => found.codec_type === libav.AVMEDIA_TYPE_VIDEO)) {
        const name: string = await libav.avcodec_get_name(stream.codec_id)
        if (!PICTURES.has(name)) throw new Refusal('This file holds a film, not only sound. Omsett converts sound files')
      }
      if (audio.length > 1) throw tracks()
      const sound = audio[0]
      if (!sound) throw new Refusal(`This ${input.from.name} file has no sound in it`)
      const codec: string = await libav.avcodec_get_name(sound.codec_id)

      let decoder: [number, number, number, number]
      try {
        decoder = await libav.ff_init_decoder(sound.codec_id, { codecpar: sound.codecpar })
      } catch {
        throw new Refusal(`This ${input.from.name} file holds a kind of sound Omsett cannot read`)
      }
      const [, c, pkt, frame] = decoder
      cleanup.push(() => libav.ff_free_decoder(c, pkt, frame))
      // A decoder that would cover damage reports it instead.
      await libav.av_opt_set(c, 'err_detect', 'crccheck+bitstream+buffer+explode', 0)
      const rate: number = await libav.AVCodecContext_sample_rate(c)
      const channels: number = await libav.AVCodecContext_ch_layout_nb_channels(c)
      const sampleFormat: number = await libav.AVCodecContext_sample_fmt(c)
      if (rate < 1 || rate > 768000 || channels < 1 || channels > 32) throw damaged()
      const tooLong = () => new Refusal('This sound is too long to convert in a browser')
      // How long the container says the sound is, where it says: refused before anything is unpacked
      // if that is past the limit, and held to it afterwards.
      const lo: number = await libav.AVStream_duration(sound.ptr).catch(() => 0)
      const hi: number = await libav.AVStream_durationhi(sound.ptr).catch(() => 0)
      const length = hi * 2 ** 32 + (lo >>> 0)
      const seconds = length > 0 && sound.time_base_den > 0 ? (length * sound.time_base_num) / sound.time_base_den : 0
      if (seconds * rate * channels * 4 > MAX_PCM_BYTES) throw tooLong()
      input.onProgress(0.2)

      // Read and unpacked a stretch at a time, and counted as it goes, so that a stream with no
      // stated length is stopped at the limit and not after it.
      const inside = [libav.AV_SAMPLE_FMT_DBL, libav.AV_SAMPLE_FMT_DBLP].includes(sampleFormat)
      const frames: Array<{ nb_samples: number; channel_layout?: number; channels?: number; data?: unknown } | number> = []
      let fed = false
      let samples = 0
      let taken = 0
      const sizes: number[] = []
      for (;;) {
        let read: [number, Record<number, Array<{ data?: Uint8Array }>>]
        let found: Array<{ nb_samples: number } | number>
        try {
          read = await libav.ff_read_frame_multi(fmt, pkt, { limit: READ_STEP })
          if (read[0] !== 0 && read[0] !== -libav.EAGAIN && read[0] !== libav.AVERROR_EOF) throw damaged()
          const fin = read[0] === libav.AVERROR_EOF
          const packets = read[1][sound.index] ?? []
          for (const packet of packets) {
            taken += packet.data?.length ?? 0
            if (input.from.id === 'ac3') sizes.push(packet.data?.length ?? 0)
          }
          // Samples kept as 64-bit numbers cannot be copied out of libav.js; they stay inside it
          // as pointers, and the filter that converts them reads them there.
          found = await libav.ff_decode_multi(c, pkt, frame, packets, { fin, copyoutFrame: inside ? 'ptr' : 'default' })
        } catch (error) {
          if (error instanceof Refusal) throw error
          if (input.from.id === 'wv' && wavpackStoresInt32(bytes)) throw INT32_WAVPACK()
          throw damaged()
        }
        for (const one of found) {
          if (typeof one === 'number') {
            // Freed here only if the filter never took it: the filter frees each one it takes.
            cleanup.push(async () => (fed ? undefined : libav.av_frame_free_js(one)))
            samples += (await libav.AVFrame_nb_samples(one)) as number
          } else {
            samples += one.nb_samples
          }
          frames.push(one)
        }
        if (samples * channels * 4 > MAX_PCM_BYTES) throw tooLong()
        throwIfAborted(input.signal)
        if (read[0] === libav.AVERROR_EOF) break
      }
      // A stream with no container around it (AAC on its own, AC-3) states no length to hold it
      // to; what it holds is its frames, end to end. Bytes left over that no frame took are a
      // frame cut short.
      if (RAW.has(input.from.id)) {
        if (bytes.length - taken > RAW_SLACK) throw cutShort()
        // AC-3 frames are all one size at a stream's rate, but for two bytes of padding. A last
        // frame shorter than the rest is the start of a frame, the rest of it gone.
        if (sizes.length > 1 && sizes.at(-1)! < Math.min(...sizes.slice(0, -1)) - 2) throw cutShort()
      }
      if (samples === 0) throw new Refusal(`This ${input.from.name} file has no sound in it`)
      // As long as the container says it is: a file that stops short is refused.
      if (seconds > 0 && samples / rate + SLACK_SECONDS < seconds) throw cutShort()
      input.onProgress(0.5)

      // What the numbers are, as the file holds them: whole numbers deeper than 16 bits, or
      // fractions that a lossless format keeps as they are.
      const deep = [libav.AV_SAMPLE_FMT_S32, libav.AV_SAMPLE_FMT_S32P].includes(sampleFormat)
      const fractions = [libav.AV_SAMPLE_FMT_FLT, libav.AV_SAMPLE_FMT_FLTP, libav.AV_SAMPLE_FMT_DBL, libav.AV_SAMPLE_FMT_DBLP].includes(sampleFormat)
      const exactFloat = fractions && EXACT_FLOAT.has(codec)
      const wide = codec.startsWith('pcm_f64')
      // Which speaker each channel is for, as the file says; where it does not, the usual set for so many.
      const stated: number = await libav.AVCodecContext_channel_layoutmask(c).catch(() => 0)
      const layout = stated > 0 ? stated : (DEFAULT_LAYOUTS[channels] ?? 0)
      if (layout === 0) throw new Refusal(`This sound has ${channels} channels, more than Omsett can lay out`)
      // Every frame is given that layout, so that a file that named none is read as the usual one.
      for (const found of frames) {
        if (typeof found === 'number') continue
        found.channel_layout = layout
        found.channels = channels
      }
      // The sample format by FFmpeg's name for it: libav.js reads the number 0 (unsigned 8-bit) as none given.
      const inFormat: string = await libav.av_get_sample_fmt_name(sampleFormat)
      const filterGraph = async (outRate: number, outFormat: number, outLayout: number, frameSize?: number) => {
        const [graph, src, sink] = await libav.ff_init_filter_graph(
          outLayout === layout ? 'anull' : 'aresample',
          { sample_rate: rate, sample_fmt: inFormat, channel_layout: layout },
          { sample_rate: outRate, sample_fmt: outFormat, channel_layout: outLayout, frame_size: frameSize || undefined },
        )
        cleanup.push(() => libav.avfilter_graph_free_js(graph))
        return [src, sink] as const
      }
      let written: Uint8Array
      if (input.to.id === 'wav') {
        // Kept as it was decoded: fractions a lossless format held stay fractions, whole numbers
        // deeper than 16 bits stay 32, and everything else (what a lossy format gives) is 16.
        const kind = exactFloat ? 'float' : deep ? 'int32' : 'int16'
        const outFormat = { float: libav.AV_SAMPLE_FMT_FLT, int32: libav.AV_SAMPLE_FMT_S32, int16: libav.AV_SAMPLE_FMT_S16 }[kind] as number
        const [src, sink] = await filterGraph(rate, outFormat, layout)
        fed = true
        const out: Array<{ data: Int16Array | Int32Array | Float32Array }> = await libav.ff_filter_multi(src, sink, frame, frames, true)
        written = wav(out.map((found) => found.data), channels, rate, kind)
      } else {
        const target = TARGETS[input.to.id]
        if (!target) throw new Error(`The audio-libav engine does not write ${input.to.id}`)
        const quality = String(input.options.soundQuality ?? 'standard')
        const outRate = target.rate ?? rate
        // What keeps every bit is packed as the sound is: 16 bits stays 16, deeper stays 32, and
        // fractions stay fractions where the format holds them. Where it does not, it is refused.
        let depth: string = target.sampleFormat
        if (target.lossless) {
          if (wide) throw new Refusal(`This sound's numbers are more exact than ${input.to.name} can hold, so some would be lost`)
          if (exactFloat && target.codec === 'alac') throw new Refusal(`This sound is stored as fractions, which ${input.to.name} cannot hold without changing them`)
          depth = exactFloat ? 'fltp' : deep ? 's32p' : 's16p'
        }
        const outFormat = libav[`AV_SAMPLE_FMT_${depth.toUpperCase()}`] as number
        // Opus and Apple Lossless take surround sound in their own usual layouts only; a file laid
        // out another way (5.1 with side speakers, as FLAC has it) is moved onto theirs.
        const outLayout = ['libopus', 'alac'].includes(target.codec) ? (DEFAULT_LAYOUTS[channels] ?? layout) : layout
        const ctx: Record<string, number> = { sample_fmt: outFormat, sample_rate: outRate, channel_layout: outLayout, channels }
        // Nothing about the program that wrote it is written into the file (FFmpeg's "bitexact").
        const options: Record<string, string> = { flags: '+bitexact' }
        if (target.codec === 'libopus') {
          ctx.bit_rate = (OPUS_BITS[quality] ?? OPUS_BITS.standard!) * Math.max(1, channels / 2)
          // More than two channels is surround sound, which Opus carries by a mapping of its own.
          if (channels > 2) options.mapping_family = '1'
        }
        // Vorbis is told how good to sound, and finds its own size: FFmpeg's "-q:a".
        if (target.codec === 'libvorbis') {
          options.flags = '+qscale+bitexact'
          options.global_quality = String((VORBIS_QUALITY[quality] ?? 5) * QP2LAMBDA)
        }
        let encoder: [number, number, number, number, number]
        try {
          encoder = await libav.ff_init_encoder(target.codec, { ctx, options })
        } catch {
          throw new Refusal(`This sound cannot be written as ${input.to.name}: it has ${channels} channels at ${rate} a second`)
        }
        const [, ec, eframe, epkt, frameSize] = encoder
        cleanup.push(() => libav.ff_free_encoder(ec, eframe, epkt))
        const [src, sink] = await filterGraph(outRate, outFormat, outLayout, frameSize)
        fed = true
        const filtered: Array<{ data: unknown }> = await libav.ff_filter_multi(src, sink, frame, frames, true)
        // Apple Lossless holds whole numbers up to 24 bits. Deeper numbers that use their last
        // eight bits would lose them, so such a sound is refused, not cut down.
        if (target.codec === 'alac' && deep && filtered.some((found) => usesLowByte(found.data))) {
          throw new Refusal(`This sound uses 32 bits to a number, more than ${input.to.name} can hold, so some would be lost`)
        }
        throwIfAborted(input.signal)
        input.onProgress(0.7)
        const packets = await libav.ff_encode_multi(ec, eframe, epkt, filtered, true)
        const [oc, , pb] = await libav.ff_init_muxer({ format_name: target.format, filename: outName, open: true }, [[ec, 1, outRate]])
        cleanup.push(() => libav.ff_free_muxer(oc, pb))
        await libav.AVFormatContext_flags_s(oc, ((await libav.AVFormatContext_flags(oc)) as number) | AVFMT_FLAG_BITEXACT)
        await libav.avformat_write_header(oc, 0)
        await libav.ff_write_multi(oc, epkt, packets)
        await libav.av_write_trailer(oc)
        written = await libav.readFile(outName)
      }
      input.onProgress(1)
      const type = TARGETS[input.to.id]?.blobType ?? input.to.mime[0]
      return [{ name: outputName(input.name, input.to), format: input.to.id, blob: new Blob([written as BlobPart], { type }) }]
    } finally {
      for (const free of cleanup.reverse()) await free().catch(() => {})
      await libav.unlink(inName).catch(() => {})
      await libav.unlink(outName).catch(() => {})
    }
  }

  return {
    ...audioLibavInfo,
    available: async () => typeof WebAssembly !== 'undefined',
    load: async () => void (await start()),
    convert,
  }
}

/** Whether any 32-bit number in a frame (interleaved or a channel to a plane) uses its last eight bits. */
function usesLowByte(data: unknown): boolean {
  const planes = Array.isArray(data) ? data : [data]
  return planes.some((plane) => plane instanceof Int32Array && plane.some((value) => (value & 0xFF) !== 0))
}

/** Interleaved numbers as a WAV: whole, 16 or 32 bits to a sample, or 32-bit fractions. */
function wav(parts: Array<Int16Array | Int32Array | Float32Array>, channels: number, rate: number, kind: 'int16' | 'int32' | 'float'): Uint8Array {
  const bits = kind === 'int16' ? 16 : 32
  const width = bits / 8
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(44 + total * width)
  const view = new DataView(out.buffer)
  const tag = (at: number, text: string) => {
    for (let i = 0; i < 4; i++) out[at + i] = text.charCodeAt(i)
  }
  tag(0, 'RIFF')
  view.setUint32(4, 36 + total * width, true)
  tag(8, 'WAVE')
  tag(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, kind === 'float' ? 3 : 1, true)
  view.setUint16(22, channels, true)
  view.setUint32(24, rate, true)
  view.setUint32(28, rate * channels * width, true)
  view.setUint16(32, channels * width, true)
  view.setUint16(34, bits, true)
  tag(36, 'data')
  view.setUint32(40, total * width, true)
  let at = 44
  for (const part of parts) {
    out.set(new Uint8Array(part.buffer, part.byteOffset, part.byteLength), at)
    at += part.byteLength
  }
  return out
}
