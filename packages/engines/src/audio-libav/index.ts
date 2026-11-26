import { audioLibavInfo } from '../info'
import type { ConvertInput, ConvertOutput, Engine } from '../types'
import { outputName, Refusal, throwIfAborted } from '../util'

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
}
const TARGETS: Record<string, Target> = {
  opus: { codec: 'libopus', format: 'ogg', sampleFormat: 'flt', rate: 48000 },
  ogg: { codec: 'libvorbis', format: 'ogg', sampleFormat: 'fltp' },
  wv: { codec: 'wavpack', format: 'wv', sampleFormat: 's32p' },
  m4a: { codec: 'alac', format: 'ipod', sampleFormat: 's32p' },
}
/** How much is left out, by the person's choice: Opus by bits a second, Vorbis by its own quality scale. */
const OPUS_BITS: Record<string, number> = { smaller: 64000, standard: 128000, best: 192000 }
const VORBIS_QUALITY: Record<string, number> = { smaller: 3, standard: 5, best: 7 }

/** Formats that are frames end to end with no container: every byte belongs to a frame, past a tag in front. */
const RAW = new Set(['aac', 'ac3'])
/** Room for a tag in front of a raw stream (ID3), which no frame takes. */
const RAW_SLACK = 64 * 1024

/** FFmpeg's step from a quality to its scale. */
const QP2LAMBDA = 118
/** The usual speakers for so many channels, as FFmpeg numbers them: mono, stereo, 2.1, quad, 5.0, 5.1, 6.1, 7.1. */
const DEFAULT_LAYOUTS: Record<number, number> = { 1: 0x4, 2: 0x3, 3: 0x7, 4: 0x33, 5: 0x37, 6: 0x3F, 7: 0x13F, 8: 0x63F }

