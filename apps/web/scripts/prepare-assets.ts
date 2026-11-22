// Copies everything the app serves but does not author into public/, before dev and build:
// engine binaries (content-hashed, with a manifest the app imports), fonts, and the sample file.
// Nothing here is committed; node_modules and fixtures/ are the single sources.
import { createHash } from 'node:crypto'
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const web = join(dirname(fileURLToPath(import.meta.url)), '..')
const repo = join(web, '..', '..')
const enginesDir = join(web, 'public', 'engines')
const fontsDir = join(web, 'public', 'fonts')
const generatedDir = join(web, 'app', 'generated')

// Resolve engine binaries from packages/engines, so there is one pinned version.
const fromEngines = createRequire(join(repo, 'packages', 'engines', 'package.json'))
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

const vipsLib = dirname(fromEngines.resolve('wasm-vips/vips.wasm'))
const manifest = {
  vips: {
    script: await hashed(join(vipsLib, 'vips-es6.js'), 'vips-es6', 'js'),
    wasm: await hashed(join(vipsLib, 'vips.wasm'), 'vips', 'wasm'),
  },
  sample: { url: '/sample.png', name: 'sample.png' },
}
await writeFile(join(generatedDir, 'engine-assets.json'), JSON.stringify(manifest, null, 2) + '\n')

await copyFile(join(repo, 'fixtures', 'png', 'sample.png'), join(web, 'public', 'sample.png'))

const fonts: Array<[pkg: string, file: string]> = [
  ['@fontsource/space-grotesk', 'space-grotesk-latin-500-normal.woff2'],
  ['@fontsource/space-grotesk', 'space-grotesk-latin-700-normal.woff2'],
  ['@fontsource/jetbrains-mono', 'jetbrains-mono-latin-400-normal.woff2'],
  ['@fontsource/jetbrains-mono', 'jetbrains-mono-latin-500-normal.woff2'],
]
for (const [pkg, file] of fonts) {
  const source = join(dirname(fromWeb.resolve(`${pkg}/package.json`)), 'files', file)
  await copyFile(source, join(fontsDir, file))
}

console.log(`prepare-assets: ${Object.keys(manifest).length - 1} engine, ${fonts.length} fonts, 1 sample`)
