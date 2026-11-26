import type { Format } from '@omsett/registry'
import { readZip } from '../archive/zip'
import { readTar } from '../archive/tar'
import { gunzipWithin } from '../archive/entries'
import { readSound } from '../audio'
import { readEpub, readKindle } from '../ebook'
import { readSfnt, readWoff } from '../font/sfnt'
import { readFountain } from '../script/fountain'
import { readCues } from '../subtitle/read'
import { readCfb } from '@omsett/detect'
import { listSheets } from '../data/sheet'
import { readExif } from './exif'
import { hasMacros, writtenBy } from './ole'

// What a file carries besides what it shows: who made it, when, with what, and where. Shown
// before a conversion, so that a person knows what they hold, and what a conversion will keep
// and what it will remove. Read here, in the worker, by the same readers that convert the file,
// with the same limits. Anything that cannot be read is simply not listed.

export interface Detail {
  label: string
  value: string
  /**
   * What happens to this when the file is converted: 'removed' for what Omsett leaves out on
   * purpose (who, where, with what), 'kept' for what it carries across. Left out where the
   * answer depends on the format chosen.
   */
  fate?: 'removed' | 'kept'
}

/** No more of a picture than this is looked through for what a camera wrote. */
const HEAD_BYTES = 512 * 1024
/** Larger files of the kinds that must be read whole are not opened for their details. */
const MAX_WHOLE_BYTES = 64 * 1024 * 1024

const decode = (bytes: Uint8Array) => new TextDecoder('utf-8').decode(bytes)
const count = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en')} ${n === 1 ? one : many}`
const clock = (ms: number) => {
  const s = Math.round(ms / 1000)
  return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}
/** The words inside the first tag of that name, in XML that has already been through the ZIP reader. */
const inTag = (xml: string, tag: string) => {
  const found = new RegExp(`<(?:[a-z]+:)?${tag}\\b[^>]*>([^<]{1,500})<`, 'i').exec(xml)?.[1]
  return found?.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').trim() || undefined
}

async function picture(blob: Blob): Promise<Detail[]> {
  const head = new Uint8Array(await blob.slice(0, HEAD_BYTES).arrayBuffer())
  const exif = readExif(head)
  const details: Detail[] = []
  const add = (label: string, value: string | undefined) => value && details.push({ label, value, fate: 'removed' })
  add('Taken', exif?.taken)
  add('Camera', exif?.camera)
  add('Lens', exif?.lens)
  if (exif?.location) add('Location', `${exif.location[0].toFixed(5)}, ${exif.location[1].toFixed(5)}`)
  add('Made with', exif?.software)
  add('By', exif?.artist)
  add('Copyright', exif?.copyright)
  add('Description', exif?.description)
  return details
}

