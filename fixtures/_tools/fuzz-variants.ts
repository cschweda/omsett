// The ways a sample is damaged for the fuzzer. Every variant is the sound file with one thing
// changed, and the things changed are the ones that break readers written in C: a size or a
// count or an offset set to nothing, to the largest value its field holds, or to the values
// either side of where a signed number turns negative.

export interface Variant {
  what: string
  bytes: Uint8Array
}

/** How far into the file fields are overwritten. Headers, where the sizes and counts are. */
const HEAD = 64
/** And how far back from the end, where formats that keep their directory last keep it. */
const TAIL = 32

const FOUR = [0x0000_0000, 0xFFFF_FFFF, 0x7FFF_FFFF, 0x8000_0000]
const TWO = [0xFFFF]

export function variantsOf(sample: Uint8Array): Variant[] {
  const variants: Variant[] = []
  const write = (at: number, width: 2 | 4, value: number, little: boolean) => {
    if (at < 0 || at + width > sample.length) return
    const bytes = sample.slice()
    const view = new DataView(bytes.buffer)
    if (width === 4) view.setUint32(at, value, little)
    else view.setUint16(at, value, little)
    // A value that is already there changes nothing and tests nothing.
    if (bytes.every((byte, i) => byte === sample[i])) return
    variants.push({ what: `${width * 8}-bit 0x${value.toString(16)} ${little ? 'little' : 'big'}-endian at byte ${at}`, bytes })
  }
  const places = [
    ...Array.from({ length: Math.min(HEAD, sample.length) / 2 }, (_, i) => i * 2),
    ...Array.from({ length: TAIL / 2 }, (_, i) => sample.length - TAIL + i * 2).filter((at) => at >= HEAD),
  ]
  for (const at of places) {
    for (const value of FOUR) {
      write(at, 4, value, false)
      // Read the other way round these two are themselves, and need no second try.
      if (value !== 0 && value !== 0xFFFF_FFFF) write(at, 4, value, true)
    }
    for (const value of TWO) {
      write(at, 2, value, false)
      if (value !== 0 && value !== 0xFFFF) write(at, 2, value, true)
    }
  }
  // Cut short, at lengths that fall inside the header, just past it, and near the end.
  for (const length of [1, 4, 8, 16, 32, 64, 128, Math.floor(sample.length / 2), sample.length - 16, sample.length - 1]) {
    if (length > 0 && length < sample.length) variants.push({ what: `cut to ${length} bytes`, bytes: sample.slice(0, length) })
  }
  // Every byte of the header turned over, a stretch at a time; and the file with its two halves swapped.
  for (const at of [8, 16, 24, 32, 48]) {
    if (at + 8 > sample.length) continue
    const bytes = sample.slice()
    for (let i = at; i < at + 8; i++) bytes[i] = bytes[i]! ^ 0xFF
    variants.push({ what: `eight bytes inverted at byte ${at}`, bytes })
  }
  return variants
}
