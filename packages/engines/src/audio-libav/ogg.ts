// An Ogg file (Vorbis, Opus) is walked by Omsett before FFmpeg reads it, because FFmpeg's Ogg
// reader in libav.js plays a page whose checksum does not match, and a file cut between two pages
// reads as a whole file that is shorter. Each page states its own length and carries a checksum
// over itself; the walk follows them from the first byte to the last.

/** What is wrong with an Ogg file, or null if nothing the walk can see. */
export type OggProblem = 'damaged' | 'cut' | 'tracks' | null

const CRC = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let r = i << 24
    for (let bit = 0; bit < 8; bit++) r = r & 0x80000000 ? (r << 1) ^ 0x04C11DB7 : r << 1
    table[i] = r >>> 0
  }
  return table
})()

/** Ogg's checksum over a page from start to end, its own four bytes (at crcAt) counted as zero. */
export function checksum(bytes: Uint8Array, start: number, end: number, crcAt: number): number {
  let crc = 0
  for (let i = start; i < end; i++) {
    // The checksum's own four bytes count as zero.
    const byte = i >= crcAt && i < crcAt + 4 ? 0 : bytes[i]!
    crc = ((crc << 8) ^ CRC[((crc >>> 24) ^ byte) & 0xFF]!) >>> 0
  }
  return crc
}

/**
 * Walks every page: each must begin where the last ended, match its checksum, belong to the one
 * stream the first page began, and come next in that stream's count. The first page begins the
 * stream and only the last ends it. Anything else is damage, a cut, or a second track.
 */
export function oggProblem(bytes: Uint8Array): OggProblem {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let at = 0
  let serial = -1
  let sequence = 0
  let ended = false
  while (at < bytes.length) {
    if (at + 27 > bytes.length) return 'cut'
    if (view.getUint32(at) !== 0x4F676753 || bytes[at + 4] !== 0) return 'damaged'
    const kind = bytes[at + 5]!
    const segments = bytes[at + 26]!
    if (at + 27 + segments > bytes.length) return 'cut'
    let body = 0
    for (let i = 0; i < segments; i++) body += bytes[at + 27 + i]!
    const end = at + 27 + segments + body
    if (end > bytes.length) return 'cut'
    if (checksum(bytes, at, end, at + 22) !== view.getUint32(at + 22, true)) return 'damaged'
    const own = view.getUint32(at + 14, true)
    if (serial === -1) {
      if (!(kind & 2)) return 'damaged'
      serial = own
    } else if (own !== serial) {
      // A second stream: another track, a picture, a film, or a second file chained on.
      return 'tracks'
    } else if (kind & 2) {
      return 'damaged'
    }
    if (ended) return 'damaged'
    if (view.getUint32(at + 18, true) !== sequence) return 'damaged'
    sequence++
    if (kind & 4) ended = true
    at = end
  }
  if (serial === -1) return 'damaged'
  return ended ? null : 'cut'
}
