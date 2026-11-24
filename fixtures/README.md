# Fixtures

Sample files for testing, by hand and in CI. Every file here is committed; nothing is generated
when tests run.

- **`<format>/sample.*`**: one sample per format. `fixtures.test.ts` runs every sample of a
  registered format through each engine that reads it. Samples of formats the registry does not
  know yet are waiting for the phase that adds them.
- **`_cases/`**: files that exist to provoke one specific behaviour.
- **`_tools/`**: the scripts that made them. `_tools/make-samples.sh` rebuilds everything except
  `png/sample.png` and `jpeg/sample.jpg` (needs macOS, ffmpeg, cwebp, python3, and
  `pnpm install`).

## The test pattern

Most samples are the same picture, drawn by `_tools/pattern.py`. Each region shows one thing a
conversion can get wrong:

| Region | What to look for |
| --- | --- |
| Gradient background | Banding |
| Transparent disc, soft edge | Transparency lost, or a halo where it meets the gradient |
| Checkerboard | Ringing around hard edges |
| One-pixel lines | Fine detail smeared or dropped |
| Flat blue block | Colour shift: it is exactly `#3b6cff` |

`png/sample.png` is different: it is the project's OpenGraph image, the file the app's "Try a
sample" button loads and the browser tests convert.

## One sample per format

320 × 200 unless noted. "Alpha" means the sample keeps the transparent disc; the others are
flattened onto white because the format, or the tool that wrote it, has no transparency.

| Directory | Format | Alpha | Written by | Recognized by `file-type` |
| --- | --- | --- | --- | --- |
| `png` | PNG (1200 × 630) | no | (the og:image) | yes |
| `jpeg` | JPEG (320 × 168) | no | sips | yes |
| `webp` | WebP, lossy | yes | cwebp | yes |
| `avif` | AVIF | yes | sips | yes |
| `heic` | HEIC | yes | sips | yes |
| `jxl` | JPEG XL | yes | libvips | yes |
| `gif` | GIF | no | ffmpeg | yes |
| `apng` | Animated PNG, 6 frames | no | ffmpeg | yes |
| `tiff` | TIFF, LZW | yes | sips | yes |
| `bmp` | BMP | no | sips | yes |
| `jp2` | JPEG 2000 | no | sips | yes |
| `psd` | Photoshop | yes | sips | yes |
| `ico` | Windows icon (256 × 256) | no | sips | yes |
| `icns` | Mac icon (256 × 256) | no | sips | yes |
| `cur` | Windows cursor (64 × 64) | yes | ImageMagick | yes |
| `psb` | Photoshop, large document | yes | ImageMagick | as PSD |
| `dds` | DirectDraw surface | yes | ImageMagick | **no** |
| `fits` | FITS (three grey planes) | no | ImageMagick | **no** |
| `dcm` | DICOM (colour, a made-up patient) | no | `dicom.py` | **no** |
| `dng` | DNG (colour as three values a pixel, no camera) | no | `dng.py` | **no** |
| `tga` | Targa | yes | ffmpeg | **no** |
| `qoi` | QOI | yes | ffmpeg | **no** |
| `sgi` | SGI | yes | ffmpeg | **no** |
| `pcx` | PCX | no | ffmpeg | **no** |
| `ras` | Sun Raster | no | ffmpeg | **no** |
| `exr` | OpenEXR (160 × 100) | yes | ffmpeg | **no** |
| `hdr` | Radiance HDR | no | ffmpeg | **no** |
| `ppm` | Netpbm colour | no | ffmpeg | **no** |
| `pgm` | Netpbm grey | no | ffmpeg | **no** |
| `pbm` | Netpbm bitmap | no | ffmpeg | **no** |
| `pam` | Netpbm with alpha | yes | ffmpeg | **no** |
| `pfm` | Netpbm float (160 × 100) | no | ffmpeg | **no** |
| `xbm` | X bitmap | no | ffmpeg | **no** |
| `wbmp` | Wireless bitmap | no | ffmpeg | **no** |

The last column matters for Phase 1: `packages/detect` relies on `file-type`, which does not
know thirteen of these. Each will need its own magic-byte check before it can be registered.

## Cases

Sound files that exercise one specific path.

| File | What it is | What should happen |
| --- | --- | --- |
| `alpha.png` | The pattern at 800 × 500, with transparency | Converts; the disc stays transparent |
| `tiny-1x1.png` | One pixel | Converts; the output may be larger than the input |
| `over-canvas-limit.png` | 5000 × 3400, 17.0 megapixels | Skips the canvas engine (limit 16.78 MP) and converts with libvips |
| `animated.gif` | Six frames | For Phase 1: animation kept, or the "first frame kept" warning |
| `animated.webp` | The same six frames | As above |

`apng/sample.png` is the animated PNG case as well as that format's sample.

## Traps