async function office(blob: Blob, format: string): Promise<Detail[]> {
  const entries = await readZip(new Uint8Array(await blob.arrayBuffer()))
  const part = (name: string) => {
    const data = entries.find((entry) => entry.name.toLowerCase() === name)?.data
    return data && data.length < 8 * 1024 * 1024 ? decode(data) : ''
  }
  const core = part('docprops/core.xml')
  const app = part('docprops/app.xml')
  const details: Detail[] = []
  const add = (label: string, value: string | undefined, fate?: Detail['fate']) => value && details.push({ label, value, fate })
  add('Title', inTag(core, 'title'), 'kept')
  add('Author', inTag(core, 'creator'), 'removed')
  add('Last changed by', inTag(core, 'lastModifiedBy'), 'removed')
  add('Created', inTag(core, 'created')?.replace('T', ' ').replace('Z', ''), 'removed')
  add('Changed', inTag(core, 'modified')?.replace('T', ' ').replace('Z', ''), 'removed')
  add('Made with', inTag(app, 'Application'), 'removed')
  add('Company', inTag(app, 'Company'), 'removed')
  const names = entries.map((entry) => entry.name.toLowerCase())
  if (format === 'docx') {
    add('Pages', inTag(app, 'Pages'))
    add('Words', inTag(app, 'Words'))
    const body = part('word/document.xml')
    const tracked = (body.match(/<w:(?:del|ins)\b/g) ?? []).length
    if (tracked) add('Tracked changes', `${count(tracked, 'change')}. Deleted text is left out; inserted text is kept as ordinary text`, 'removed')
    if (names.includes('word/comments.xml')) add('Comments', 'Yes', 'removed')
    if (/<w:vanish\b/.test(body)) add('Hidden text', 'Yes', 'removed')
  }
  if (format === 'xlsx') {
    const sheets = [...part('xl/workbook.xml').matchAll(/<sheet\s([^>]*)>/g)]
    const hidden = sheets.filter((sheet) => /state="(?:hidden|veryHidden)"/.test(sheet[1]!)).length
    if (sheets.length) add('Sheets', `${sheets.length}${hidden ? `, ${hidden} hidden` : ''}. The first one shown is converted, unless you choose another`)
    if (/<f\b|<f>/.test(part('xl/worksheets/sheet1.xml'))) add('Formulas', 'Yes. Each is replaced by the value it last showed', 'removed')
  }
  if (format === 'pptx') {
    add('Slides', inTag(app, 'Slides'))
    const notes = names.filter((name) => name.startsWith('ppt/notesslides/')).length
    if (notes) add('Speaker notes', `On ${count(notes, 'slide')}`, 'removed')
  }
  if (names.some((name) => name.endsWith('vbaproject.bin'))) add('Macros', 'Yes. They are never run and never carried over', 'removed')
  return details
}

