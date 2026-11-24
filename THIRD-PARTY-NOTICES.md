# Third-party notices

Omsett's own code is MIT (see [`LICENSE`](LICENSE)). It ships, and was shaped by, other people's
work. This file lists every engine and library that reaches a user's browser, with its license,
the version shipped, and where its source lives. Tooling used only to build and test (Vite,
Vitest, Playwright, ESLint, TypeScript, and so on) is not shipped and is not listed.

Every engine also declares its license and source in code (`packages/engines/src/info.ts`), and
a test fails if one does not.

## Engines

Engines are separate, unmodified upstream artifacts, fetched only when a conversion needs them.
They are not compiled into Omsett's code.

### wasm-vips 0.0.19

- **What it is:** libvips compiled to WebAssembly. Shipped as `vips.wasm` and its loader
  script, unmodified, under `/engines/`.
- **License:** MIT for wasm-vips itself; the libraries inside it keep their own licenses, listed
  below as wasm-vips states them. The libvips, glib, and libexif code is used under LGPL-3.0
  through the "any later version" clause of LGPL-2.1.
- **Source:** <https://github.com/kleisauke/wasm-vips> (tag `v0.0.19`). Its build scripts there
  reproduce the binary from the library versions below.
- **Shipped with it:** wasm-vips's own `LICENSE` and `THIRD-PARTY-NOTICES.md` are served next to
  the binary, at `/engines/vips.LICENSE.txt` and `/engines/vips.THIRD-PARTY-NOTICES.md`.

| Library | Version | License (as stated by wasm-vips) |
| --- | --- | --- |
| libvips | 8.18.7 | LGPL-3.0-or-later |
| glib | 2.90.0 | LGPL-3.0-or-later |
| libexif | 0.6.26 | LGPL-3.0-or-later |
| libwebp | 1.6.0 | BSD 3-Clause |
| libpng | 1.6.58 | libpng License |
| mozjpeg | 0826579 | zlib, IJG, BSD 3-Clause |
| libtiff | 4.7.2 | libtiff License |
| lcms | 2.19 | MIT |
| libimagequant | 2.4.1 | BSD 2-Clause |
| cgif | 0.5.4 | MIT |
| libultrahdr | 2.0.2 | MIT |
| highway | 1.4.0 | BSD 3-Clause |
| expat | 2.8.5 | MIT |
| libffi | 3.8.0 | MIT |
| brotli | 1.2.0 | MIT |
| zlib-ng | 2.3.3 | zlib |
| Emscripten runtime | 6.0.10 | MIT |

wasm-vips also publishes optional modules. Omsett ships two, each fetched only when a conversion
needs it, and registered as an engine of its own:

| Engine | Module | Adds | Libraries, with licenses as stated by wasm-vips |
| --- | --- | --- | --- |
| `vips-heif` | `vips-heif.wasm` | AVIF, read and written | libheif (LGPL-3.0), aom (BSD-2-Clause, with the Alliance for Open Media Patent License 1.0) |
| `vips-jxl` | `vips-jxl.wasm` | JPEG XL, read and written | libjxl (BSD-3-Clause), highway (BSD-3-Clause), lcms (MIT) |

The third, resvg, is not shipped in this release. The HEIF module holds no HEVC decoder or
encoder, so it does not read or write HEIC.

### libheif-js 1.23.5

- **What it is:** libheif with the libde265 HEVC decoder, compiled to WebAssembly. It reads HEIC.
  Shipped as `libheif.wasm` and its loader script, fetched only when a HEIC file is converted.
- **License:** LGPL-3.0 (libheif and libde265 both). Served next to the binary at
  `/engines/libheif.LICENSE.txt`.
- **Source:** <https://github.com/catdad-experiments/libheif-js>, which builds
  <https://github.com/strukturag/libheif> and <https://github.com/strukturag/libde265>.
- **Patents:** HEVC is covered by patents. Omsett ships a decoder only, and it can be switched
  off in `packages/registry/src/switches.ts`.

### resvg-js 2.6.2

- **What it is:** resvg, an SVG renderer, compiled to WebAssembly. It draws SVG files. Shipped as
  `resvg.wasm`, fetched only when an SVG is converted, with two weights of Inter for its text.
- **License:** MPL-2.0 for the resvg-js build; resvg itself is Apache-2.0 OR MIT. Inter is
  OFL-1.1.
- **Source:** <https://github.com/thx/resvg-js>, which builds <https://github.com/linebender/resvg>.

### magick-wasm 0.0.46

- **What it is:** ImageMagick 7 compiled to WebAssembly. It reads and writes the formats nothing
  else here does. Shipped as `magick.wasm` (15.5 MB), fetched only when one of those is converted.
- **License:** Apache-2.0 for magick-wasm; ImageMagick is under the ImageMagick License, and the
  libraries built into it keep their own. Its `NOTICE` file is served at
  `/engines/magick.NOTICE.txt`.
