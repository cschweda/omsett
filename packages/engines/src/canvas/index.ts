import { structureProblem } from '@omsett/detect'
import { dimensionProblem, type Format } from '@omsett/registry'
import { canvasInfo } from '../info'
import type { ConvertInput, ConvertOutput, Engine } from '../types'
import { outputName, qualityOption, throwIfAborted } from '../util'

/**
 * The browser's own decoder and encoder, through OffscreenCanvas. Nothing to download.
 *
 * Two things about browsers shape this engine. Their decoders forgive damaged files and return
 * the part they could read, so a file is decoded only after the app has verified its structure
 * itself; a file it cannot vouch for is refused, and a stricter engine takes it. And their
 * encoders may answer a request for one format with another (Safari returns a PNG when asked
 * for WebP), so what comes back is checked before it is called a success.
 */
export function createCanvasEngine(): Engine {
  const probes = new Map<string, Promise<boolean>>()

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

    available(target?: Format) {
      // Without a target: can this browser run the engine at all? PNG is always encodable.
      const mime = target?.mime[0] ?? 'image/png'
      let probe = probes.get(mime)
      if (!probe) probes.set(mime, (probe = encodes(mime)))
      return probe
    },

    async load() {},

    async convert(input: ConvertInput): Promise<ConvertOutput[]> {
      const { blob, from, to, signal, onProgress } = input
      const mime = to.mime[0]!
      throwIfAborted(signal)

      const damage = await structureProblem(from, blob)
      if (damage) throw new Error(`Not decoding ${input.name} in the browser: ${damage}`)
      throwIfAborted(signal)
      onProgress(0.2)

      const bitmap = await createImageBitmap(blob)
      try {
        throwIfAborted(signal)
        if (input.maxPixels !== undefined && bitmap.width * bitmap.height > input.maxPixels) {
          throw new Error('The picture is too large')
        }
        // Browsers clamp an oversized picture to the format's limit and report success.
        const tooLarge = dimensionProblem(to, bitmap.width, bitmap.height)
        if (tooLarge) throw new Error(tooLarge)
        onProgress(0.4)
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
        const context = canvas.getContext('2d')
        if (!context) throw new Error('Canvas 2D context unavailable')
        // A format without transparency gets a white ground. Left alone, the encoder would
        // turn every transparent pixel black.
        if (!to.traits.includes('alpha')) {
          context.fillStyle = '#ffffff'
          context.fillRect(0, 0, canvas.width, canvas.height)
        }
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