/** An OpenDocument text: who wrote it, and what is in it that its author may think is gone. */
async function openDocument(blob: Blob): Promise<Detail[]> {
  const entries = await readZip(new Uint8Array(await blob.arrayBuffer()))
  const part = (name: string) => {
    const data = entries.find((entry) => entry.name.toLowerCase() === name)?.data
    return data && data.length < 8 * 1024 * 1024 ? decode(data) : ''
  }
  const meta = part('meta.xml')
  const content = part('content.xml')
  const details: Detail[] = []
  const add = (label: string, value: string | undefined, fate?: Detail['fate']) => value && details.push({ label, value, fate })
  add('Title', inTag(meta, 'title'), 'kept')
  add('Author', inTag(meta, 'initial-creator') ?? inTag(meta, 'creator'), 'removed')
  add('Created', inTag(meta, 'creation-date')?.replace('T', ' '), 'removed')
  add('Made with', inTag(meta, 'generator'), 'removed')
  const deleted = (content.match(/<text:deletion\b/g) ?? []).length
  if (deleted) add('Tracked changes', `${count(deleted, 'deletion')}. Deleted text is left out; inserted text is kept as ordinary text`, 'removed')
  if (/<office:annotation\b/.test(content)) add('Comments', 'Yes', 'removed')
  if (/text:display="(?:none|condition)"|<text:hidden-(?:text|paragraph)\b/.test(content)) add('Hidden text', 'Yes', 'removed')
  if (entries.some((entry) => /^basic\//i.test(entry.name)) || /<(?:text|office):script\b/.test(content)) add('Macros', 'Yes. They are never run and never carried over', 'removed')
  return details
}

/** An Office file from before 2007: who wrote it and with what, and what it holds that a conversion leaves behind. */
async function oldOffice(blob: Blob, format: string): Promise<Detail[]> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const file = readCfb(bytes)
  const details: Detail[] = writtenBy(file).map((found) => ({ ...found, fate: 'removed' as const }))
  if (format === 'xls') {
    const sheets = await listSheets(bytes)
    if (sheets.length) details.push({ label: 'Sheets', value: `${sheets.length} shown: ${sheets.slice(0, 12).join(', ')}. The first is converted, unless you choose another. Hidden sheets never are` })
  }
  if (hasMacros(file)) details.push({ label: 'Macros', value: 'Yes. They are never run and never carried over', fate: 'removed' })
  return details
}

/** A book: what it is called, who wrote it, what it holds, and whether it is locked. */
async function book(blob: Blob, epub = false): Promise<Detail[]> {
  let parts
  try {
    const bytes = new Uint8Array(await blob.arrayBuffer())
    parts = epub ? await readEpub(bytes) : readKindle(bytes)
  } catch (error) {
    if (error instanceof Error && /copy-protected/.test(error.message)) return [{ label: 'Copy protection', value: 'Yes (DRM). Omsett does not unlock books, so this one cannot be converted' }]
    throw error
  }
  const details: Detail[] = []
  const add = (label: string, value: string | undefined | null, fate?: Detail['fate']) => value && details.push({ label, value: value.slice(0, 300), fate })
  add('Title', parts.title, 'kept')
  add('Author', parts.authors.join(', '), 'kept')
  add('Publisher', parts.publisher, 'kept')
  add('Language', parts.language, 'kept')
  add('Pages', `${count(parts.chapters.length, 'part')}, with ${count(parts.pictures.length, 'picture')}`, 'kept')
  add('Contents', parts.contents.length ? count(parts.contents.length, 'entry', 'entries') : 'None of its own', parts.contents.length ? 'kept' : undefined)
  add('Copy protection', 'None')
  return details
}

async function pdf(blob: Blob): Promise<Detail[]> {
  const [pdfjs, parser] = await Promise.all([
    import('pdfjs-dist/legacy/build/pdf.mjs'),
    // @ts-expect-error -- the parsing half of the library ships without types of its own
    import('pdfjs-dist/legacy/build/pdf.worker.mjs') as Promise<unknown>,
  ])
  ;(globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = parser
  const task = pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), useSystemFonts: false, disableFontFace: true, enableXfa: false, verbosity: 0 })
  try {
    const document = await task.promise
    const info = ((await document.getMetadata().catch(() => null))?.info ?? {}) as Record<string, unknown>
    // Tagged, if any of its first pages has a tree that says what its words are.
    let tagged = false
    for (let number = 1; number <= Math.min(document.numPages, 3) && !tagged; number++) {
      const tree = (await (await document.getPage(number)).getStructTree().catch(() => null)) as { children?: unknown[] } | null
      tagged = (tree?.children?.length ?? 0) > 0
    }
    const words = (key: string) => (typeof info[key] === 'string' && (info[key] as string).trim() !== '' ? (info[key] as string).trim().slice(0, 300) : undefined)
    // "D:20261123143000Z" is how a PDF writes a date.
    const date = (key: string) => {
      const parts = /^D:(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?/.exec(words(key) ?? '')
      return parts ? `${parts[1]}-${parts[2]}-${parts[3]}${parts[4] ? ` ${parts[4]}:${parts[5] ?? '00'}` : ''}` : words(key)
    }
    const details: Detail[] = []
    const add = (label: string, value: string | undefined, fate?: Detail['fate']) => value && details.push({ label, value, fate })
    add('Title', words('Title'), 'kept')
    add('Author', words('Author'), 'removed')
    add('Subject', words('Subject'), 'removed')
    add('Written in', words('Creator'), 'removed')
    add('Made into a PDF by', words('Producer'), 'removed')
    add('Created', date('CreationDate'), 'removed')
    add('Changed', date('ModDate'), 'removed')
    add('Pages', String(document.numPages))
    add('Language', words('Language'), 'kept')
    add('Tagged', tagged ? 'Yes: it says what its headings, lists and tables are' : 'No: its structure will be estimated from its layout')
    return details
  } finally {
    await task.destroy().catch(() => {})
  }
}

