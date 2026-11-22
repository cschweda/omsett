// Decodes a file for its preview, off the main thread. Only called after the pixel guard.
import * as Comlink from 'comlink'

const api = {
  async thumbnail(blob: Blob, size: number): Promise<ImageBitmap> {
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
