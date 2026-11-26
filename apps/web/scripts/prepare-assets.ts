// Copies everything the app serves but does not author into public/, before dev and build:
// engine binaries (content-hashed, with a manifest the app imports), fonts, and the sample file.
// Nothing here is committed; node_modules and fixtures/ are the single sources.
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const web = join(dirname(fileURLToPath(import.meta.url)), '..')
const repo = join(web, '..', '..')
const enginesDir = join(web, 'public', 'engines')
const fontsDir = join(web, 'public', 'fonts')
/** The sample files the drop zone offers, from the fixtures: the first is the one a test or a demo loads. */
const SAMPLES = ['png/sample.png', 'pdf/sample.pdf', 'docx/sample.docx']
const generatedDir = join(web, 'app', 'generated')

// Resolve engine binaries from packages/engines, so there is one pinned version.
const fromEngines = createRequire(join(repo, 'packages', 'engines', 'package.json'))
// The top of Pandoc's package, found from its main file, wherever in the package that is.
let pandocRoot = dirname(fromEngines.resolve('pandoc-wasm'))
while (!existsSync(join(pandocRoot, 'package.json'))) pandocRoot = dirname(pandocRoot)
const fromWeb = createRequire(join(web, 'package.json'))

async function hashed(source: string, stem: string, ext: string) {
  const bytes = await readFile(source)
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  const file = `${stem}.${sha256.slice(0, 12)}.${ext}`
  await writeFile(join(enginesDir, file), bytes)
  return { url: `/engines/${file}`, sha256, bytes: bytes.byteLength }
}

await mkdir(enginesDir, { recursive: true })
await mkdir(fontsDir, { recursive: true })
await mkdir(generatedDir, { recursive: true })

for (const name of await readdir(enginesDir)) {
  if (name !== 'README.md') await rm(join(enginesDir, name))
}

// The typefaces a PDF falls back on for other scripts, a piece at a time. The same faces as
// `SCRIPTS` in packages/engines, which a test holds this to. For each: its own list of which
// piece draws which letters, and a list of where each piece is and what its hash is. Neither
// list is in the manifest the app imports, which would grow by a thousand entries; each is a
// file of its own, fetched and checked when a document needs that script.
const SCRIPT_FACES = ['sc', 'tc', 'jp', 'kr', 'arabic', 'hebrew', 'devanagari', 'thai']
const DRAWN_ALREADY = new Set(['latin', 'latin-ext', 'cyrillic', 'cyrillic-ext', 'greek', 'greek-ext', 'vietnamese', 'math', 'symbols'])
async function scriptFace(id: string) {
  const pack = `@fontsource/noto-sans-${id}`
  const listPath = fromEngines.resolve(`${pack}/unicode.json`)
  const list = JSON.parse(await readFile(listPath, 'utf8')) as Record<string, string>
  const pieces: Record<string, { url: string; sha256: string }> = {}
  for (const key of Object.keys(list)) {
    const name = key.replace(/^\[|\]$/g, '')
    if (DRAWN_ALREADY.has(name)) continue
    for (const weight of [400, 700]) {
      const made = await hashed(fromEngines.resolve(`${pack}/files/noto-sans-${id}-${name}-${weight}-normal.woff`), `noto-sans-${id}-${name}-${weight}`, 'woff')
      pieces[`${name}:${weight}`] = { url: made.url, sha256: made.sha256 }
    }
  }
  const piecesPath = join(enginesDir, `noto-sans-${id}.pieces.tmp`)
  await writeFile(piecesPath, JSON.stringify(pieces))
  const made = { ranges: await hashed(listPath, `noto-sans-${id}.ranges`, 'json'), pieces: await hashed(piecesPath, `noto-sans-${id}.pieces`, 'json') }
  await rm(piecesPath)
  return made
}

