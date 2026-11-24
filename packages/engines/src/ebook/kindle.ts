import { readIndex } from './index-table'
import { notBook, readMobi, type Book } from './mobi'

// A Kindle book taken apart into what any e-book is made of: chapters, each a page of HTML;
// the stylesheets they share; pictures; a list of contents; and what the book says of itself.
//
// The newer form of book (AZW3) stores each chapter as a frame and the pieces that go into it,
// with a table saying which piece goes where. The older form (MOBI) is one long page, with
// marks where a new page should start and links that give a place as a count of bytes.

export interface Parts {
  title: string
  authors: string[]
  language: string
  publisher: string | null
  description: string | null
  /** Pages of HTML, in reading order. Not yet cleaned: the writer cleans every one. */
  chapters: Array<{ file: string; html: string }>
  styles: Array<{ file: string; css: string }>
  pictures: Array<{ file: string; bytes: Uint8Array; type: string }>
  /** The picture that is the cover, if the book names one. */
  cover: string | null
  contents: Array<{ label: string; file: string; anchor: string | null; depth: number }>
}

const MAX_CHAPTERS = 5000
const MAX_PICTURES = 5000
const ascii = (bytes: Uint8Array, at: number, length: number) => String.fromCharCode(...bytes.subarray(at, Math.min(bytes.length, at + length)))
const padded = (n: number) => String(n).padStart(4, '0')
/**
 * Bytes as text, one letter to a byte, so that a place counted in bytes is the same place in
 * the text and the bytes can be had back exactly. (The decoder called "latin1" is not this: it
 * reads some bytes as letters that do not fit back into a byte.)
 */
function byteText(bytes: Uint8Array): string {
  let out = ''
  for (let at = 0; at < bytes.length; at += 8192) out += String.fromCharCode(...bytes.subarray(at, at + 8192))
  return out
}
const textBytes = (text: string) => Uint8Array.from(text, (letter) => letter.charCodeAt(0) & 0xFF)

/** Kindle writes some numbers in base 32, with the digits 0 to 9 and then A to V. */
const base32 = (text: string) => Number.parseInt(text, 32)

function pictureType(bytes: Uint8Array): { type: string; ending: string } | null {
  if (bytes[0] === 0xFF && bytes[1] === 0xD8) return { type: 'image/jpeg', ending: 'jpg' }
  if (bytes[0] === 0x89 && ascii(bytes, 1, 3) === 'PNG') return { type: 'image/png', ending: 'png' }
  if (ascii(bytes, 0, 4) === 'GIF8') return { type: 'image/gif', ending: 'gif' }
  return null
}

/** The records after the text that are pictures, by the number a book refers to each with (from 1). */
function picturesOf(book: Book): { byNumber: Map<number, string>; pictures: Parts['pictures'] } {
  const byNumber = new Map<number, string>()
  const pictures: Parts['pictures'] = []
  for (let i = book.firstResource, number = 1; i < book.records.length && number <= 65_535; i++, number++) {
    const record = book.records[i]!
    // Where two books share a file, a marker ends the first one's records.
    if (ascii(record, 0, 8) === 'BOUNDARY') break
    const found = pictureType(record)
    if (!found || pictures.length >= MAX_PICTURES) continue
    const file = `images/image${padded(number)}.${found.ending}`
    byNumber.set(number, file)
    pictures.push({ file, bytes: record, type: found.type })
  }
  return { byNumber, pictures }
}

function facts(book: Book) {
  const decoder = new TextDecoder(book.encoding)
  const words = (kind: number) => (book.facts.get(kind) ?? []).map((raw) => decoder.decode(raw).replaceAll('\0', '').trim()).filter(Boolean)
  const stated = words(524)[0] ?? ''
  return {
    authors: words(100).slice(0, 20),
    publisher: words(101)[0] ?? null,
    description: words(103)[0]?.slice(0, 4000) ?? null,
    language: /^[a-z]{2,3}(?:-[a-z0-9]{2,8}){0,2}$/i.test(stated) ? stated : 'en',
  }
}

/** The number a book gives for its cover: a place among its pictures, counted from nothing. */
function coverOf(book: Book, byNumber: Map<number, string>): string | null {
  const raw = book.facts.get(201)?.[0]
  if (!raw || raw.length !== 4) return null
  const at = new DataView(raw.buffer, raw.byteOffset, 4).getUint32(0)
  return at === 0xFFFFFFFF ? null : byNumber.get(at + 1) ?? null
}

