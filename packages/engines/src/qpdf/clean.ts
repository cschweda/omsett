// What may stay in a PDF that Omsett takes apart, decided over qpdf's JSON listing of the file
// (version 2: names as "/Name", references as "12 0 R", strings as "u:…" or "b:…"). Every
// object is walked, every dictionary inside it too, and what is changed is handed back to qpdf
// as an update. Allowed, rather than forbidden, where it can be: an action stays only if it goes
// to a page or to a web or mail address; an annotation stays, after drawing, only if it is a link.

type Value = unknown
type Dict = Record<string, Value>
interface Entry {
  value?: Value
  stream?: { dict: Dict }
}
export interface QpdfJson {
  qpdf: [Record<string, unknown>, Record<string, Entry>]
}
export interface Cleaned {
  /** The objects changed, as an update for `--update-from-json`. */
  changes: QpdfJson
  /** What was left out, in words for the person: "scripts", "comments". */
  removed: string[]
  /** Whether the file has layers (optional content) at all: they can hide a part of a page. */
  layers: boolean
  /** Whether it marks something to be redacted that has not been taken out yet. */
  redactions: boolean
}

/** Catalog entries that go: what runs on opening, the author's details, the structure, bookmarks. */
const CATALOG_OUT: Record<string, string> = {
  '/OpenAction': 'scripts and actions',
  '/AA': 'scripts and actions',
  '/Names': 'attached files, scripts and named places',
  '/Metadata': "the author's name and the document's details",
  '/StructTreeRoot': 'the accessibility tags',
  '/MarkInfo': '',
  '/Outlines': 'bookmarks',
  '/PieceInfo': '',
  '/Perms': '',
  '/Collection': 'attached files',
  '/Threads': '',
  '/Legal': '',
  '/SpiderInfo': '',
  '/Requirements': '',
  // Signatures' certificates, which name the signer.
  '/DSS': "the author's name and the document's details",
}
/** Keys that go wherever they are found. */
const EVERYWHERE_OUT = ['/AA', '/JS', '/Metadata', '/PieceInfo', '/StructParent', '/StructParents', '/Next', '/AF', '/EF', '/Ref']
/** Annotations that go before anything is drawn: notes, pop-ups, attachments, sound and film. */
const NOTES = new Set(['/Text', '/Popup', '/FileAttachment', '/Sound', '/Movie', '/Screen', '/RichMedia', '/3D', '/Projection'])
/** The only actions kept: a jump to a page of this file, and a web or mail address. */
const ACTIONS = new Set(['/GoTo', '/URI'])
const ADDRESS = /^(?:https?:\/\/|mailto:)/i

/** An annotation: it has a kind and a place on the page. Fonts have a kind too, and no place. */
const isAnnotation = (value: Dict) => value['/Type'] === '/Annot' || (typeof value['/Subtype'] === 'string' && '/Rect' in value)
const isDict = (value: Value): value is Dict => typeof value === 'object' && value !== null && !Array.isArray(value)
const isRef = (value: Value): value is string => typeof value === 'string' && /^\d+ \d+ R$/.test(value)
/** A JSON string's text: "u:…" is text, "b:…" is bytes in hex. */
function text(value: Value): string {
  if (typeof value !== 'string') return ''
  if (value.startsWith('u:')) return value.slice(2)
  if (value.startsWith('b:')) return (value.slice(2).match(/../g) ?? []).map((pair) => String.fromCharCode(Number.parseInt(pair, 16))).join('')
  return ''
}

