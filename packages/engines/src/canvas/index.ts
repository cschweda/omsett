import { canvasInfo } from '../info'
import type { ConvertInput, ConvertOutput, Engine } from '../types'
import { outputName, qualityOption, throwIfAborted } from '../util'

/**
 * The browser's own encoder, through OffscreenCanvas. Nothing to download.
 *
 * `probeMime` is the type used to check that the browser really encodes what it is asked for:
 * some browsers answer a request for WebP with a PNG instead of failing, and treating that as
 * success would hand the user a mislabeled file.
 */
export function createCanvasEngine(probeMime: string): Engine {
  let probe: Promise<boolean> | undefined

  async function encodes(mime: string): Promise<boolean> {
    if (typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') return false
    try {
      const canvas = new OffscreenCanvas(1, 1)
      if (!canvas.getContext('2d')) return false
      const blob = await canvas.convertToBlob({ type: mime })
      return blob.type === mime
    } catch {
      return false
    }
  }

  return {
    ...canvasInfo,

    available() {
      probe ??= encodes(probeMime)
      return probe
    },

    async load() {},

    async convert(input: ConvertInput): Promise<ConvertOutput[]> {
      const { blob, to, signal, onProgress } = input
      const mime = to.mime[0]!
      throwIfAborted(signal)
      const bitmap = await createImageBitmap(blob)
      try {
        throwIfAborted(signal)
        onProgress(0.4)
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
        const context = canvas.getContext('2d')
        if (!context) throw new Error('Canvas 2D context unavailable')
        context.drawImage(bitmap, 0, 0)
        onProgress(0.6)
        const out = await canvas.convertToBlob({ type: mime, quality: qualityOption(input.options) / 100 })
        throwIfAborted(signal)
        if (out.type !== mime) throw new Error(`Browser returned ${out.type || 'nothing'} instead of ${mime}`)
        onProgress(1)
        return [{ name: outputName(input.name, to), format: to.id, blob: out }]
      } finally {
        bitmap.close()
      }
    },
  }
}
