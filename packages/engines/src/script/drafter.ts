import { readZip, writeZip } from '../archive/zip'
import { safeName, type Entry } from '../archive/entries'
import { Refusal, safeBaseName } from '../util'

// The Drafter package (.drafter): one file that holds a whole writing project. It is a ZIP
// whose first entry says what it is, with a manifest (drafter.json) that names the work's own
// file, which for a script is plain Fountain. Specified at
// https://github.com/cschweda/drafter (docs/spec/drafter-package.md), and in the public domain.
//
// Converting a package takes the work out of it: the main file, as it stands. The drafts, the
// cut material, the workbook and the voice notes beside it are the writer's own papers. They
// are not what the script says, and are left where they are.

export const MEDIA_TYPE = 'application/vnd.drafter.package+zip'
const MAX_MANIFEST_BYTES = 1024 * 1024
export const notPackage = () => new Refusal('This file is not a valid Drafter package')

export async function readDrafter(bytes: Uint8Array): Promise<string> {
  let entries: Entry[]
  try {
    entries = await readZip(bytes)
  } catch (error) {
    if (error instanceof Refusal && /more than Omsett will handle|password/.test(error.message)) throw error
    throw notPackage()
  }
  const files = new Map(entries.filter((entry) => !entry.directory).map((entry) => [entry.name, entry.data]))
  const text = (data: Uint8Array) => new TextDecoder('utf-8', { fatal: true }).decode(data)
  // The first entry names the format, as an EPUB's does.
  if (entries[0]?.name !== 'mimetype' || new TextDecoder().decode(entries[0].data) !== MEDIA_TYPE) throw notPackage()
  const manifestBytes = files.get('drafter.json')
  if (!manifestBytes || manifestBytes.length > MAX_MANIFEST_BYTES) throw notPackage()
  let manifest: Record<string, unknown>
  try {
    const parsed: unknown = JSON.parse(text(manifestBytes))
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw notPackage()
    manifest = parsed as Record<string, unknown>
  } catch {
    throw notPackage()
  }
  if (manifest.format !== 'drafter-package' || typeof manifest.main !== 'string') throw notPackage()
  // The manifest's path is held to the same rules as every name in an archive, and must be
  // exactly the name of a file that is there.
  let main: string | null
  try {
    main = safeName(manifest.main, 'Drafter')
  } catch {
    throw notPackage()
  }
  const work = main === manifest.main ? files.get(main) : undefined
  if (!work) throw notPackage()
  if (!/\.fountain$/i.test(main!)) {
    throw new Refusal('This Drafter package holds prose, not a script. Its text is the Markdown file inside it')
  }
  try {
    return text(work)
  } catch {
    throw notPackage()
  }
}

async function sha256(data: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', data as BufferSource))
  return `sha256:${[...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

/**
 * @param fountain the script
 * @param name     the name of the file it came from, for the name of the work inside
 * @param title    the script's title and author, where its title page gives them
 * @param title.title  the title
 * @param title.author who wrote it
 * @param now      the moment of writing, which the manifest records
 */
export async function writeDrafter(fountain: string, name: string, title: { title?: string; author?: string }, now = new Date()): Promise<Uint8Array> {
  const encoder = new TextEncoder()
  const main = `${safeBaseName(name)}.fountain`
  const work = encoder.encode(fountain)
  const stamp = now.toISOString().replace(/\.\d+Z$/, 'Z')
  const manifest = {
    format: 'drafter-package',
    version: '0.1',
    generator: 'Omsett',
    created: stamp,
    modified: stamp,
    ...(title.title && { title: title.title }),
    ...(title.author && { author: title.author }),
    kind: 'screenplay',
    main,
    files: { [main]: await sha256(work) },
  }
  const file = (path: string, data: Uint8Array): Entry => ({ name: path, data, directory: false, modified: now, executable: false })
  // The media type comes first and is stored as it is, so the package can be known from its first bytes.
  return writeZip([file('mimetype', encoder.encode(MEDIA_TYPE)), file('drafter.json', encoder.encode(`${JSON.stringify(manifest, null, 2)}\n`)), file(main, work)])
}
