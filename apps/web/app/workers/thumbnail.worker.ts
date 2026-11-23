// Draws a picture small, for its preview, off the main thread.
//
// This is the one place a browser's own decoder is handed a file as it was dropped. What it
// draws is only ever looked at: nothing made here is converted, saved or offered for download,
// so a decoder that forgives a damaged file can at worst show a damaged preview. What a
// preview can do is ask for memory, so a dropped file is drawn only if it states its size and
// that size is modest; previews are drawn one at a time (useEngines), against a clock.
import { detect, pixelCount } from '@omsett/detect'
import { registry } from '@omsett/registry'
import * as Comlink from 'comlink'
import { PREVIEW_MAX_PIXELS } from '~/utils/limits'

const api = {
  /** @param own true for a picture Omsett made itself, which needs no such check */
  async thumbnail(blob: Blob, size: number, own = false): Promise<ImageBitmap> {
    if (!own) {
      const found = await detect(blob, registry.formats)
      const pixels = found.kind === 'known' ? pixelCount(found.dimensions) : 0
      if (pixels === 0 || pixels > PREVIEW_MAX_PIXELS) throw new Error('No preview for a picture of this size')
    }
    const full = await createImageBitmap(blob)
    try {
      const scale = Math.min(1, size / Math.max(full.width, full.height))
      const width = Math.max(1, Math.round(full.width * scale))
      const height = Math.max(1, Math.round(full.height * scale))
      const canvas = new OffscreenCanvas(width, height)
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Canvas 2D context unavailable')
      context.drawImage(full, 0, 0, width, height)
      const small = canvas.transferToImageBitmap()
      return Comlink.transfer(small, [small])
    } finally {
      full.close()
    }
  },
}

export type ThumbnailWorkerApi = typeof api

Comlink.expose(api)
