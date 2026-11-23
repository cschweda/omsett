/**
 * Whether 512 bytes are a TAR header. TAR has no signature; what it has is a checksum of the
 * header inside the header, worked out with the checksum's own eight bytes taken as spaces.
 */
export function isTarHeader(block: Uint8Array): boolean {
  if (block.length < 512) return false
  let stated = ''
  for (let i = 148; i < 156; i++) stated += String.fromCodePoint(block[i]!)
  // Octal digits, then a NUL or a space, in any of the ways programs have written it.
  const digits = /^[ 0]*([0-7]{1,7})[ \0]*$/.exec(stated)
  if (!digits) return false
  let sum = 0
  for (let i = 0; i < 512; i++) sum += i >= 148 && i < 156 ? 0x20 : block[i]!
  return sum === Number.parseInt(digits[1]!, 8)
}