`_traps/` holds 664 files (listed on the site's Trap files page) that are broken, hostile, or lying, each in one deliberate way.
`_traps/manifest.json` says what each is and what must happen to it, and both test suites read
it: `traps.test.ts` runs every trap through identification, the size guard, and libvips in Node;
`e2e/traps.spec.ts` drops every trap into the app in Chromium, Firefox, and WebKit.

To add a trap, add it to `_tools/make-traps.py` and run the script. Nothing else needs editing.

The second batch (23 files) is adversarial: each reproduces the shape of a known attack on image
readers, such as a lookup outside a table, a length that overflows, or a payload hidden in
metadata. None of them contains anything harmful; they are test inputs for our own reader.

For every trap, whatever it is:

- identification does not throw, and goes by contents, not by name;
- the size guard decides from the header, before anything is decoded;
- an engine either converts the file properly or refuses it with an ordinary error. No hang, no
  crash, no output that is not what it claims to be;
- where the manifest names a payload (`absent`), no trace of it is in the output;
- the engine still works afterwards, and in the browser the page survives, asks no other site
  for anything, opens no dialog, the file ends in a state the user can read, and a good file
  still converts.

| Group | Files | What they prove |
| --- | --- | --- |
| Not what they say | `empty`, `text`, `random-bytes`, `utf16-text`, `svg-with-script`, `entity-expansion.svg`, `svg-fetches-elsewhere.svg`, `gif-header-then-script`, `jpeg-named`, `webp-named`, `gif-named`, `png-named.jpg`, `png-then-zip`, `script-in-metadata` | A name is never believed. Markup is never parsed and a script never run, including an XML entity bomb and markup that references another site. A file that is two formats at once is treated as the one it opens as. A payload in a picture's metadata does not reach the output |
| Lying about size | `declares-30000x30000`, `declares-max-size`, `declares-zero-size`, `rowbytes-overflow`, `sign-bit-size`, `bomb-20000x20000`, `too-wide-for-webp`, `tall-1x100000`, `large-8000x8000` | A real decompression bomb is refused from its header. Sizes that overflow 32-bit arithmetic are refused. A picture too wide or tall for the target is refused with the reason. A genuinely large picture (64 megapixels) converts without exhausting memory |
| Damaged | `signature-only`, `truncated`, `no-image-data`, `short-image-data`, `too-much-image-data`, `corrupt-image-data`, `bad-checksum`, `inner-checksum-wrong`, `bad-bit-depth`, `bad-colour-type`, `bad-filter-type`, `chunk-length-overflow`, `header-not-first`, `unknown-critical-chunk`, `interlace-flag-lies`, `palette-index-out-of-range`, `palette-wrong-length`, `transparency-longer-than-palette`, `zero-gamma`, `claims-a-million-frames`, `metadata-bomb`, `colour-profile-bomb`, `image-data-in-single-bytes`, `five-thousand-comments`, `no-end-marker`, `trailing-garbage` | Damage is an error, not half a picture. An index outside its table, more data than was allocated for, and a zero that would be divided by are all survived. Harmless oddities still convert |
| Sound but unusual | `sixteen-bit`, `palette-with-transparency`, `one-bit-grey`, `interlaced` | Valid files a careless reader gets wrong |

### What the traps found

Writing them turned up four real faults, all fixed:

- **libvips returned half a picture.** By default it forgives damage and hands back whatever it
  read. Five damaged files converted "successfully". It now loads with `fail_on: 'error'`.
- **libvips threw something that was not an error.** Several failures surfaced as a raw
  WebAssembly exception, which cannot cross a worker boundary. Every failure is now an `Error`.
- **Chrome shrank an oversized picture and reported success.** Asked for a WebP 20000 pixels
  wide, its encoder returned one 16383 wide. Formats now declare `maxDimension`, and the app
  refuses first: "Too large for WebP, which holds 16383 pixels a side at most".
- **The PNG size reader trusted its offsets.** It read bytes 16–23 as a size without checking
  that the first chunk was a header.

### Closed: browsers that forgave damage

Until version 0.3.0, some damaged files converted in some browsers, because the browser's own
PNG decoder returned the part it could read. Firefox did it everywhere, WebKit on Linux, and the
manifest marked those traps as browser-dependent.

That allowance is gone. A PNG's structure is now verified in the worker before a browser may
decode it (`packages/detect/src/png-structure.ts`), and no other format is decoded by a browser
at all. Every trap has one required outcome, in Node and in all three browsers, and the manifest
has no `either`.

When a format is added, the same question has to be answered for it: either the app can verify
the format's structure itself, or only libvips reads it.

## Not here yet

- **No photograph.** Everything is synthetic, which is the hard case for sharp edges and the easy
  one for natural texture. Lossy encoders should also be judged on a real photo; one needs to be
  added by someone who owns it.
- **No metadata sample.** A JPEG with EXIF, GPS, and an author field is needed to test metadata
  display and stripping.
- **Formats no tool on this machine can write:** camera RAW (DNG, CR2, NEF, and the rest), XCF,
  DICOM, MIFF, MNG, JPEG XR, XPM, DDS, Photo CD, PSB, Live Photo. These need real files from
  real devices and applications.
- **Only images, and only five of them convert so far.** PNG, JPEG, WebP, GIF, and TIFF. The other samples wait for their formats.
- **Sound is five formats so far.** WAV, AIFF and AU, written by `_tools/sound.py`; FLAC,
  packed from those by the reference `flac` program and by ffmpeg; and MP3, packed by ffmpeg.
  Samples of video belong with the phase that adds it.
