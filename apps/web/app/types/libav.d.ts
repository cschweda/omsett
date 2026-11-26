// Omsett's build of libav.js (packages/engines/vendor/libav): its loader and its glue.
declare module '@omsett/engines/vendor/libav/libav-omsett-audio.mjs' {
  const LibAV: { LibAV(options: Record<string, unknown>): Promise<Record<string, never>> }
  export default LibAV
}
declare module '@omsett/engines/vendor/libav/libav-6.11.9.0.2-omsett-audio.wasm.mjs' {
  const factory: (options: Record<string, unknown>) => Promise<unknown>
  export default factory
}