async function font(blob: Blob, format: string): Promise<Detail[]> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const read = format === 'woff' ? await readWoff(bytes) : readSfnt(bytes, format.toUpperCase())
  const table = (tag: string) => read.tables.find((entry) => entry.tag === tag)?.data
  const details: Detail[] = []
  const name = table('name')
  if (name && name.length >= 6) {
    const view = new DataView(name.buffer, name.byteOffset, name.byteLength)
    const records = Math.min(view.getUint16(2), 400)
    const strings = view.getUint16(4)
    const want: Record<number, string> = { 1: 'Family', 2: 'Style', 5: 'Version', 0: 'Copyright', 9: 'Designer', 13: 'Licence' }
    const found = new Map<number, string>()
    for (let i = 0; i < records; i++) {
      const at = 6 + i * 12
      if (at + 12 > name.length) break
      const [platform, id, length, offset] = [view.getUint16(at), view.getUint16(at + 6), view.getUint16(at + 8), view.getUint16(at + 10)]
      const start = strings + offset
      if (!(id in want) || found.has(id) || start + length > name.length || length > 2000) continue
      // Windows and Unicode names are two bytes to a letter; the old Macintosh ones are one.
      const raw = name.subarray(start, start + length)
      const text = platform === 1 ? new TextDecoder('latin1').decode(raw) : new TextDecoder('utf-16be').decode(raw)
      if (text.trim()) found.set(id, text.trim().slice(0, 300))
    }
    for (const [id, label] of Object.entries(want)) if (found.has(Number(id))) details.push({ label, value: found.get(Number(id))!, fate: 'kept' })
  }
  const maxp = table('maxp')
  if (maxp && maxp.length >= 6) details.push({ label: 'Letters and symbols', value: new DataView(maxp.buffer, maxp.byteOffset).getUint16(4).toLocaleString('en'), fate: 'kept' })
  details.push({ label: 'Outlines', value: read.flavor === 0x4F54544F ? 'PostScript (unwraps to OTF)' : 'TrueType (unwraps to TTF)', fate: 'kept' })
  return details
}

async function archive(blob: Blob, format: string): Promise<Detail[]> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let entries
  if (format === 'zip') entries = await readZip(bytes)
  else if (format === 'tar') entries = readTar(bytes, 'TAR')
  else {
    const tar = await gunzipWithin(bytes, 256 * 1024 * 1024)
    if (!(tar instanceof Uint8Array)) return []
    entries = readTar(tar, 'TAR.GZ')
  }
  const files = entries.filter((entry) => !entry.directory)
  const size = files.reduce((sum, entry) => sum + entry.data.length, 0)
  const newest = entries.map((entry) => entry.modified?.getTime() ?? 0).reduce((a, b) => Math.max(a, b), 0)
  return [
    { label: 'Holds', value: `${count(files.length, 'file')} in ${count(entries.length - files.length, 'folder')}`, fate: 'kept' },
    { label: 'Unpacks to', value: `${(size / 1024).toLocaleString('en', { maximumFractionDigits: 0 })} KB`, fate: 'kept' },
    ...(newest ? [{ label: 'Newest file', value: new Date(newest).toISOString().slice(0, 16).replace('T', ' '), fate: 'kept' as const }] : []),
    ...(files.some((entry) => entry.executable) ? [{ label: 'Programs', value: `${count(files.filter((entry) => entry.executable).length, 'file')} marked as programs. None is ever run` }] : []),
  ]
}

