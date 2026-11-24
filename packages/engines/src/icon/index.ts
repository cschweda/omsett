import { ICNS_PACKED, MAX_PIXELS, pngStructureProblem, readIcns, type Icns, type IcnsPicture } from '@omsett/detect'
import { iconInfo } from '../info'
import { encodePng } from '../png-encode'
import type { ConvertInput, ConvertOutput, Engine } from '../types'
import { outputName, Refusal, throwIfAborted } from '../util'

// Mac icons (ICNS). A file holds one icon at several sizes; the largest that can be read is
// taken out and handed on as a PNG. Where the icon holds a PNG already, that PNG is checked
// from end to end and passed on without its notes; where it holds the old packing, the pixels
// are unpacked here. Nothing is downloaded: this is Omsett's own code.

const DAMAGED = 'The picture inside this icon is damaged'
/** The parts of a PNG that are the picture. Everything else in one is a note about it. */
const PICTURE_CHUNKS = new Set(['IHDR', 'PLTE', 'tRNS', 'IDAT', 'IEND'])

/** A sound PNG without its comments, profiles, dates and anything else that is not the picture. */
function withoutNotes(png: Uint8Array): Uint8Array {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength)
  const kept: Uint8Array[] = [png.subarray(0, 8)]
  for (let at = 8; at + 12 <= png.length;) {
    const size = 12 + view.getUint32(at)
    const type = String.fromCharCode(...png.subarray(at + 4, at + 8))
    if (PICTURE_CHUNKS.has(type)) kept.push(png.subarray(at, at + size))
    at += size
    if (type === 'IEND') break
  }
  const out = new Uint8Array(kept.reduce((total, piece) => total + piece.length, 0))
  let to = 0
  for (const piece of kept) {
    out.set(piece, to)
    to += piece.length
  }
  return out
}

/**
 * The old packing: red, then green, then blue, each a run of bytes that either says "the next
 * n bytes as they are" or "the next byte, n times". Every count is checked against what is
 * left to read and what is left to fill; a run that overshoots either is a damaged file.
 */
function unpack(data: Uint8Array, side: number, mask: Uint8Array | null): Uint8Array {
  const pixels = side * side
  const rgba = new Uint8Array(pixels * 4).fill(255)
  // The largest size opens with four empty bytes that the others do not have.
  let at = side === 128 && data.length >= 4 && data[0] === 0 && data[1] === 0 && data[2] === 0 && data[3] === 0 ? 4 : 0
  for (let channel = 0; channel < 3; channel++) {
    let filled = 0
    while (filled < pixels) {
      if (at >= data.length) throw new Refusal(DAMAGED)
      const lead = data[at++]!
      const repeated = lead >= 128
      const count = repeated ? lead - 125 : lead + 1
      if (count > pixels - filled || at + (repeated ? 1 : count) > data.length) throw new Refusal(DAMAGED)
      for (let i = 0; i < count; i++) rgba[(filled + i) * 4 + channel] = data[repeated ? at : at + i]!
      at += repeated ? 1 : count
      filled += count
    }
  }
  if (mask) {
    if (mask.length !== pixels) throw new Refusal(DAMAGED)
    for (let i = 0; i < pixels; i++) rgba[i * 4 + 3] = mask[i]!
  }
  return rgba
}

async function picture(blob: Blob, icon: Icns, best: IcnsPicture, most: number): Promise<Blob> {
  const held = blob.slice(best.start, best.start + best.length)
  if (best.kind === 'png') {
    // The PNG is passed on as it is, so it is checked first as any dropped PNG would be: every
    // checksum, and that its data opens out to exactly the picture its header describes.
    if (await pngStructureProblem(held, most)) throw new Refusal(DAMAGED)
    return new Blob([withoutNotes(new Uint8Array(await held.arrayBuffer())) as BlobPart], { type: 'image/png' })
  }
  const side = best.width
  const maskAt = icon.entries.get(ICNS_PACKED[best.type]!.mask)
  const mask = maskAt ? new Uint8Array(await blob.slice(maskAt.start, maskAt.start + maskAt.length).arrayBuffer()) : null
  return encodePng(unpack(new Uint8Array(await held.arrayBuffer()), side, mask), side, side)
}

export function createIconEngine(): Engine {
  return {
    ...iconInfo,
    available: async () => typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined',
    load: async () => {},
    async convert(input: ConvertInput): Promise<ConvertOutput[]> {
      const { blob, to, signal, onProgress } = input
      throwIfAborted(signal)
      const icon = await readIcns(blob)
      onProgress(0.2)
      if (!icon.best) {
        throw new Refusal(
          icon.jp2
            ? 'This icon keeps its pictures as JPEG 2000, which Omsett cannot yet read out of an icon'
            : 'No picture could be found in this icon',
        )
      }
      const most = input.maxPixels ?? MAX_PIXELS
      if (icon.best.width * icon.best.height > most) throw new RangeError('The picture is too large')
      const out = await picture(blob, icon, icon.best, most)
      throwIfAborted(signal)
      onProgress(1)
      return [{ name: outputName(input.name, to), format: to.id, blob: out }]
    },
  }
}