const vipsLib = dirname(fromEngines.resolve('wasm-vips/vips.wasm'))
// The weights of Inter that resvg draws text in. The same list as `resvgFonts` in packages/engines.
const resvgFonts = ['inter-latin-400-normal.woff2', 'inter-latin-700-normal.woff2']
// The typeface a PDF is set in. The same list as `typstFonts` in packages/engines, which a test holds this to.
const typstFonts = ['latin', 'latin-ext', 'cyrillic', 'cyrillic-ext', 'greek', 'greek-ext', 'vietnamese'].flatMap((script) =>
  ['400-normal', '700-normal', '400-italic', '700-italic'].map((cut) => `@fontsource/inter/files/inter-${script}-${cut}.woff`),
)
const heifLib = dirname(fromEngines.resolve('libheif-js/libheif-wasm/libheif.wasm'))
const manifest = {
  vips: {
    script: await hashed(join(vipsLib, 'vips-es6.js'), 'vips-es6', 'js'),
    wasm: await hashed(join(vipsLib, 'vips.wasm'), 'vips', 'wasm'),
    // Optional libvips modules, keyed by the name libvips asks for them by.
    modules: {
      'vips-heif.wasm': await hashed(join(vipsLib, 'vips-heif.wasm'), 'vips-heif', 'wasm'),
      'vips-jxl.wasm': await hashed(join(vipsLib, 'vips-jxl.wasm'), 'vips-jxl', 'wasm'),
    },
  },
  heif: {
    script: await hashed(join(heifLib, 'libheif.js'), 'libheif', 'js'),
    wasm: await hashed(join(heifLib, 'libheif.wasm'), 'libheif', 'wasm'),
  },
  magick: {
    wasm: await hashed(fromEngines.resolve('@imagemagick/magick-wasm/magick.wasm'), 'magick', 'wasm'),
  },
  // Typst, which lays out PDFs, and the typeface it sets them in.
  typst: {
    wasm: await hashed(fromEngines.resolve('@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler_bg.wasm'), 'typst', 'wasm'),
    fonts: await Promise.all(typstFonts.map((file) => hashed(fromEngines.resolve(file), file.split('/').pop()!.replace('.woff', ''), 'woff'))),
    scripts: Object.fromEntries(await Promise.all(SCRIPT_FACES.map(async (id) => [id, await scriptFace(id)]))) as Record<string, Awaited<ReturnType<typeof scriptFace>>>,
  },
  // The long tail of sound: the binary of Omsett's own build of libav.js.
  libav: {
    wasm: await hashed(join(repo, 'packages', 'engines', 'vendor', 'libav', 'libav-6.11.9.0.2-omsett-audio.wasm.wasm'), 'libav', 'wasm'),
  },
  // Pandoc, which reads and writes RTF. Its package names its binary only through its main file.
  pandoc: {
    wasm: await hashed(join(pandocRoot, 'src', 'pandoc.wasm'), 'pandoc', 'wasm'),
  },
  // LAME, which packs MP3. The decoder, mpg123, is carried inside its own script.
  mp3: {
    wasm: await hashed(fromEngines.resolve('wasm-media-encoders/wasm/mp3'), 'lame', 'wasm'),
  },
  resvg: {
    wasm: await hashed(fromEngines.resolve('@resvg/resvg-wasm/index_bg.wasm'), 'resvg', 'wasm'),
    fonts: await Promise.all(
      resvgFonts.map((file) => hashed(fromEngines.resolve(`@fontsource/inter/files/${file}`), file.replace('.woff2', ''), 'woff2')),
    ),
  },
  sample: { url: '/sample.png', name: 'sample.png' },
  // Files to try the converter with, offered in the drop zone: a picture, a PDF, a document.
  samples: SAMPLES.map((path) => ({ url: `/sample.${path.split('.').pop()}`, name: path.split('/').pop()! })),
}
await writeFile(join(generatedDir, 'engine-assets.json'), JSON.stringify(manifest, null, 2) + '\n')

// An engine's own license and notices travel with its binary.
const vipsRoot = join(vipsLib, '..')
await copyFile(join(vipsRoot, 'LICENSE'), join(enginesDir, 'vips.LICENSE.txt'))
await copyFile(join(vipsRoot, 'THIRD-PARTY-NOTICES.md'), join(enginesDir, 'vips.THIRD-PARTY-NOTICES.md'))
await copyFile(join(heifLib, 'LICENSE'), join(enginesDir, 'libheif.LICENSE.txt'))
await copyFile(
  join(dirname(fromEngines.resolve('@imagemagick/magick-wasm/magick.wasm')), '..', '..', 'NOTICE'),
  join(enginesDir, 'magick.NOTICE.txt'),
)

// libav.js and FFmpeg are LGPL: their licence goes beside the binary.
await copyFile(join(repo, 'packages', 'engines', 'vendor', 'libav', 'LICENSE.md'), join(enginesDir, 'libav.LICENSE.txt'))
// Pandoc is GPL-2.0-or-later: its licence, and where its source is, go beside it.
await copyFile(join(pandocRoot, 'LICENSE'), join(enginesDir, 'pandoc.LICENSE.txt'))

for (const path of SAMPLES) await copyFile(join(repo, 'fixtures', path), join(web, 'public', `sample.${path.split('.').pop()}`))

