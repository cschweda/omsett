// Values → XML. Written here because the choices are Omsett's: what a name that is not a legal
// tag becomes, how a list is spelled, and what is left out because XML cannot hold it.

// Characters XML 1.0 does not allow at all, even escaped.
// eslint-disable-next-line no-control-regex -- control characters are exactly what this removes
const ILLEGAL = /[\u0000-\u0008\v\f\u000E-\u001F\uFFFE\uFFFF]/g

/** Text made safe to sit between two tags. */
export const text = (value: string) =>
  value.replace(ILLEGAL, '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
const attribute = (value: string) => text(value).replaceAll('"', '&quot;').replaceAll('\n', '&#10;')

/** Any name → one XML accepts: letters, digits, and . - _ : only, not starting with a digit. */
function tagName(name: string): string {
  const cleaned = name.replace(/[^\p{L}\p{N}._:-]/gu, '_')
  return /^[\p{L}_]/u.test(cleaned) ? cleaned : `_${cleaned}`
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const isPlain = (value: unknown): value is string | number | boolean =>
  typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'

function element(name: string, value: unknown, indent: string, lines: string[]): void {
  const tag = tagName(name)
  if (Array.isArray(value)) {
    // A list inside a list has no name of its own to repeat, so its entries are called "item".
    lines.push(`${indent}<${tag}>`)
    for (const entry of value) element('item', entry, `${indent}  `, lines)
    lines.push(`${indent}</${tag}>`)
    return
  }
  if (!isRecord(value)) {
    const body = value === null || value === undefined ? '' : text(String(value))
    lines.push(body === '' ? `${indent}<${tag}/>` : `${indent}<${tag}>${body}</${tag}>`)
    return
  }
  let attributes = ''
  let body = ''
  const children: Array<[string, unknown]> = []
  for (const [key, child] of Object.entries(value)) {
    // The names XML read into: @name for an attribute, #text for the words between tags.
    if (key.startsWith('@') && key.length > 1 && (isPlain(child) || child === null)) {
      attributes += ` ${tagName(key.slice(1))}="${attribute(child === null ? '' : String(child))}"`
    } else if (key === '#text' && (isPlain(child) || child === null)) {
      body = child === null ? '' : text(String(child))
    } else children.push([key, child])
  }
  if (children.length === 0) {
    lines.push(body === '' ? `${indent}<${tag}${attributes}/>` : `${indent}<${tag}${attributes}>${body}</${tag}>`)
    return
  }
  lines.push(`${indent}<${tag}${attributes}>`)
  if (body !== '') lines.push(`${indent}  ${body}`)
  for (const [key, child] of children) {
    // A list is the same tag repeated, once for each entry.
    if (Array.isArray(child)) for (const entry of child) element(key, entry, `${indent}  `, lines)
    else element(key, child, `${indent}  `, lines)
  }
  lines.push(`${indent}</${tag}>`)
}

/**
 * A document has exactly one outermost tag. A value that is one named group already has it;
 * anything else is put inside <root>, a list as <root><item>…</item></root>.
 */
export function writeXml(value: unknown): string {
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>']
  const keys = isRecord(value) ? Object.keys(value) : []
  const only = keys.length === 1 ? keys[0]! : null
  const inner = only !== null && isRecord(value) ? value[only] : undefined
  if (only !== null && !only.startsWith('@') && only !== '#text' && !Array.isArray(inner)) {
    element(only, inner, '', lines)
  } else if (Array.isArray(value)) {
    element('root', { item: value }, '', lines)
  } else {
    element('root', value, '', lines)
  }
  return `${lines.join('\n')}\n`
}
