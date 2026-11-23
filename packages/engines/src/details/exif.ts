// What a camera or a program wrote into a picture beside the picture: when it was taken, with
// what, and sometimes where. Read from the block of "EXIF" data that JPEG, TIFF, WebP, PNG, HEIC
// and AVIF files can all carry, which is a small TIFF file inside the picture.
//
// Every offset in it is checked against the block before it is followed, no list is read twice,
// and no list is longer than a camera writes. A block that lies is read as far as it is true.

export interface Exif {
  taken?: string
  camera?: string
  lens?: string
  software?: string
  artist?: string
  copyright?: string
  description?: string
  /** Latitude and longitude in degrees, where the picture records them. */
  location?: [number, number]
}

const MAX_ENTRIES = 512
const TAGS: Record<number, keyof Exif | 'make' | 'model' | 'exif' | 'gps' | 'modified'> = {
  0x010E: 'description',
  0x010F: 'make',
  0x0110: 'model',
  0x0131: 'software',
  0x0132: 'modified',
  0x013B: 'artist',
  0x8298: 'copyright',
  0x8769: 'exif',
  0x8825: 'gps',
  0x9003: 'taken',
  0xA434: 'lens',
}

/** Where a block of EXIF begins in the start of a file: the TIFF header inside it. -1 if there is none. */
export function findExif(head: Uint8Array): number {
  // A TIFF file is one already.
  if (isTiff(head, 0)) return 0
  // Everywhere else it follows the letters "Exif" and two zero bytes (JPEG, HEIC, AVIF), or
  // sits in a chunk of its own whose name is "EXIF" (WebP) or "eXIf" (PNG).
  for (let i = 0; i + 12 < head.length; i++) {
    const e = head[i]
    if (e !== 0x45 && e !== 0x65) continue
    const word = String.fromCodePoint(head[i]!, head[i + 1]!, head[i + 2]!, head[i + 3]!)
    if (word === 'Exif' && head[i + 4] === 0 && head[i + 5] === 0 && isTiff(head, i + 6)) return i + 6
    if ((word === 'EXIF' || word === 'eXIf') && isTiff(head, i + 8)) return i + 8
    if (word === 'EXIF' && isTiff(head, i + 14)) return i + 14
  }
  return -1
}

function isTiff(bytes: Uint8Array, at: number): boolean {
  const [a, b, c, d] = [bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]]
  return (a === 0x49 && b === 0x49 && c === 0x2A && d === 0) || (a === 0x4D && b === 0x4D && c === 0 && d === 0x2A)
}

export function readExif(head: Uint8Array): Exif | null {
  const start = findExif(head)
  if (start < 0) return null
  const block = head.subarray(start)
  const view = new DataView(block.buffer, block.byteOffset, block.byteLength)
  const little = block[0] === 0x49
  const found: Record<string, unknown> = {}
  const seen = new Set<number>()

  const text = (at: number, count: number) => {
    if (at < 0 || count <= 0 || count > 2048 || at + count > block.length) return undefined
    let out = ''
    for (let i = at; i < at + count && block[i] !== 0; i++) {
      // Only what can be printed: a name is never a control code.
      const code = block[i]!
      if ((code >= 0x20 && code <= 0x7E) || code >= 0xA0) out += String.fromCodePoint(code)
    }
    return out.trim() || undefined
  }
  const rational = (at: number) => (at + 8 <= block.length ? view.getUint32(at, little) / (view.getUint32(at + 4, little) || 1) : Number.NaN)

  const list = (offset: number, gps: boolean) => {
    if (offset < 8 || offset + 2 > block.length || seen.has(offset)) return
    seen.add(offset)
    const entries = Math.min(view.getUint16(offset, little), MAX_ENTRIES)
    for (let i = 0; i < entries; i++) {
      const at = offset + 2 + i * 12
      if (at + 12 > block.length) return
      const tag = view.getUint16(at, little)
      const type = view.getUint16(at + 2, little)
      const count = view.getUint32(at + 4, little)
      // A value of four bytes or fewer is held in the entry; a longer one is pointed to.
      const size = (type === 2 || type === 1 ? 1 : type === 3 ? 2 : type === 5 ? 8 : 4) * count
      const where = size <= 4 ? at + 8 : view.getUint32(at + 8, little)
      if (gps) {
        if ((tag === 1 || tag === 3) && type === 2) found[tag === 1 ? 'ns' : 'ew'] = text(where, count)
        if ((tag === 2 || tag === 4) && type === 5 && count === 3 && where + 24 <= block.length) {
          found[tag === 2 ? 'lat' : 'lon'] = rational(where) + rational(where + 8) / 60 + rational(where + 16) / 3600
        }
        continue
      }
      const name = TAGS[tag]
      if (!name) continue
      if (name === 'exif' || name === 'gps') list(view.getUint32(at + 8, little), name === 'gps')
      else if (type === 2) found[name] ??= text(where, count)
    }
  }
  if (block.length < 8) return null
  list(view.getUint32(4, little), false)

  const exif: Exif = {}
  const words = (key: string) => (typeof found[key] === 'string' ? (found[key] as string) : undefined)
  // "2026:11:23 14:30:00" is how a camera writes a date.
  const date = (words('taken') ?? words('modified'))?.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3')
  if (date) exif.taken = date
  const camera = [words('make'), words('model')].filter(Boolean).join(' ')
  if (camera) exif.camera = words('model')?.startsWith(words('make') ?? '\0') ? words('model')! : camera
  for (const key of ['lens', 'software', 'artist', 'copyright', 'description'] as const) if (words(key)) exif[key] = words(key)
  const [lat, lon] = [found.lat, found.lon]
  if (typeof lat === 'number' && typeof lon === 'number' && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
    exif.location = [found.ns === 'S' ? -lat : lat, found.ew === 'W' ? -lon : lon]
  }
  return Object.keys(exif).length > 0 ? exif : null
}