/** How long a sound runs, in the words a person would use. */
const lasting = (seconds: number) => {
  if (seconds < 60) return `${seconds.toLocaleString('en', { maximumFractionDigits: seconds < 10 ? 2 : 1 })} seconds`
  const s = Math.round(seconds)
  const hours = Math.floor(s / 3600)
  return `${hours ? `${hours}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}` : Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// A sound's label is at its start, so only the start is read, however long the recording. Words
// a program wrote after the sound are then out of reach, and are simply not listed.
async function sound(blob: Blob, format: string): Promise<Detail[]> {
  const head = new Uint8Array(await blob.slice(0, blob.size <= MAX_WHOLE_BYTES ? blob.size : HEAD_BYTES).arrayBuffer())
  const { sound: found, tags, packing, bits, stored: said } = readSound(format, head, blob.size)
  const stored =
    said ?? (found.coding === 'float'
      ? `${found.bytes * 8}-bit fractions`
      : found.coding === 'ulaw' || found.coding === 'alaw'
        ? `${found.coding === 'ulaw' ? 'µ-law' : 'A-law'}, a telephone code of 8 bits. It is unpacked to 16-bit numbers`
        : `${bits ?? found.bytes * 8}-bit whole numbers${packing ? `, ${packing}` : ''}`)
  const channels = found.channels === 1 ? '1 (mono)' : found.channels === 2 ? '2 (stereo)' : String(found.channels)
  return [
    // A recording sent as it was made may not say how long it is.
    ...(found.frames > 0 ? [{ label: 'Length', value: lasting(found.frames / found.rate), fate: 'kept' as const }] : []),
    { label: 'Rate', value: `${found.rate.toLocaleString('en', { maximumFractionDigits: 3 })} samples a second`, fate: 'kept' },
    { label: 'Channels', value: channels, fate: 'kept' },
    { label: 'Stored as', value: stored, ...(said ? {} : { fate: 'kept' as const }) },
    ...tags.map((tag) => ({ ...tag, fate: 'removed' as const })),
  ]
}

/** What the file holds beside what it shows. Never throws: a file that cannot be read has no details. */
export async function describeFile(blob: Blob, format: Format): Promise<Detail[]> {
  try {
    if (format.category === 'image' && !['svg', 'svgz'].includes(format.id)) return await picture(blob)
    if (format.category === 'audio') return await sound(blob, format.id)
    if (blob.size > MAX_WHOLE_BYTES) return []
    if (['docx', 'xlsx', 'pptx'].includes(format.id)) return await office(blob, format.id)
    if (['xls', 'doc', 'ppt'].includes(format.id)) return await oldOffice(blob, format.id)
    if (format.id === 'odt') return await openDocument(blob)
    if (format.id === 'pdf') return await pdf(blob)
    if (format.id === 'azw3' || format.id === 'mobi') return await book(blob)
    if (format.id === 'epub') return await book(blob, true)
    if (['ttf', 'otf', 'woff'].includes(format.id)) return await font(blob, format.id)
    if (format.category === 'archive') return await archive(blob, format.id)
    if (format.category === 'subtitle') {
      const cues = await readCues(format.id, decode(new Uint8Array(await blob.arrayBuffer())))
      return [
        { label: 'Subtitles', value: cues.length.toLocaleString('en'), fate: 'kept' },
        { label: 'Runs from', value: `${clock(cues[0]!.start)} to ${clock(cues.at(-1)!.end)}`, fate: 'kept' },
      ]
    }
    if (format.id === 'fountain') {
      const script = readFountain(decode(new Uint8Array(await blob.arrayBuffer())))
      const scenes = script.elements.filter((element) => element.kind === 'scene').length
      return [
        ...script.title.slice(0, 8).map((entry) => ({ label: entry.key, value: entry.value.replace(/[*_]/g, '').slice(0, 300), fate: 'kept' as const })),
        { label: 'Scenes', value: String(scenes), fate: 'kept' as const },
      ]
    }
    if (format.id === 'drafter') {
      const entries = await readZip(new Uint8Array(await blob.arrayBuffer()))
      const text = entries.find((entry) => entry.name === 'drafter.json')?.data
      const manifest = (text && text.length < 1024 * 1024 ? JSON.parse(decode(text)) : {}) as Record<string, unknown>
      const words = (key: string) => (typeof manifest[key] === 'string' ? (manifest[key] as string).slice(0, 300) : undefined)
      const many = (key: string) => (Array.isArray(manifest[key]) ? (manifest[key] as unknown[]).length : 0)
      const details: Detail[] = []
      const add = (label: string, value: string | undefined, fate?: Detail['fate']) => value && details.push({ label, value, fate })
      add('Title', words('title'), 'kept')
      add('Author', words('author'), 'kept')
      add('Kind', words('kind'))
      add('Written with', words('generator'), 'removed')
      if (many('drafts')) add('Earlier drafts', `${many('drafts')}. They are the writer's own papers and are left out`, 'removed')
      if (words('cuts')) add('Cut material', 'Yes', 'removed')
      if (words('workbook')) add('Workbook', 'Yes', 'removed')
      if (many('audio')) add('Voice notes', String(many('audio')), 'removed')
      return details
    }
    return []
  } catch {
    return []
  }
}