- **Source:** <https://github.com/dlemstra/magick-wasm>, which builds
  <https://github.com/ImageMagick/ImageMagick>.

### data

Omsett's own readers and writers for JSON, JSON Lines, CSV, TSV, vCard, iCalendar and XLSX,
and its XML writer, with
three small libraries for the formats too intricate to parse well by hand. They are part of the
app's scripts; nothing separate is downloaded.

| Library | Version | License | Source |
| --- | --- | --- | --- |
| yaml (reads and writes YAML) | 2.9.1 | ISC | <https://github.com/eemeli/yaml> |
| smol-toml (reads and writes TOML) | 1.9.1 | BSD-3-Clause | <https://github.com/squirrelchat/smol-toml> |
| fast-xml-parser (reads XML) | 5.12.1 | MIT | <https://github.com/NaturalIntelligence/fast-xml-parser> |

### subtitle

Omsett's own readers and writers for SRT, WebVTT, ASS, SSA, LRC, SBV, SAMI and MicroDVD, and its
TTML writer. TTML is read with fast-xml-parser (MIT), listed under `data` above. Nothing
separate is downloaded.

### markup

Markdown and HTML are read and written with the unified family of parsers, all MIT. Word
documents (DOCX) are read and written, and presentations (PPTX) read, by Omsett's own code,
through the same cleaner. They are
part of the app's scripts; nothing separate is downloaded.

| Library | Version | License | Source |
| --- | --- | --- | --- |
| unified | 11.0.5 | MIT | <https://github.com/unifiedjs/unified> |
| remark-parse, remark-stringify (read and write Markdown) | 11.0.0 | MIT | <https://github.com/remarkjs/remark> |
| remark-gfm (tables, task lists, footnotes) | 4.0.1 | MIT | <https://github.com/remarkjs/remark-gfm> |
| remark-rehype (Markdown to HTML) | 11.1.2 | MIT | <https://github.com/remarkjs/remark-rehype> |
| rehype-remark (HTML to Markdown) | 10.0.1 | MIT | <https://github.com/rehypejs/rehype-remark> |
| rehype-parse, rehype-stringify (read and write HTML) | 9.0.1, 10.0.1 | MIT | <https://github.com/rehypejs/rehype> |
| rehype-raw (HTML inside Markdown) | 7.0.0 | MIT | <https://github.com/rehypejs/rehype-raw> |
| rehype-sanitize (removes what could run) | 6.0.0 | MIT | <https://github.com/rehypejs/rehype-sanitize> |

### pdf

PDFs are read with pdf.js, the reader built into Firefox.

| Library | Version | License | Source |
| --- | --- | --- | --- |
| pdfjs-dist (pdf.js) | 6.5.438 | Apache-2.0 | <https://github.com/mozilla/pdf.js> |

### script

Omsett's own readers and writers for Fountain, Final Draft (FDX) and the Drafter package. FDX
is read with fast-xml-parser (MIT), listed under `data`. The Drafter package format is
specified by the Drafter project and dedicated to the public domain (CC0 1.0).

### archive

Omsett's own reader and writer for ZIP, TAR and TAR.GZ, using the compression built into every
browser. Nothing is downloaded.

### data (old workbooks)

XLS, the Excel workbook from before 2007, is read by Omsett's own code, written from
Microsoft's published descriptions of the container ([MS-CFB]) and of the workbook ([MS-XLS]).
No library is used. The sample workbooks in `fixtures/xls` are written by
`fixtures/_tools/xls.py`.

### markup (old Word documents)

DOC, the Word document from before 2007, is read by Omsett's own code, written from
Microsoft's published description of the format ([MS-DOC]). No library is used. Of the two
samples in `fixtures/doc`, one is written by `fixtures/_tools/doc.py` and one by macOS's
`textutil`.

### ebook

Kindle books (AZW3 and MOBI) are read, and EPUB is written, by Omsett's own code. No library
is used. The sample books in `fixtures/azw3` and `fixtures/mobi` are a few pages written for the
tests by `fixtures/_tools/kindle.py`; nobody's book is in the repository.

### icon

Omsett's own reader for Mac icons (ICNS), using the compression built into every browser.
Nothing is downloaded.

### font

Omsett's own reader and writer for TTF, OTF and WOFF, using the compression built into every
browser. Nothing is downloaded.

The sample fonts in `fixtures/` are a typeface drawn for the tests by
`fixtures/_tools/make-fonts.py`; no one else's font is in the repository.

### audio

Omsett's own reader and writer for WAV, AIFF, AU and FLAC. Nothing is downloaded. The two
telephone codes, µ-law and A-law, are unpacked by the tables of the G.711 standard. FLAC is
read and written from its published format (RFC 9639); no code of the reference library is used.

