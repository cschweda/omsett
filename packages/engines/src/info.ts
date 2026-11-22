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
  // wasm-vips itself is MIT; the libvips it carries is used under LGPL-3.0-or-later.
  license: 'MIT AND LGPL-3.0-or-later',
  sourceUrl: 'https://github.com/kleisauke/wasm-vips',
}

// libvips with one of its optional modules. A separate engine, so the module is fetched only
// by someone who needs it. The size is the module plus libvips itself, which a browser will
// usually have cached already.
export const vipsHeifInfo: EngineInfo = {
  id: 'vips-heif',
  sizeBytes: 5_237_817 + 3_802_681,
  runtimes: ['browser', 'node'],
  // libheif and libaom join libvips here: LGPL-3.0-or-later and BSD-2-Clause.
  license: 'MIT AND LGPL-3.0-or-later AND BSD-2-Clause',
  sourceUrl: 'https://github.com/kleisauke/wasm-vips',
}

export const vipsJxlInfo: EngineInfo = {
  id: 'vips-jxl',
  sizeBytes: 5_237_817 + 2_224_543,
  runtimes: ['browser', 'node'],
  // libjxl is BSD-3-Clause.
  license: 'MIT AND LGPL-3.0-or-later AND BSD-3-Clause',
  sourceUrl: 'https://github.com/kleisauke/wasm-vips',
}

// libheif with libde265, from libheif-js: the loader script and its WebAssembly binary.
export const heifInfo: EngineInfo = {
  id: 'heif',
  sizeBytes: 1_463_506 + 91_255,
  runtimes: ['browser', 'node'],
  // libheif and libde265 are both LGPL-3.0.
  license: 'LGPL-3.0-or-later',
  sourceUrl: 'https://github.com/catdad-experiments/libheif-js',
}

/** The libvips module each engine needs, by file name, beyond libvips itself. */
export const vipsModules: Record<string, string[]> = {
  [vipsInfo.id]: [],
  [vipsHeifInfo.id]: ['vips-heif.wasm'],
  [vipsJxlInfo.id]: ['vips-jxl.wasm'],
}

export const engineInfo: Record<string, EngineInfo> = {
  [canvasInfo.id]: canvasInfo,
  [vipsInfo.id]: vipsInfo,
  [vipsHeifInfo.id]: vipsHeifInfo,
  [vipsJxlInfo.id]: vipsJxlInfo,
  [heifInfo.id]: heifInfo,
}
