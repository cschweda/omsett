import type { Dimensions } from './dimensions'

/**
 * SVG is text, so it has no magic bytes. It is recognised by its root element: after an
 * optional byte-order mark, XML declaration, doctype and comments, the first tag must be <svg>.
 * Returns the opening tag, or null if this is not an SVG.
 */
export function svgRoot(head: Uint8Array): string | null {
  let text = new TextDecoder('utf-8', { fatal: false }).decode(head)
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1)
  // Skip what may come before the root: white space, an XML declaration, comments, a doctype.
  let at = 0
  for (;;) {
    while (at < text.length && /\s/.test(text[at]!)) at++
    let end: number
    if (text.startsWith('<?', at)) end = text.indexOf('?>', at) + 2
    else if (text.startsWith('<!--', at)) end = text.indexOf('-->', at) + 3
    else if (/^<!doctype/i.test(text.slice(at, at + 9))) {
      // A doctype may hold an internal subset in square brackets, which may itself hold ">".
      const bracket = text.indexOf('[', at)
      const close = text.indexOf('>', at)
      end = (bracket >= 0 && bracket < close ? text.indexOf('>', text.indexOf(']', bracket)) : close) + 1
    } else break
    // An unfinished one: whatever this is, its root is not in view.
    if (end <= at) return null
    at = end
  }
  const tag = /^<svg(?=[\s>/])[^>]*>?/i.exec(text.slice(at))
  return tag ? tag[0] : null
}

/** A length in pixels, if the attribute is a plain number or in px. Other units are left to the engine. */
function pixels(value: string | undefined): number | null {
  const match = value === undefined ? null : /^(\d+(?:\.\d+)?|\.\d+)(?:px)?$/.exec(value.trim())
  return match ? Number(match[1]) : null
}

/** The size the root element states: width and height, or failing that the viewBox. */
export function svgDimensions(root: string): Dimensions | null {
  const attribute = (name: string) => new RegExp(`\\s${name}\\s*=\\s*(["'])(.*?)\\1`, 'i').exec(root)?.[2]
  const box = attribute('viewBox')?.trim().split(/[\s,]+/).map(Number)
  const width = pixels(attribute('width')) ?? (attribute('width') === undefined ? box?.[2] : undefined)
  const height = pixels(attribute('height')) ?? (attribute('height') === undefined ? box?.[3] : undefined)
  if (!width || !height || !Number.isFinite(width) || !Number.isFinite(height)) return null
  // Renderers round a fractional size up to whole pixels.
  return { width: Math.ceil(width), height: Math.ceil(height) }
}