export function clean(json: QpdfJson, stage: 'before' | 'after'): Cleaned {
  const [header, objects] = json.qpdf
  const changed: Record<string, Entry> = {}
  const removed = new Set<string>()
  const dictOf = (key: string): Dict | undefined => {
    const entry = objects[key]
    return isDict(entry?.value) ? entry.value : entry?.stream?.dict
  }
  const resolve = (value: Value): Value => (isRef(value) ? (objects[`obj:${value}`]?.value ?? dictOf(`obj:${value}`)) : value)

  /**
   * An action as it may stay, rebuilt from nothing: a jump to a place in this file, with only
   * where it goes, or a web or mail address, with only the address. Anything else is null.
   */
  const keptAction = (action: Value): Dict | null => {
    const found = resolve(action)
    if (!isDict(found) || !ACTIONS.has(found['/S'] as string)) return null
    if (found['/S'] === '/GoTo') return found['/D'] === undefined ? null : { '/S': '/GoTo', '/D': found['/D'] }
    return ADDRESS.test(text(found['/URI'])) ? { '/S': '/URI', '/URI': found['/URI'] } : null
  }
  /** An annotation's kind, and whether it goes at this stage. */
  const annotationGoes = (annotation: Value): boolean => {
    const found = resolve(annotation)
    if (!isDict(found)) return true
    const kind = found['/Subtype'] as string
    if (stage === 'after') return kind !== '/Link'
    return NOTES.has(kind)
  }

  /** A value with what may not stay taken out of every dictionary in it, however deep. */
  function scrub(value: Value, depth = 0): Value {
    if (depth > 64) return null
    if (Array.isArray(value)) return value.map((item) => scrub(item, depth + 1))
    if (!isDict(value)) return value
    const out: Dict = {}
    for (const [key, inner] of Object.entries(value)) {
      if (EVERYWHERE_OUT.includes(key)) {
        if (key === '/AA' || key === '/JS') removed.add('scripts and actions')
        if (key === '/Metadata') removed.add("the author's name and the document's details")
        if (key === '/AF' || key === '/EF') removed.add('attached files')
        if (key === '/Ref') removed.add('pictures kept in other files')
        continue
      }
      if (key === '/A' || key === '/PA') {
        const kept = keptAction(inner)
        if (kept) out[key] = kept
        else removed.add('scripts and actions')
        continue
      }
      // A page's beads link it to an article thread, which has a title of its own.
      if (key === '/B' && value['/Type'] === '/Page') continue
      // Who wrote an annotation, and what it said in a comment.
      if (key === '/T' && isAnnotation(value)) continue
      if ((key === '/RC' || key === '/Popup' || key === '/IRT') && isAnnotation(value)) {
        removed.add('comments')
        continue
      }
      if (key === '/Contents' && isAnnotation(value) && value['/Subtype'] !== '/Link') {
        if (stage === 'before' && text(inner)) removed.add('comments')
        continue
      }
      if (key === '/Annots' && Array.isArray(inner)) {
        const kept = inner.filter((annotation) => !annotationGoes(annotation))
        if (kept.length !== inner.length) {
          for (const annotation of inner.filter((found) => annotationGoes(found))) {
            const kind = (resolve(annotation) as Dict | undefined)?.['/Subtype']
            if (kind === '/FileAttachment') removed.add('attached files')
            else if (kind === '/Text' || kind === '/Popup') removed.add('comments')
            else if (stage === 'before') removed.add('sound, film and other media')
          }
        }
        out[key] = scrub(kept, depth + 1)
        continue
      }
      out[key] = scrub(inner, depth + 1)
    }
    return out
  }

  // Every object, cleaned where it needs to be.
  let redactions = false
  for (const [key, entry] of Object.entries(objects)) {
    if (key === 'trailer') continue
    if (isDict(entry.value) && entry.value['/Subtype'] === '/Redact') redactions = true
    if (entry.stream) {
      const dict = scrub(entry.stream.dict) as Dict
      if (JSON.stringify(dict) !== JSON.stringify(entry.stream.dict)) changed[key] = { stream: { dict } }
    } else if (entry.value !== undefined) {
      const value = scrub(entry.value)
      if (JSON.stringify(value) !== JSON.stringify(entry.value)) changed[key] = { value }
    }
  }

  // The catalog: what runs on opening, the author's details, the tags, the bookmarks. After the
  // annotations are drawn into the page, the form goes too.
  const trailer = { ...(objects.trailer?.value as Dict) }
  const rootKey = `obj:${trailer['/Root'] as string}`
  const catalog = { ...((changed[rootKey]?.value as Dict | undefined) ?? (objects[rootKey]?.value as Dict | undefined) ?? {}) }
  for (const [key, why] of Object.entries(CATALOG_OUT)) {
    if (key in catalog) {
      Reflect.deleteProperty(catalog, key)
      if (why) removed.add(why)
    }
  }
  if (stage === 'after' && '/AcroForm' in catalog) {
    delete catalog['/AcroForm']
    removed.add('forms (their filled-in words are kept, drawn on the page)')
  }
  if (stage === 'before' && isDict(resolve(catalog['/AcroForm']))) {
    // A form that is a program (XFA) does not survive even until the drawing.
    const form = { ...(resolve(catalog['/AcroForm']) as Dict) }
    if ('/XFA' in form) {
      delete form['/XFA']
      removed.add('scripts and actions')
      if (isRef(catalog['/AcroForm'])) changed[`obj:${catalog['/AcroForm']}`] = { value: scrub(form) }
      else catalog['/AcroForm'] = scrub(form)
    }
  }
  changed[rootKey] = { value: catalog }
  // The document's details: its author, its title, the program that made it. Emptied as well as
  // unlinked, since something else in the file may point to it.
  if ('/Info' in trailer) {
    if (isRef(trailer['/Info'])) changed[`obj:${trailer['/Info']}`] = { value: {} }
    delete trailer['/Info']
    removed.add("the author's name and the document's details")
  }
  changed.trailer = { value: trailer }

  // Layers: a list of them in the catalog, or any part of the file marked as belonging to one.
  // They can hide a part of a page by more rules than a check can follow (turned off, off when
  // viewed, off unless another is on), so any at all is enough.
  const layers = '/OCProperties' in catalog || Object.values(objects).some((entry) => /"\/(?:OC|OCG|OCMD)"/.test(JSON.stringify(entry.value ?? entry.stream?.dict ?? null)))

  return { changes: { qpdf: [header, changed] }, removed: [...removed], layers, redactions }
}