// --- The newer form: AZW3 ------------------------------------------------------------------------
function newer(book: Book): Parts {
  const head = new DataView(book.head.buffer, book.head.byteOffset, book.head.byteLength)
  if (book.head.length < 264) throw notBook()
  const place = (at: number) => {
    const value = head.getUint32(at)
    return value === 0xFFFFFFFF ? null : value + book.base
  }
  const [flowsAt, piecesAt, framesAt, contentsAt] = [place(192), place(248), place(252), place(244)]
  if (piecesAt === null || framesAt === null) throw notBook()

  // The text is several things end to end: the pages, and then each stylesheet. A table says where each ends.
  const flows: Uint8Array[] = []
  const table = flowsAt === null ? undefined : book.records[flowsAt]
  if (table && ascii(table, 0, 4) === 'FDST' && table.length >= 12) {
    const view = new DataView(table.buffer, table.byteOffset, table.byteLength)
    const many = Math.min(view.getUint32(8), 4096)
    for (let i = 0, at = view.getUint32(4); i < many && at + 8 <= table.length; i++, at += 8) {
      const [from, to] = [view.getUint32(at), view.getUint32(at + 4)]
      if (from > to || to > book.text.length) throw notBook()
      flows.push(book.text.subarray(from, to))
    }
  }
  if (flows.length === 0) flows.push(book.text)
  const main = flows[0]!

  const frames = readIndex(book.records, framesAt, book.encoding).entries
  const pieces = readIndex(book.records, piecesAt, book.encoding).entries
  if (frames.length === 0 || frames.length > MAX_CHAPTERS) throw notBook()
  const decoder = new TextDecoder(book.encoding)
  // Pages are kept as bytes until the links are settled: a link gives a place as a count of bytes.
  const raw: string[] = []
  const pageStart: number[] = []
  /** For each piece, by its place in the list: which page it went into, and where in the text it was put. */
  const pageOfPiece: number[] = []
  const pieceAt: number[] = []
  let next = 0
  for (const [number, frame] of frames.entries()) {
    const many = frame.tags.get(1)?.[0] ?? 0
    const [start, length] = frame.tags.get(6) ?? []
    if (start === undefined || length === undefined || start + length > main.length) throw notBook()
    let page = main.subarray(start, start + length)
    let from = start + length
    for (let i = 0; i < many; i++, next++) {
      const piece = pieces[next]
      if (!piece) throw notBook()
      const size = piece.tags.get(6)?.[1]
      const into = Number(piece.name) - start
      if (size === undefined || !Number.isInteger(into) || into < 0 || into > page.length || from + size > main.length) throw notBook()
      const joined = new Uint8Array(page.length + size)
      joined.set(page.subarray(0, into))
      joined.set(main.subarray(from, from + size), into)
      joined.set(page.subarray(into), into + size)
      page = joined
      from += size
      pageOfPiece[next] = number
      pieceAt[next] = Number(piece.name)
    }
    raw.push(byteText(page))
    pageStart.push(start)
  }

  const { byNumber, pictures } = picturesOf(book)
  const fileOf = (page: number) => `part${padded(page)}.xhtml`
  const styles: Parts['styles'] = []
  const styleFiles = new Map<number, string>()
  for (let i = 1; i < flows.length; i++) {
    const text = decoder.decode(flows[i]!)
    // A flow that is a drawing is passed over; the rest are stylesheets.
    if (/^\s*<(?:\?xml|svg)/i.test(text)) continue
    styleFiles.set(i, `styles/style${padded(i)}.css`)
    styles.push({ file: `styles/style${padded(i)}.css`, css: text })
  }

  // A link inside the book names a piece and a count of bytes into it. That is a place on a
  // page: the tag there is given a name, if it has none, and the link is pointed at the name.
  const POSITION = /kindle:pos:fid:([0-9A-V]+):off:([0-9A-V]+)/gi
  const placeOf = (piece: number, offset: number): { page: number; at: number } | null => {
    const page = pageOfPiece[piece]
    return page === undefined ? null : { page, at: pieceAt[piece]! + offset - pageStart[page]! }
  }
  const wanted = new Map<number, Set<number>>()
  const want = (place: { page: number; at: number } | null) => {
    if (!place || place.at <= 0 || place.at >= raw[place.page]!.length) return
    if (!wanted.has(place.page)) wanted.set(place.page, new Set())
    if (wanted.get(place.page)!.size < 100_000) wanted.get(place.page)!.add(place.at)
  }
  for (const page of raw) for (const found of page.matchAll(POSITION)) want(placeOf(base32(found[1]!), base32(found[2]!)))
  let listed: ReturnType<typeof readIndex> | null = null
  if (contentsAt !== null) {
    try {
      listed = readIndex(book.records, contentsAt, book.encoding)
      for (const entry of listed.entries) {
        const [piece, offset] = entry.tags.get(6) ?? []
        if (piece !== undefined) want(placeOf(piece, offset ?? 0))
      }
    } catch {
      // A book whose list of contents cannot be read still has its pages.
    }
  }
  const named = new Map<string, string>()
  let made = 0
  for (const [page, places] of wanted) {
    let text = raw[page]!
    const body = text.search(/<body[\s>]/i)
    // From the end, so that giving one tag a name does not move the places before it.
    for (const at of [...places].sort((a, b) => b - a)) {
      // The tag at that place, or the one it falls inside, or the nearest opening tag before it.
      let start = text[at] === '<' ? at : text.lastIndexOf('<', at)
      for (let tries = 0; start >= 0 && tries < 64 && /^<[/!?]/.test(text.slice(start, start + 2)); tries++) start = text.lastIndexOf('<', start - 1)
      const end = start < 0 ? -1 : text.indexOf('>', start)
      if (start < body || end < 0 || end - start > 4096) continue
      const tag = text.slice(start, end + 1)
      const has = /\sid\s*=\s*["']([^"'\s<>]{1,200})["']/i.exec(tag)
      const opens = /^<[a-z][a-z0-9]*/i.exec(tag)
      if (has) named.set(`${page}:${at}`, has[1]!)
      else if (opens) {
        const id = `kpos${++made}`
        text = `${text.slice(0, start + opens[0].length)} id="${id}"${text.slice(start + opens[0].length)}`
        named.set(`${page}:${at}`, id)
      }
    }
    raw[page] = text
  }
  const linkTo = (piece: number, offset: number): string => {
    const place = placeOf(piece, offset)
    if (!place) return ''
    const id = named.get(`${place.page}:${place.at}`)
    return `${fileOf(place.page)}${id ? `#${id}` : ''}`
  }

  /** A book's own addresses, turned into the names its parts are given here. `up` is the way out of a folder. */
  const relinked = (text: string, up: string) =>
    text
      .replace(/kindle:embed:([0-9A-V]+)(?:\?mime=[^"')\s]*)?/gi, (_, n: string) => (byNumber.has(base32(n)) ? up + byNumber.get(base32(n))! : ''))
      .replace(/kindle:flow:([0-9A-V]+)(?:\?mime=[^"')\s]*)?/gi, (_, n: string) => (styleFiles.has(base32(n)) ? up + styleFiles.get(base32(n))! : ''))
      .replace(POSITION, (_, piece: string, offset: string) => linkTo(base32(piece), base32(offset)))
  for (const style of styles) style.css = relinked(style.css, '../')
  // Now that only plain letters have been put in, the bytes are read as the text they are.
  const pages = raw.map((page) => decoder.decode(textBytes(page)))

  const contents: Parts['contents'] = []
  for (const entry of (listed?.entries ?? []).slice(0, 20_000)) {
    const label = listed!.texts.get(entry.tags.get(3)?.[0] ?? -1)?.replace(/\s+/g, ' ').trim()
    const [piece, offset] = entry.tags.get(6) ?? []
    const place = piece === undefined ? null : placeOf(piece, offset ?? 0)
    if (label && place) contents.push({ label: label.slice(0, 500), file: fileOf(place.page), anchor: named.get(`${place.page}:${place.at}`) ?? null, depth: Math.min(entry.tags.get(4)?.[0] ?? 0, 6) })
  }
  return { title: book.title, ...facts(book), chapters: pages.map((html, i) => ({ file: fileOf(i), html: relinked(html, '') })), styles, pictures, cover: coverOf(book, byNumber), contents }
}

// --- The older form: MOBI ------------------------------------------------------------------------
function older(book: Book): Parts {
  const { byNumber, pictures } = picturesOf(book)
  // Links give a place as a count of bytes into the text. A mark is put at each such place,
  // working from the end so that the counts stay true, and the links are pointed at the marks.
  const text = book.text.subarray(0, book.pages)
  const latin = byteText(text)
  const places = new Set<number>()
  for (const found of latin.matchAll(/\bfilepos\s*=\s*["']?(\d{1,10})/gi)) places.add(Number(found[1]))
  const contents: Array<{ label: string; place: number; depth: number }> = []
  const head = new DataView(book.head.buffer, book.head.byteOffset, book.head.byteLength)
  const contentsAt = book.head.length >= 248 ? head.getUint32(244) : 0xFFFFFFFF
  if (contentsAt !== 0xFFFFFFFF) {
    try {
      const index = readIndex(book.records, contentsAt + book.base, book.encoding)
      for (const entry of index.entries.slice(0, 20_000)) {
        const label = index.texts.get(entry.tags.get(3)?.[0] ?? -1)?.replace(/\s+/g, ' ').trim()
        const place = entry.tags.get(1)?.[0]
        if (label && place !== undefined && place < text.length) {
          contents.push({ label: label.slice(0, 500), place, depth: Math.min(entry.tags.get(4)?.[0] ?? 0, 6) })
          places.add(place)
        }
      }
    } catch {
      // No list of contents, then.
    }
  }
  const sorted = [...places].filter((place) => place > 0 && place < text.length).sort((a, b) => a - b).slice(0, 100_000)
  const pieces: Uint8Array[] = []
  const encoder = new TextEncoder()
  let from = 0
  for (const place of sorted) {
    // A place inside a tag is moved back to the start of the tag.
    let at = place
    const before = latin.lastIndexOf('<', place - 1)
    if (before >= from && latin.indexOf('>', before) >= place) at = before
    pieces.push(text.subarray(from, at), encoder.encode(`<a id="filepos${place}"></a>`))
    from = at
  }
  pieces.push(text.subarray(from))
  const marked = new Uint8Array(pieces.reduce((sum, piece) => sum + piece.length, 0))
  let to = 0
  for (const piece of pieces) {
    marked.set(piece, to)
    to += piece.length
  }
  let html = new TextDecoder(book.encoding).decode(marked)
  html = html.replace(/<img(\s(?:[^>]*?\s)?)recindex\s*=\s*["']?(\d{1,6})["']?/gi, (_, before: string, n: string) => `<img${before}src="${byNumber.get(Number(n)) ?? ''}"`)

  // One page for each stretch between the marks that say "new page here".
  const body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? html
  const stretches = body.split(/<mbp:pagebreak\s*\/?>(?:<\/mbp:pagebreak>)?/i).filter((stretch) => stretch.replace(/<[^>]*>|\s+/g, '') !== '' || /<img/i.test(stretch)).slice(0, MAX_CHAPTERS)
  if (stretches.length === 0) throw notBook()
  const fileOf = (page: number) => `part${padded(page)}.xhtml`
  const where = new Map<number, number>()
  for (const [i, stretch] of stretches.entries()) for (const found of stretch.matchAll(/<a id="filepos(\d+)"><\/a>/g)) where.set(Number(found[1]), i)
  const chapters = stretches.map((stretch, i) => ({
    file: fileOf(i),
    html: stretch.replace(/(<a\s(?:[^>]*?\s)?)filepos\s*=\s*["']?(\d{1,10})["']?/gi, (_, before: string, n: string) => `${before}href="${where.has(Number(n)) ? `${where.get(Number(n)) === i ? '' : fileOf(where.get(Number(n))!)}#filepos${Number(n)}` : '#'}"`),
  }))
  return {
    title: book.title,
    ...facts(book),
    chapters,
    styles: [],
    pictures,
    cover: coverOf(book, byNumber),
    contents: contents.filter((entry) => where.has(entry.place)).map((entry) => ({ label: entry.label, file: fileOf(where.get(entry.place)!), anchor: `filepos${entry.place}`, depth: entry.depth })),
  }
}

/** A Kindle book, of either form, as the parts of an e-book. */
export function readKindle(bytes: Uint8Array): Parts {
  const book = readMobi(bytes)
  return book.version >= 8 ? newer(book) : older(book)
}
