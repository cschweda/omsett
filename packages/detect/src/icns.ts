import type { Dimensions } from './dimensions'

// A Mac icon is a list of entries, each a four-letter type, a length, and that many bytes.
// Most entries are the icon at one size. New files hold each size as a PNG; old ones pack
// red, green and blue with a run-length scheme and keep the transparency in an entry of its
// own; some from the years between hold JPEG 2000.

export interface IcnsPicture extends Dimensions {
  type: string
  /** How the picture is held: a PNG, the old packing, or JPEG 2000 (which is not read). */
  kind: 'png' | 'packed' | 'jp2'
  /** Where its bytes begin in the file, and how many there are. */
  start: number
  length: number
}
export interface Icns {
  /** The picture that is converted: the largest that can be read, and the first of equals. */
  best: IcnsPicture | null
  /** True where the file holds a JPEG 2000 picture, which explains finding nothing to read. */
  jp2: boolean
  /** Every entry, by type, for finding the transparency that goes with an old picture. */
  entries: Map<string, { start: number; length: number }>
}

/** The most entries read. A real icon has a dozen or two. */
export const ICNS_MAX_ENTRIES = 256
/** The old packed pictures: how many pixels a side, and which entry holds the transparency. */
export const ICNS_PACKED: Record<string, { side: number; mask: string }> = {
  is32: { side: 16, mask: 's8mk' },
  il32: { side: 32, mask: 'l8mk' },
  ih32: { side: 48, mask: 'h8mk' },
  it32: { side: 128, mask: 't8mk' },
}

const PNG = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]
const JP2 = [0x00, 0x00, 0x00, 0x0C, 0x6A, 0x50, 0x20, 0x20]
const J2K = [0xFF, 0x4F, 0xFF, 0x51]
const opens = (bytes: Uint8Array, magic: number[]) => bytes.length >= magic.length && magic.every((value, i) => bytes[i] === value)
const part = async (blob: Blob, start: number, length: number) => new Uint8Array(await blob.slice(start, start + length).arrayBuffer())

/**
 * What a Mac icon holds, from its list of entries and the first bytes of each: no picture is
 * decoded. An entry that says it runs past the end of the file ends the list where it stands.
 * A PNG's size is the one the PNG itself states, not the one its entry is named for.
 */
export async function readIcns(blob: Blob): Promise<Icns> {
  const found: Icns = { best: null, jp2: false, entries: new Map() }
  const head = await part(blob, 0, 8)
  if (head.length < 8 || String.fromCharCode(...head.subarray(0, 4)) !== 'icns') return found
  let at = 8
  for (let n = 0; n < ICNS_MAX_ENTRIES && at + 8 <= blob.size; n++) {
    const entry = await part(blob, at, 8 + 24)
    const type = String.fromCharCode(...entry.subarray(0, 4))
    const length = new DataView(entry.buffer).getUint32(4) - 8
    const start = at + 8
    if (length < 0 || start + length > blob.size) break
    at = start + length
    if (!found.entries.has(type)) found.entries.set(type, { start, length })

    const data = entry.subarray(8, 8 + Math.min(length, 24))
    let picture: IcnsPicture | null = null
    if (opens(data, PNG) && data.length >= 24) {
      const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
      picture = { type, kind: 'png', start, length, width: view.getUint32(16), height: view.getUint32(20) }
    } else if (opens(data, JP2) || opens(data, J2K)) {
      found.jp2 = true
    } else if (ICNS_PACKED[type]) {
      const side = ICNS_PACKED[type].side
      picture = { type, kind: 'packed', start, length, width: side, height: side }
    }
    if (!picture || !(picture.width > 0 && picture.height > 0)) continue
    const area = picture.width * picture.height
    const most = found.best ? found.best.width * found.best.height : 0
    // Of two the same size, a PNG is taken over the old packing: it is the newer of the two.
    if (area > most || (area === most && picture.kind === 'png' && found.best?.kind !== 'png')) found.best = picture
  }
  return found
}
