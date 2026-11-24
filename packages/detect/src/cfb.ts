// The container old Office files are kept in: Word, Excel and PowerPoint before 2007. It is a
// small filing system inside one file. The file is cut into sectors of equal size; a table says
// which sector follows which; a directory names the streams and says where each begins.
//
// Every number here comes from the file and is checked against the file before it is used: a
// chain of sectors that runs in a circle, a stream longer than the file, a table that points
// past the end. A file that fails any of these is not followed any further.

const SIGNATURE = [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]
/** The last sector of a chain, and anything above it, which is not a sector at all. */
const END = 0xFFFFFFFA
/** No more entries than this are read from a directory. An office file has a few dozen. */
const MAX_ENTRIES = 4096
/** No stream larger than this is taken out. */
export const MAX_STREAM_BYTES = 256 * 1024 * 1024

export interface Cfb {
  /** The name of every stream and folder in the file, as written. */
  names: string[]
  /** A stream by name, whatever the case of its letters, or null if there is none. */
  stream(name: string): Uint8Array | null
}

export const isCfb = (bytes: Uint8Array): boolean => bytes.length >= 512 && SIGNATURE.every((value, i) => bytes[i] === value)

const broken = () => new Error('not a compound file')

/** Open a compound file. Throws if it is not one, or cannot be followed. */
export function readCfb(bytes: Uint8Array): Cfb {
  if (!isCfb(bytes)) throw broken()
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const shift = view.getUint16(30, true)
  const miniShift = view.getUint16(32, true)
  if ((shift !== 9 && shift !== 12) || miniShift !== 6 || view.getUint16(28, true) !== 0xFFFE) throw broken()
  const size = 1 << shift
  // How many whole sectors the file holds. No number of a sector may be this or more.
  const sectors = Math.floor(bytes.length / size) - 1
  if (sectors < 1) throw broken()
  const at = (sector: number) => (sector + 1) * size
  const each = size / 4

  // The table of which sector follows which is itself kept in sectors, and a list says which.
  // The first 109 of that list are in the header; the rest, if any, in a chain of their own.
  const tables: number[] = []
  const count = view.getUint32(44, true)
  if (count > sectors) throw broken()
  for (let i = 0; i < 109 && tables.length < count; i++) tables.push(view.getUint32(76 + i * 4, true))
  for (let next = view.getUint32(68, true), seen = 0; tables.length < count; seen++) {
    if (next >= sectors || seen > sectors) throw broken()
    for (let i = 0; i < each - 1 && tables.length < count; i++) tables.push(view.getUint32(at(next) + i * 4, true))
    next = view.getUint32(at(next) + (each - 1) * 4, true)
  }
  if (tables.some((sector) => sector >= sectors)) throw broken()
  const following = (sector: number): number => {
    const table = tables[Math.floor(sector / each)]
    if (table === undefined) throw broken()
    return view.getUint32(at(table) + (sector % each) * 4, true)
  }

  /** The sectors of a chain, in order. A chain longer than the file is a circle. */
  const chain = (first: number, most = sectors): number[] => {
    const found: number[] = []
    for (let sector = first; sector < END; sector = following(sector)) {
      if (sector >= sectors || found.length >= most) throw broken()
      found.push(sector)
    }
    return found
  }
  const gather = (first: number, length: number): Uint8Array => {
    if (length > MAX_STREAM_BYTES || length > bytes.length) throw broken()
    const out = new Uint8Array(length)
    const parts = chain(first, Math.ceil(length / size) + 1)
    if (parts.length * size < length) throw broken()
    for (let i = 0, done = 0; done < length; i++, done += size) out.set(bytes.subarray(at(parts[i]!), at(parts[i]!) + Math.min(size, length - done)), done)
    return out
  }

  // The directory: entries of 128 bytes, each a name, a kind, a first sector and a length.
  const entries: Array<{ name: string; kind: number; first: number; length: number }> = []
  for (const sector of chain(view.getUint32(48, true))) {
    for (let entry = at(sector); entry < at(sector) + size; entry += 128) {
      const kind = bytes[entry + 66]!
      const long = view.getUint16(entry + 64, true)
      if (kind === 0 || long < 2 || long > 64) continue
      let name = ''
      for (let i = 0; i < long - 2; i += 2) name += String.fromCharCode(view.getUint16(entry + i, true))
      // A length is eight bytes. The upper four are nothing in any file small enough to read.
      if (view.getUint32(entry + 124, true) !== 0 && shift === 12) throw broken()
      entries.push({ name, kind, first: view.getUint32(entry + 116, true), length: view.getUint32(entry + 120, true) })
      if (entries.length > MAX_ENTRIES) throw broken()
    }
  }
  const root = entries.find((entry) => entry.kind === 5)
  if (!root) throw broken()

  // Streams under 4,096 bytes are kept together in one stream of small sectors, with a table of
  // its own. Both are read once, when the first small stream is asked for.
  const cutoff = view.getUint32(56, true)
  let small: { data: Uint8Array; table: Uint8Array } | undefined
  const little = (first: number, length: number): Uint8Array => {
    small ??= { data: gather(root.first, root.length), table: gather(view.getUint32(60, true), Math.min(view.getUint32(64, true), sectors) * size) }
    const table = new DataView(small.table.buffer)
    const out = new Uint8Array(length)
    let sector = first
    for (let done = 0; done < length; done += 64) {
      if (sector >= END || (sector + 1) * 64 > small.data.length + 63 || sector * 4 + 4 > small.table.length) throw broken()
      out.set(small.data.subarray(sector * 64, sector * 64 + Math.min(64, length - done)), done)
      sector = table.getUint32(sector * 4, true)
    }
    return out
  }

  return {
    names: entries.map((entry) => entry.name),
    stream(name) {
      const wanted = name.toLowerCase()
      const entry = entries.find((found) => found.kind === 2 && found.name.toLowerCase() === wanted)
      if (!entry) return null
      if (entry.length === 0) return new Uint8Array(0)
      return entry.length < cutoff ? little(entry.first, entry.length) : gather(entry.first, entry.length)
    },
  }
}

