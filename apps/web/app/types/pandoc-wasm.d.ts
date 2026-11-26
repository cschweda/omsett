// Pandoc's own loader (src/core.js in the pandoc-wasm package), reached through an alias in
// nuxt.config.ts: it starts Pandoc from bytes it is given, and fetches nothing.
declare module 'pandoc-wasm/core' {
  export function createPandocInstance(wasm: Uint8Array | ArrayBuffer): Promise<{
    convert(options: Record<string, unknown>, stdin: string, files: Record<string, string | Blob>): Promise<{ stdout: string; stderr: string; files: Record<string, Blob> }>
  }>
}