The sample sounds in `fixtures/` are two notes written by `fixtures/_tools/sound.py`; no one
else's recording is in the repository. The FLAC samples are those notes, packed by the
reference `flac` program and by ffmpeg.

### audio-mp3

MP3 is unpacked by **mpg123** (LGPL-2.1), built to WebAssembly by
[`mpg123-decoder`](https://github.com/eshaz/wasm-audio-decoders) (MIT), and packed by **LAME**
(LGPL-2.0-or-later), built to WebAssembly by
[`wasm-media-encoders`](https://github.com/arseneyr/wasm-media-encoders) (MIT). Neither is
changed. Their sources are at <https://www.mpg123.de> and <https://lame.sourceforge.io>, and
the build scripts are in the two repositories named. Both are fetched only when an MP3 is read
or written. The walk that checks an MP3 before it is unpacked, the reading of its tags, and
the list of contents written at the front of each MP3 are Omsett's own code.

The sample MP3s in `fixtures/` are Omsett's two test notes, packed by ffmpeg.

### typst

PDFs are laid out and written by **Typst** (Apache-2.0), <https://github.com/typst/typst>,
built to WebAssembly by [typst.ts](https://github.com/Myriad-Dreamin/typst.ts) (Apache-2.0),
from the packages `@myriaddreamin/typst.ts` and `@myriaddreamin/typst-ts-web-compiler`. It is
not changed. It is fetched only when a PDF is asked for, and is given no way to read a file or
reach a network: only the program Omsett writes for it, the pictures that program names, and
the typeface. The PDFs are set in Inter (SIL Open Font License 1.1, via `@fontsource/inter`),
whose files are embedded in each PDF in part, as the licence allows. For other scripts the
PDFs are set in Noto Sans SC, TC, JP and KR, Noto Sans Arabic, Noto Sans Hebrew, Noto Sans
Devanagari and Noto Sans Thai (all SIL Open Font License 1.1, via the `@fontsource/noto-sans-*`
packages), fetched a piece at a time and embedded in part in the same way.

### font-woff2

WOFF2 is read and written by Google's woff2 library and Brotli, built to WebAssembly.

| Library | Version | License | Source |
| --- | --- | --- | --- |
| woff2-encoder | 2.0.0 | MIT | <https://github.com/itskyedo/woff2-encoder> |
| woff2 (inside it) | — | MIT | <https://github.com/google/woff2> |
| Brotli (inside it) | — | MIT | <https://github.com/google/brotli> |

### canvas

The browser's own `OffscreenCanvas` encoder. Nothing is downloaded; the wrapper around it is
Omsett's own MIT code (`packages/engines/src/canvas`).

## Libraries in the app bundle

| Library | Version | License | Source |
| --- | --- | --- | --- |
| Nuxt | 4.6.4 | MIT | <https://github.com/nuxt/nuxt> |
| Vue | 3.5.46 | MIT | <https://github.com/vuejs/core> |
| Vue Router | 5.5.1 | MIT | <https://github.com/vuejs/router> |
| Nuxt UI | 4.13.0 | MIT | <https://github.com/nuxt/ui> |
| Reka UI | 2.11.0 | MIT | <https://github.com/unovue/reka-ui> |
| Tailwind CSS | 4.3.5 | MIT | <https://github.com/tailwindlabs/tailwindcss> |
| Comlink | 4.4.2 | Apache-2.0 | <https://github.com/GoogleChromeLabs/comlink> |
| file-type | 22.3.0 | MIT | <https://github.com/sindresorhus/file-type> |
| Lucide icons (via `@iconify-json/lucide`) | 1.2.158 | ISC | <https://github.com/lucide-icons/lucide> |
| Mermaid (Technical details page only) | 12.x | MIT | <https://github.com/mermaid-js/mermaid> |

The bundle also contains the smaller packages these depend on, under MIT, ISC, or BSD licenses.

## Fonts

| Font | Version | License | Source |
| --- | --- | --- | --- |
| Inter (via `@fontsource/inter`) | 5.x | SIL Open Font License 1.1 | <https://github.com/rsms/inter> |

Inter is served only to devices that do not have Helvetica Neue, which is used where present
and is not distributed with Omsett.

## Design credit

- **Filee** (MIT, <https://github.com/KnifeLemon/Filee>): the route planner's shape (shortest
  path over converter edges, capped at three hops, with engine priority breaking ties) and the
  idea that a target knows whether it can run on the selected files, and says why when it
  cannot, come from Filee's `RoutePlanner` and `PresetAvailability`. No Filee code is included;
  Omsett's implementation is its own, in TypeScript.
- **VERT** (AGPL-3.0, <https://github.com/VERT-sh/VERT>) showed which engines work in a browser.
  Nothing from VERT's source is copied or transcribed here: not code, not data, not schemas.