/** Larger compound files than this are not opened to see what they are. */
const MAX_LOOKED_AT = 64 * 1024 * 1024

/**
 * Which old Office file a compound file is, by the stream every one of that kind has. Never
 * throws: a file that cannot be followed is none of them.
 */
export async function officeKind(blob: Blob): Promise<'xls' | 'doc' | 'ppt' | null> {
  if (blob.size > MAX_LOOKED_AT) return null
  let bytes: Uint8Array
  try {
    bytes = new Uint8Array(await blob.arrayBuffer())
    const names = readCfb(bytes).names.map((name) => name.toLowerCase())
    if (names.includes('workbook') || names.includes('book')) return 'xls'
    if (names.includes('worddocument')) return 'doc'
    if (names.includes('powerpoint document')) return 'ppt'
    return null
  } catch {
    // A file too damaged to follow may still say what it was: the names of its streams are
    // written out in it, two bytes to a letter. Found, the file is taken for that kind, so that
    // it is refused as a damaged workbook and not passed over as something unknown.
    const holds = (name: string) => {
      const wanted = Uint8Array.from([...name].flatMap((letter) => [letter.charCodeAt(0), 0]))
      outer: for (let at = bytes!.indexOf(wanted[0]!); at >= 0 && at + wanted.length <= bytes!.length; at = bytes!.indexOf(wanted[0]!, at + 1)) {
        for (let i = 1; i < wanted.length; i++) if (bytes![at + i] !== wanted[i]) continue outer
        return true
      }
      return false
    }
    try {
      if (holds('Workbook')) return 'xls'
      if (holds('WordDocument')) return 'doc'
      if (holds('PowerPoint Document')) return 'ppt'
    } catch {
      // Not even that.
    }
    return null
  }
}
