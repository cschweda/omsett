/**
 * Inflate a gzip file, stopping at `limit` bytes. Returns what was read and whether the limit
 * cut it short. A few kilobytes of gzip can hold gigabytes; nothing here reads without a limit.
 * A stream that ends early or is damaged returns what came before the damage.
 */
export async function gunzip(blob: Blob, limit: number): Promise<{ bytes: Uint8Array; complete: boolean }> {
  const chunks: Uint8Array[] = []
  let total = 0
  let complete = false
  const reader = blob.stream().pipeThrough(new DecompressionStream('gzip')).getReader()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) {
        complete = true
        break
      }
      const room = limit - total
      chunks.push(value.length > room ? value.subarray(0, room) : value)
      total += Math.min(value.length, room)
      if (total >= limit) break
    }
  } catch {
    // truncated or damaged: keep what there is
  } finally {
    await reader.cancel().catch(() => {})
  }
  const bytes = new Uint8Array(total)
  let at = 0
  for (const chunk of chunks) {
    bytes.set(chunk, at)
    at += chunk.length
  }
  return { bytes, complete }
}
