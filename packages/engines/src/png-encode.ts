import { crc32 } from '@omsett/detect'

const SIGNATURE = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i)
  out.set(data, 8)
  view.setUint32(8 + data.length, crc32(out, 4, 8 + data.length))
  return out
}

/**
 * Write eight-bit RGBA pixels as a PNG. For engines that decode to plain pixels and have no
 * encoder of their own. Uses the platform's deflate, so it runs in a worker and in Node alike.
 */
export async function encodePng(rgba: Uint8Array | Uint8ClampedArray, width: number, height: number): Promise<Blob> {
  const stride = width * 4
  if (rgba.length !== stride * height) throw new Error('Pixel data does not match the stated size')

  // Each row is stored as the difference from the pixel to its left ("Sub"), which deflate
  // compresses far better than the raw values.
  const raw = new Uint8Array((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    const source = y * stride
    const target = y * (stride + 1)
    raw[target] = 1
    for (let x = 0; x < stride; x++) {
      raw[target + 1 + x] = (rgba[source + x]! - (x >= 4 ? rgba[source + x - 4]! : 0)) & 0xFF
    }
  }
  const deflated = new Uint8Array(
    await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer(),
  )

  const header = new Uint8Array(13)
  const view = new DataView(header.buffer)
  view.setUint32(0, width)
  view.setUint32(4, height)
  header[8] = 8 // bits per channel
  header[9] = 6 // red, green, blue, alpha
  return new Blob(
    [new Uint8Array(SIGNATURE), chunk('IHDR', header), chunk('IDAT', deflated), chunk('IEND', new Uint8Array(0))] as BlobPart[],
    { type: 'image/png' },
  )
}