// The "What's new" page is the changelog itself, parsed here so the two cannot drift.
type Inline = { kind: 'text' | 'strong' | 'code'; text: string }
function inline(markdown: string): Inline[] {
  const parts: Inline[] = []
  for (const piece of markdown.split(/(\*\*[^*]+\*\*|`[^`]+`)/)) {
    if (!piece) continue
    if (piece.startsWith('**')) parts.push({ kind: 'strong', text: piece.slice(2, -2) })
    else if (piece.startsWith('`')) parts.push({ kind: 'code', text: piece.slice(1, -1) })
    else parts.push({ kind: 'text', text: piece })
  }
  return parts
}
interface Group { title: string; items: Inline[][] }
interface Release {
  title: string
  /** The line beginning "Released", if the version has one. */
  released: string
  intro: Inline[][]
  /** The opening of the intro, at most three sentences: the home page's "What's new" banner. */
  teaser: string
  groups: Group[]
}
/**
 * The first `count` sentences of a paragraph. A sentence ends at a full stop, question mark or
 * exclamation mark that is followed by a space or the end, so "omsett.com" does not end one.
 */
function sentences(text: string, count: number): string {
  let found = 0
  for (let i = 0; i < text.length; i++) {
    const ends = '.!?'.includes(text[i]!) && (i + 1 === text.length || /\s/.test(text[i + 1]!))
    if (ends && ++found === count) return text.slice(0, i + 1).trim()
  }
  return text.trim()
}
const releases: Release[] = []
let pending: string[] = []
let target: 'intro' | 'item' | null = null
const flush = () => {
  const release = releases.at(-1)
  if (release && pending.length) {
    const plain = pending.join(' ')
    const text = inline(plain)
    if (target === 'item') release.groups.at(-1)!.items.push(text)
    else if (plain.startsWith('Released ')) release.released = plain
    else {
      release.teaser ||= sentences(plain.replaceAll('**', '').replaceAll('`', ''), 3)
      release.intro.push(text)
    }
  }
  pending = []
  target = null
}
for (const line of (await readFile(join(repo, 'CHANGELOG.md'), 'utf8')).split('\n')) {
  if (line.startsWith('## ')) {
    flush()
    releases.push({ title: line.slice(3).trim(), released: '', intro: [], teaser: '', groups: [] })
  } else if (!releases.length) {
    continue // the file's own title and preamble
  } else if (line.startsWith('### ')) {
    flush()
    releases.at(-1)!.groups.push({ title: line.slice(4).trim(), items: [] })
  } else if (line.startsWith('- ')) {
    flush()
    if (!releases.at(-1)!.groups.length) releases.at(-1)!.groups.push({ title: '', items: [] })
    pending = [line.slice(2).trim()]
    target = 'item'
  } else if (line.trim() === '') {
    flush()
  } else {
    pending.push(line.trim())
    target ??= 'intro'
  }
}
flush()
await writeFile(join(generatedDir, 'changelog.json'), JSON.stringify(releases, null, 2) + '\n')

// Facts the Technical details page states as numbers. Counted here from the repository on every
// build, so the page is right by construction and never needs editing when a file is added.
interface Trap { file: string; group: string; why: string; detect: string; mismatch: boolean; guard: string; node: string; note: string | null; absent: string | null }
const traps = JSON.parse(await readFile(join(repo, 'fixtures', '_traps', 'manifest.json'), 'utf8')) as Trap[]
const trapGroups: Record<string, number> = {}
for (const trap of traps) trapGroups[trap.group] = (trapGroups[trap.group] ?? 0) + 1
const fixtureDirs = (await readdir(join(repo, 'fixtures'), { withFileTypes: true })).filter(
  (entry) => entry.isDirectory() && !entry.name.startsWith('_'),
)
const facts = {
  traps: { total: traps.length, groups: trapGroups },
  // Counted from a real run by scripts/count-tests.ts, and checked on every change.
  tests: JSON.parse(await readFile(join(repo, 'test-count.json'), 'utf8')) as { unit: number; unitFiles: number; browser: number; browsers: string[] },
  sampleFormats: fixtureDirs.length,
  cases: (await readdir(join(repo, 'fixtures', '_cases'))).length,
  version: (JSON.parse(await readFile(join(repo, 'package.json'), 'utf8')) as { version: string }).version,
  built: new Date().toISOString().slice(0, 10),
}
await writeFile(join(generatedDir, 'facts.json'), JSON.stringify(facts, null, 2) + '\n')

// Every trap, for the page that lists them: what each is and what must happen to it, as the
// tests are told. Read from the same manifest the tests read, so the page cannot disagree.
const trapList = traps.map(({ file, group, why, detect, mismatch, guard, node, note, absent }) => ({
  file, group, why, detect, mismatch, guard, outcome: node, note, payload: absent !== null,
}))
await writeFile(join(generatedDir, 'traps.json'), JSON.stringify(trapList) + '\n')

// The Security page is the audit record itself.
await copyFile(join(repo, 'security', 'audits.json'), join(generatedDir, 'audits.json'))

// Inter stands in for Helvetica Neue on devices that do not have it (see main.css).
const fonts: Array<[pkg: string, file: string]> = [
  ['@fontsource/inter', 'inter-latin-400-normal.woff2'],
  ['@fontsource/inter', 'inter-latin-500-normal.woff2'],
  ['@fontsource/inter', 'inter-latin-700-normal.woff2'],
]
for (const stale of await readdir(fontsDir)) await rm(join(fontsDir, stale))
for (const [pkg, file] of fonts) {
  const source = join(dirname(fromWeb.resolve(`${pkg}/package.json`)), 'files', file)
  await copyFile(source, join(fontsDir, file))
}

console.log(`prepare-assets: ${Object.keys(manifest).length - 1} engine, ${fonts.length} fonts, ${SAMPLES.length} samples`)
