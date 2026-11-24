// The samples no command-line tool on a Mac writes: a cursor, a DirectDraw surface, a FITS
// picture and a large-document Photoshop file. Uses the same ImageMagick build the app ships.
//     node magick-samples.mjs PATTERN.png OPAQUE.png SMALL.png OUTDIR
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const [pattern, opaque, small, outDir] = process.argv.slice(2)
const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(join(here, '..', '..', 'packages', 'engines', 'package.json'))
const { initializeImageMagick, ImageMagick } = require('@imagemagick/magick-wasm')
await initializeImageMagick(await readFile(require.resolve('@imagemagick/magick-wasm/magick.wasm')))

async function save(source, coder, file, mend = (bytes) => bytes) {
  const made = ImageMagick.read(new Uint8Array(await readFile(source)), 'PNG', (image) => {
    image.strip()
    return image.write(coder, (data) => data.slice())
  })
  await mkdir(dirname(join(outDir, file)), { recursive: true })
  await writeFile(join(outDir, file), mend(made))
}

// ImageMagick writes a cursor with an icon's type. A cursor says 2, and where an icon gives
// planes and depth it gives the point that does the clicking: here 4 across, 4 down.
await save(small, 'CUR', 'cur/sample.cur', (bytes) => {
  bytes.set([2, 0], 2)
  bytes.set([4, 0, 4, 0], 10)
  return bytes
})
await save(pattern, 'DDS', 'dds/sample.dds')
await save(opaque, 'FITS', 'fits/sample.fits')
await save(pattern, 'PSB', 'psb/sample.psb')
process.exit(0)
