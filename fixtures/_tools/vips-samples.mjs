// The two samples the command-line tools on a Mac cannot write: JPEG XL and animated WebP.
// Uses the same libvips build the app ships.   node vips-samples.mjs PATTERN.png ANIMATED.gif OUTDIR
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const [pattern, animatedGif, outDir] = process.argv.slice(2)
const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(join(here, '..', '..', 'packages', 'engines', 'package.json'))
const Vips = require('wasm-vips')
const vips = await Vips({ dynamicLibraries: ['vips-jxl.wasm'] })

async function save(file, bytes) {
  await mkdir(dirname(join(outDir, file)), { recursive: true })
  await writeFile(join(outDir, file), bytes)
}

const still = vips.Image.newFromBuffer(await readFile(pattern))
await save('jxl/sample.jxl', still.writeToBuffer('.jxl', { Q: 85 }))
still.delete()

// n=-1 loads every frame, so the WebP comes out animated too.
const frames = vips.Image.newFromBuffer(await readFile(animatedGif), 'n=-1')
await save('_cases/animated.webp', frames.writeToBuffer('.webp', { Q: 80 }))
frames.delete()

vips.shutdown?.()
process.exit(0)