const damaged = () => new Refusal('This sound file is damaged: part of it could not be read')
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
    const inName = 'in'
    const outName = 'out'
    await libav.writeFile(inName, bytes)
    let fmt = 0
    try {
      let streams: Array<{ ptr: number; index: number; codec_type: number; codec_id: number; codecpar: number; time_base_num: number; time_base_den: number }>
      try {
        // The reader, as the decoder, is told to check what it can and stop at damage: an Ogg
        // page whose checksum does not match is refused, not played.
        const strict: number = await libav.av_dict_set_js(0, 'err_detect', 'crccheck+bitstream+buffer+explode', 0)
        ;[fmt, streams] = await libav.ff_init_demuxer_file(inName, { open_input_options: strict })
      } catch {
        throw new Refusal(`This file is not a valid ${input.from.name} file`)
      }
      const audio = streams.filter((stream) => stream.codec_type === libav.AVMEDIA_TYPE_AUDIO)
      // A film in Windows Media's container is not a sound file, though its name may say so.
      if (input.from.id === 'wma' && streams.some((stream) => stream.codec_type === libav.AVMEDIA_TYPE_VIDEO)) {
        throw new Refusal('This file holds a film, not only sound. Omsett converts sound files')
      }
      const sound = audio[0]
      if (!sound) throw new Refusal(`This ${input.from.name} file has no sound in it`)

      let decoder: [number, number, number, number]
      try {
        decoder = await libav.ff_init_decoder(sound.codec_id, { codecpar: sound.codecpar })
      } catch {
        throw new Refusal(`This ${input.from.name} file holds a kind of sound Omsett cannot read`)
      }
      const [, c, pkt, frame] = decoder
      // A decoder that would cover damage reports it instead.
      await libav.av_opt_set(c, 'err_detect', 'crccheck+bitstream+buffer+explode', 0)
      const rate: number = await libav.AVCodecContext_sample_rate(c)
      const channels: number = await libav.AVCodecContext_ch_layout_nb_channels(c)
      const sampleFormat: number = await libav.AVCodecContext_sample_fmt(c)
      if (rate < 1 || rate > 768000 || channels < 1 || channels > 32) throw damaged()
      input.onProgress(0.2)

      let read: [number, Record<number, unknown[]>]
      let frames: Array<{ nb_samples: number; channel_layout?: number; channels?: number }>
      try {
        read = await libav.ff_read_frame_multi(fmt, pkt)
        throwIfAborted(input.signal)
        // Samples kept as 64-bit numbers cannot be copied out of libav.js; they stay inside it, and
        // the filter that converts them reads them there.
        const inside = [libav.AV_SAMPLE_FMT_DBL, libav.AV_SAMPLE_FMT_DBLP].includes(sampleFormat)
        frames = await libav.ff_decode_multi(c, pkt, frame, read[1][sound.index] ?? [], { fin: true, copyoutFrame: inside ? 'ptr' : 'default' })
        if (inside) {
          frames = await Promise.all(
            (frames as unknown as number[]).map(async (ptr) => Object.assign(new Number(ptr), { nb_samples: (await libav.AVFrame_nb_samples(ptr)) as number })),
          )
        }
      } catch (error) {
        if (error instanceof Refusal) throw error
        throw damaged()
      }
      if (read[0] !== 0 && read[0] !== libav.AVERROR_EOF) throw damaged()
      // A stream with no container around it (AAC on its own, AC-3) states no length to hold it
      // to; what it holds is its frames, end to end. Bytes left over that no frame took are a
      // frame cut short.
      if (RAW.has(input.from.id)) {
        const taken = ((read[1][sound.index] ?? []) as Array<{ data?: Uint8Array }>).reduce((sum, packet) => sum + (packet.data?.length ?? 0), 0)
        if (bytes.length - taken > RAW_SLACK) throw cutShort()
        // AC-3 frames are all one size at a stream's rate, but for two bytes of padding. A last
        // frame shorter than the rest is the start of a frame, the rest of it gone.
        if (input.from.id === 'ac3') {
          const sizes = ((read[1][sound.index] ?? []) as Array<{ data?: Uint8Array }>).map((packet) => packet.data?.length ?? 0)
          if (sizes.length > 1 && sizes.at(-1)! < Math.min(...sizes.slice(0, -1)) - 2) throw cutShort()
        }
      }
      const samples = frames.reduce((sum, found) => sum + found.nb_samples, 0)
      if (samples === 0) throw new Refusal(`This ${input.from.name} file has no sound in it`)
      if (samples * channels * 4 > MAX_PCM_BYTES) throw new Refusal('This sound is too long to convert in a browser')

      // As long as the container says it is, where it says: a file that stops short is refused.
      const length: number = await libav.AVStream_duration(sound.ptr).catch(() => 0)
      if (length > 0 && sound.time_base_den > 0) {
        const seconds = (length * sound.time_base_num) / sound.time_base_den
        if (samples / rate + SLACK_SECONDS < seconds) throw cutShort()
      }
      input.onProgress(0.5)

      const lossless = [libav.AV_SAMPLE_FMT_S32, libav.AV_SAMPLE_FMT_S32P].includes(sampleFormat)
      // Which speaker each channel is for, as the file says; where it does not, the usual set for so many.
      const stated: number = await libav.AVCodecContext_channel_layoutmask(c).catch(() => 0)
      const layout = stated > 0 ? stated : (DEFAULT_LAYOUTS[channels] ?? 0)
      if (layout === 0) throw new Refusal(`This sound has ${channels} channels, more than Omsett can lay out`)
      // Every frame is given that layout, so that a file that named none is read as the usual one.
      for (const found of frames as Array<{ channel_layout?: number; channels?: number }>) {
        if (typeof found !== 'object' || found instanceof Number) continue
        found.channel_layout = layout
        found.channels = channels
      }
      // The sample format by FFmpeg's name for it: libav.js reads the number 0 (unsigned 8-bit) as none given.
      const inFormat: string = await libav.av_get_sample_fmt_name(sampleFormat)
      const toFilter = frames.map((found) => (found instanceof Number ? found.valueOf() : found))
      let written: Uint8Array
      if (input.to.id === 'wav') {
        // Kept at the depth it was decoded at: 24 bits and more stay 32, everything else is 16.
        const outFormat = lossless ? libav.AV_SAMPLE_FMT_S32 : libav.AV_SAMPLE_FMT_S16
        const [, src, sink] = await libav.ff_init_filter_graph('anull', { sample_rate: rate, sample_fmt: inFormat, channel_layout: layout }, { sample_rate: rate, sample_fmt: outFormat, channel_layout: layout })
        const out: Array<{ data: Int16Array | Int32Array }> = await libav.ff_filter_multi(src, sink, frame, toFilter, true)
        written = wav(out.map((found) => found.data), channels, rate, lossless ? 32 : 16)
      } else {
        const target = TARGETS[input.to.id]
        if (!target) throw new Error(`The audio-libav engine does not write ${input.to.id}`)
        const quality = String(input.options.soundQuality ?? 'standard')
        const outRate = target.rate ?? rate
        // What keeps every bit is packed at the depth the sound has: 16 bits stays 16, deeper stays 32.
        const depth = target.sampleFormat === 's32p' && !lossless ? 's16p' : target.sampleFormat
        const outFormat = libav[`AV_SAMPLE_FMT_${depth.toUpperCase()}`] as number
        // Opus and Apple Lossless take surround sound in their own usual layouts only; a file laid
        // out another way (5.1 with side speakers, as FLAC has it) is moved onto theirs.
        const outLayout = ['libopus', 'alac'].includes(target.codec) ? (DEFAULT_LAYOUTS[channels] ?? layout) : layout
        const ctx: Record<string, number> = { sample_fmt: outFormat, sample_rate: outRate, channel_layout: outLayout, channels }
        const options: Record<string, string> = {}
        if (target.codec === 'libopus') {
          ctx.bit_rate = (OPUS_BITS[quality] ?? OPUS_BITS.standard!) * Math.max(1, channels / 2)
          // More than two channels is surround sound, which Opus carries by a mapping of its own.
          if (channels > 2) options.mapping_family = '1'
        }
        // Vorbis is told how good to sound, and finds its own size: FFmpeg's "-q:a".
        if (target.codec === 'libvorbis') {
          options.flags = '+qscale'
          options.global_quality = String((VORBIS_QUALITY[quality] ?? 5) * QP2LAMBDA)
        }
        let encoder: [number, number, number, number, number]
        try {
          encoder = await libav.ff_init_encoder(target.codec, { ctx, options })
        } catch {
          throw new Refusal(`This sound cannot be written as ${input.to.name}: it has ${channels} channels at ${rate} a second`)
        }
        const [, ec, eframe, epkt, frameSize] = encoder
        const [, src, sink] = await libav.ff_init_filter_graph(outLayout === layout ? 'anull' : 'aresample', { sample_rate: rate, sample_fmt: inFormat, channel_layout: layout }, { sample_rate: outRate, sample_fmt: outFormat, channel_layout: outLayout, frame_size: frameSize || undefined })
        const filtered = await libav.ff_filter_multi(src, sink, frame, toFilter, true)
        throwIfAborted(input.signal)
        input.onProgress(0.7)
        const packets = await libav.ff_encode_multi(ec, eframe, epkt, filtered, true)
        const [oc, , pb] = await libav.ff_init_muxer({ format_name: target.format, filename: outName, open: true }, [[ec, 1, outRate]])
        await libav.avformat_write_header(oc, 0)
        await libav.ff_write_multi(oc, epkt, packets)
        await libav.av_write_trailer(oc)
        await libav.ff_free_muxer(oc, pb)
        await libav.ff_free_encoder(ec, eframe, epkt)
        written = await libav.readFile(outName)
      }
      await libav.ff_free_decoder(c, pkt, frame)
      input.onProgress(1)
      return [{ name: outputName(input.name, input.to), format: input.to.id, blob: new Blob([written as BlobPart], { type: input.to.mime[0] }) }]
    } finally {
      if (fmt) await libav.avformat_close_input_js(fmt).catch(() => {})
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

/** Interleaved whole numbers as a WAV, 16 or 32 bits to a sample. */
function wav(parts: Array<Int16Array | Int32Array>, channels: number, rate: number, bits: 16 | 32): Uint8Array {
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
  view.setUint16(20, 1, true)
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
