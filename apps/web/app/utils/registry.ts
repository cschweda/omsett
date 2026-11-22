import { createRouter, registry } from '@omsett/registry'
import type { Category } from '@omsett/registry'

export { registry }
export const router = createRouter(registry)

/** Headings for the picker. Categories are fixed by the registry's type, not by its data. */
export const categoryLabels: Record<Category, string> = {
  image: 'Image',
  vector: 'Vector',
  pdf: 'PDF',
  document: 'Document',
  spreadsheet: 'Spreadsheet',
  presentation: 'Presentation',
  text: 'Text & markup',
  data: 'Data',
  ebook: 'E-book',
  audio: 'Audio',
  subtitle: 'Subtitles',
  archive: 'Archive',
  font: 'Font',
  video: 'Video',
}
