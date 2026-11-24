/**
 * Whether a Photoshop file (PSD, or the large PSB) holds everything it says it holds.
 *
 * The file is a header and four sections, each of which gives its own length, the last being
 * the finished picture. A decoder asked for a picture that stops halfway hands back the half
 * it found and blank for the rest, so the lengths are added up here first.
 */
export function photoshopProblem(bytes: Uint8Array): string | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (bytes.length < 26) return 'the file is shorter than its own header'
  const version = view.getUint16(4)
  if (version !== 1 && version !== 2) return 'the file gives a version that does not exist'
  const large = version === 2
  const channels = view.getUint16(12)
  const height = view.getUint32(14)
  const width = view.getUint32(18)
  const depth = view.getUint16(22)
  if (channels < 1 || channels > 56 || width < 1 || height < 1 || ![1, 8, 16, 32].includes(depth)) {
    return 'the header describes a picture that cannot exist'
  }

  // Colour table, then notes and settings, then the layers: each a length and that many bytes.
  let at = 26
  for (const wide of [false, false, large]) {
    const size = wide ? 8 : 4
    if (at + size > bytes.length) return 'the file stops before its picture'
    const length = wide ? Number(view.getBigUint64(at)) : view.getUint32(at)
    at += size + length
    if (at > bytes.length) return 'a part of the file is longer than the file'
  }

  // The finished picture: how it is packed, then every channel, row by row.
  if (at + 2 > bytes.length) return 'the file stops before its picture'
  const packing = view.getUint16(at)
  at += 2
  const rows = channels * height
  if (packing === 0) {
    const row = Math.ceil((width * depth) / 8)
    return at + rows * row > bytes.length ? 'the picture stops partway' : null
  }
  if (packing === 1) {
    // Each row is packed, and a list of how long each one came out comes first.
    const each = large ? 4 : 2
    if (at + rows * each > bytes.length) return 'the picture stops partway'
    let packed = 0
    for (let row = 0; row < rows; row++) packed += large ? view.getUint32(at + row * 4) : view.getUint16(at + row * 2)
    return at + rows * each + packed > bytes.length ? 'the picture stops partway' : null
  }
  // Two other packings exist and are not used for the finished picture. The decoder decides.
  return null
}
