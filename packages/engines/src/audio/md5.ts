// MD5, which FLAC uses to sign its sound: sixteen bytes worked out from every number in the
// file, so that a reader can tell it has unpacked exactly what was packed. It is no use for
// keeping secrets and is not used for that here.

const SHIFTS = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21]
const SINES = Int32Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) | 0)

export class Md5 {
  private state = Int32Array.of(0x67452301, 0xEFCDAB89 | 0, 0x98BADCFE | 0, 0x10325476)
  private block = new Uint8Array(64)
  private words = new Int32Array(16)
  private held = 0
  private length = 0

  update(bytes: Uint8Array): this {
    this.length += bytes.length
    let at = 0
    if (this.held > 0) {
      const take = Math.min(64 - this.held, bytes.length)
      this.block.set(bytes.subarray(0, take), this.held)
      this.held += take
      at = take
      if (this.held < 64) return this
      this.round(this.block, 0)
      this.held = 0
    }
    for (; at + 64 <= bytes.length; at += 64) this.round(bytes, at)
    this.block.set(bytes.subarray(at))
    this.held = bytes.length - at
    return this
  }

  digest(): Uint8Array {
    const bits = this.length * 8
    const tail = new Uint8Array(((this.held + 8) >> 6 << 6) + 64 - this.held)
    tail[0] = 0x80
    const view = new DataView(tail.buffer)
    view.setUint32(tail.length - 8, bits >>> 0, true)
    view.setUint32(tail.length - 4, Math.floor(bits / 2 ** 32), true)
    this.update(tail)
    return new Uint8Array(this.state.buffer.slice(0))
  }

  private round(bytes: Uint8Array, at: number): void {
    const w = this.words
    for (let i = 0; i < 16; i++) w[i] = bytes[at + i * 4]! | (bytes[at + i * 4 + 1]! << 8) | (bytes[at + i * 4 + 2]! << 16) | (bytes[at + i * 4 + 3]! << 24)
    let [a, b, c, d] = this.state as unknown as [number, number, number, number]
    for (let i = 0; i < 64; i++) {
      let f: number
      let g: number
      if (i < 16) [f, g] = [(b & c) | (~b & d), i]
      else if (i < 32) [f, g] = [(d & b) | (~d & c), (5 * i + 1) & 15]
      else if (i < 48) [f, g] = [b ^ c ^ d, (3 * i + 5) & 15]
      else [f, g] = [c ^ (b | ~d), (7 * i) & 15]
      const sum = (a + f + SINES[i]! + w[g]!) | 0
      const turn = SHIFTS[((i >> 4) << 2) | (i & 3)]!
      a = d
      d = c
      c = b
      b = (b + ((sum << turn) | (sum >>> (32 - turn)))) | 0
    }
    this.state[0] = (this.state[0]! + a) | 0
    this.state[1] = (this.state[1]! + b) | 0
    this.state[2] = (this.state[2]! + c) | 0
    this.state[3] = (this.state[3]! + d) | 0
  }
}
