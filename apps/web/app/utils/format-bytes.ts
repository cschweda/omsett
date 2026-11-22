/** 1536 → '1.5 KB'. Decimal places only where they carry information. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`
  const mb = kb / 1024
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`
}

/** '−63%' or '+4%': size change of the output against the input. */
export function formatDelta(inputBytes: number, outputBytes: number): string {
  if (inputBytes <= 0) return ''
  const change = Math.round(((outputBytes - inputBytes) / inputBytes) * 100)
  return `${change <= 0 ? '−' : '+'}${Math.abs(change)}%`
}
