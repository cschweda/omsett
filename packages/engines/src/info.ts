import type { EngineInfo } from './types'

// Engine facts, importable without loading any engine code. The page reads these to show a
// download size before the first fetch; the engines spread them into their implementations.

export const canvasInfo: EngineInfo = {
  id: 'canvas',
  sizeBytes: 0,
  runtimes: ['browser'],
  // 4096 × 4096: a size every target browser's canvas accepts. Larger images go to vips.
  maxPixels: 16_777_216,
  license: 'MIT',
  sourceUrl: 'https://github.com/cschweda/omsett/tree/main/packages/engines/src/canvas',
}

export const vipsInfo: EngineInfo = {
  id: 'vips',
  // vips.wasm + its loader script, as shipped under /engines/. Checked against the real files
  // by a test, so it cannot drift when wasm-vips is upgraded.
  sizeBytes: 5_237_817,
  runtimes: ['browser', 'node'],
  license: 'MIT AND LGPL-2.1-or-later',
  sourceUrl: 'https://github.com/kleisauke/wasm-vips',
}

export const engineInfo: Record<string, EngineInfo> = {
  [canvasInfo.id]: canvasInfo,
  [vipsInfo.id]: vipsInfo,
}
