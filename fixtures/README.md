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

| File | What it is | What should happen |
| --- | --- | --- |
| `alpha.png` | The pattern at 800 × 500, with transparency | Converts; the disc stays transparent |
| `tiny-1x1.png` | One pixel | Converts; the output may be larger than the input |
| `over-canvas-limit.png` | 5000 × 3400, 17.0 megapixels | Skips the canvas engine (limit 16.78 MP) and converts with libvips |
| `declares-30000x30000.png` | 33 bytes; the header claims 900 megapixels and there are no pixels | Refused from the header: "too large to convert in a browser" |
| `jpeg-named.png` | A JPEG with a `.png` name | Shown as JPEG, with a note that the name disagrees |
| `truncated.png` | The first 20 KB of `png/sample.png` | Identified as PNG, then fails to decode: "couldn't be read" |
| `not-an-image.png` | A line of text | "Unsupported format" |
| `empty.png` | Zero bytes | "Unsupported format" |
| `animated.gif` | Six frames | For Phase 1: animation kept, or the "first frame kept" warning |
| `animated.webp` | The same six frames | As above |

`apng/sample.png` is the animated PNG case as well as that format's sample.

## Not here yet

- **No photograph.** Everything is synthetic, which is the hard case for sharp edges and the easy
  one for natural texture. Lossy encoders should also be judged on a real photo; one needs to be
  added by someone who owns it.
- **No metadata sample.** A JPEG with EXIF, GPS, and an author field is needed to test metadata
  display and stripping.
- **Formats no tool on this machine can write:** camera RAW (DNG, CR2, NEF, and the rest), XCF,
  DICOM, MIFF, MNG, JPEG XR, XPM, DDS, Photo CD, PSB, Live Photo. These need real files from
  real devices and applications.
- **Only images.** Audio, documents, data, archives, fonts, subtitles, and video samples belong
  with the phases that add those formats.
