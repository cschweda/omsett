# Format roadmap

Every format Omsett means to handle, where it will run, and where it stands. The list is
[Filee](https://github.com/KnifeLemon/Filee)'s format table, which is the most complete public
inventory of what a converter can reasonably do, sorted by what a browser can and cannot do.

Nothing here is forgotten; some of it is declined, and says why.

## How to read it

| Home | Meaning |
| --- | --- |
| **Browser** | Runs on omsett.com, on the visitor's device. The default: anything that can, does |
| **Desktop** | Needs a native engine (FFmpeg, LibreOffice, Calibre, Ghostscript). Waits for the desktop app, Phase 3 |
| **Declined** | Not planned, with the reason. Reopened if someone has a real use for it |

| Status | Meaning |
| --- | --- |
| **Done** | Converts today, with a sample file and tests in three browsers |
| **Next** | In the step being worked on |
| **Planned** | Has a home and an engine in mind; not started |

A format is not "done" until it has a sample in `fixtures/`, trap files for the ways it can be
damaged, and an answer to the question in `AGENTS.md`: what reads it strictly enough that a
damaged file is refused? That is slower than adding a line to a table, and it is the reason
Omsett can say what it says about itself.

When a format ships, update its row here, in the same change.

## Images

| Format | Read | Write | Home | Engine | Status |
| --- | --- | --- | --- | --- | --- |
| PNG, JPEG, WebP, GIF, TIFF | yes | yes | Browser | libvips; canvas for PNG | Done |
| AVIF | yes | yes | Browser | libvips + heif module | Done |
| JPEG XL | yes | yes | Browser | libvips + jxl module | Done |
| HEIC / HEIF | yes | no | Browser | libheif + libde265 (WASM), the `heif` engine | Done (read). Decoded to PNG, then on to any other format. Can be switched off in one line: `packages/registry/src/switches.ts`. Not written: no HEVC encoder is shipped (x265 is GPL, and encoding carries more patent exposure than decoding) |
| SVG (to a raster image) | yes | no | Browser | resvg (WASM), the `resvg` engine | Done. Drawn to PNG, then on to any other format. Text is drawn in Inter (Latin only); linked pictures are left out; no script runs. libvips's own SVG module was tried first and dropped: it has no fonts, so all text vanished |
| SVGZ | yes | no | Browser | gunzip with a limit, then resvg | Done |
| BMP, QOI, TGA, Netpbm (PPM, PGM, PBM, PAM) | yes | yes | Browser | ImageMagick (WASM), the `magick` engine | Done |
| ICO | yes | yes | Browser | ImageMagick (WASM) | Done. Reads the largest size in the file; writes 16, 32, 48 and 256, square, never larger than the source |
| PCX, SGI, Sun Raster | yes | no | Browser | ImageMagick (WASM) | Done (read). No demand for writing them |
| CUR | yes | yes | Browser | ImageMagick (WASM) | Done. Reads the largest picture in the file; writes 32, 48 and 64, clicking with the top left corner (0.37.0) |
| DDS | yes | yes | Browser | ImageMagick (WASM) | Done. Reads the largest picture in the file; writes it unpacked, with no smaller copies (0.38.0) |
| ICNS | yes | yes | Browser | Omsett's own reader; ImageMagick (WASM) to write | Done. Reads the largest picture, PNG or the old packing; writes each named size up to 1,024 as PNG (0.37.0). JPEG 2000 inside an icon is not read yet |
| JPEG 2000 | yes | yes | Browser | ImageMagick (WASM) | Done. Written without loss (0.38.0) |
| APNG (first picture) | yes | no | Browser | libvips (WASM) | Done |
| APNG with its animation, MNG | yes | yes | Browser | ImageMagick (WASM) | Planned |
| OpenEXR, Radiance HDR | yes | no | Browser | ImageMagick (WASM) | Done (read). Brightness beyond what a screen shows is cut off, and the picker says so |
| FITS | yes | no | Browser | ImageMagick (WASM) | **Done** (0.34.0): the first picture in the file |
| PSD | yes | no | Browser | ImageMagick (WASM) | Done (read, flattened). Layers are not kept |
| PSB | yes | no | Browser | ImageMagick (WASM) | **Done** (0.34.0): the finished picture, layers merged |
| DNG | yes | no | Browser | ImageMagick (WASM), which carries LibRaw | **Reading done** (0.40.0): developed with standard settings and turned the right way up |
| Camera makers' RAW (CR2, CR3, NEF, ARW, RAF, ORF, RW2, …) | yes | no | Browser | ImageMagick (WASM), which carries LibRaw | Planned. The decoder is already shipped; each format needs a sample that may be kept in the repository, and none can be written by script. Large files may be sent to the desktop app |
| DICOM | yes | no | Browser | ImageMagick (WASM), shown only the picture | **Reading done** (0.39.0): the first picture of a scan. The patient's details are never read by the decoder and never carried across |
| iPhone Live Photo (LIVP) | yes | no | Browser | unzip to HEIC + MOV | Planned |
| PNG/JPEG to SVG (traced) | — | yes | Browser | a vectorizer (WASM) | Planned |
| Any image to PDF; resized; greyscale | — | yes | Browser | pdf-lib; libvips | Planned (presets) |
| JPEG XR | yes | no | Desktop | native codec | Planned, low priority |
| GIMP XCF, Paint.NET PDN, with layers kept | yes | yes | Declined | — | Keeping layers between editors is an editor's job, not a converter's. Flattened reading of XCF may come with ImageMagick |
| Valve VTF, Insta360 INSP, EXE/DLL icons, animated cursors (ANI) | — | — | Declined | — | Niche; no demand yet |
| Live Photo or Motion Photo to and from video | — | — | Desktop | FFmpeg | Planned, low priority |

## Vector

| Format | Home | Engine | Status |
| --- | --- | --- | --- |
| SVG ↔ SVGZ; SVG to PNG, JPEG, WebP, PDF | Browser | libvips + resvg; fflate | Planned |
| EPS, PS, AI | Desktop | Ghostscript | Planned. Ghostscript is AGPL, so it is never served from the site |
| EMF, WMF, CDR, VSD, CGM, ODG, FODG | Desktop | LibreOffice | Planned |
| SVG to DXF | Browser | JavaScript | Planned, low priority |
| SVG to DWG | Desktop | LibreDWG | Planned, low priority |
| Obsidian Canvas | Declined | — | Niche |

## PDF

| Conversion | Home | Engine | Status |
| --- | --- | --- | --- |
| PDF to PNG, JPEG, TIFF, CBZ; to text | Browser | pdf.js | Planned |
| PDF to HTML, Markdown and DOCX, tagged PDFs | Browser | `pdf` (pdf.js), reading the PDF's own structure tags | **Shipped** (0.23.0). Headings, lists and tables are read, not guessed |
| The same, untagged PDFs, or tagged in name only | Browser | `pdf`, with structure estimated from layout | **Shipped** (0.23.0). Estimated, and the result says so. Tables and bold headings are not found yet |
| Scanned PDFs (OCR); pictures carried out of a PDF; characters for Chinese, Japanese and Korean | Browser | Tesseract (WASM); pdf.js | Planned |
| PDF to Markdown, hard layouts and scans | Desktop | Docling or Marker, to be compared on real files | Planned |
| Merge, split, page ranges | Browser | pdf-lib | Planned |
| Images, Markdown, HTML, text to PDF | Browser | pdf-lib; Typst (to be proven) | Planned |
| Compress; PDF/A | Desktop | Ghostscript, qpdf | Planned |
| PDF to DOCX, XLSX, PPTX, SVG | Desktop | LibreOffice | Planned |
| Accessibility check | Browser, by request: the file is sent to audit.icjia.app only when the person asks; veraPDF on the desktop | audit.icjia.app's public API | Planned, with the PDF work. Decided 22 November 2026: never automatic. After a conversion Omsett asks whether an accessibility audit is wanted; only on a yes is the file uploaded, worded plainly ("this sends the file to audit.icjia.app"), no privileged token, and a link to the audit's shareable results page shown in Omsett. Needs the security policy to allow that one origin, the audit API to accept requests from omsett.com, and the site's promise reworded to "nothing leaves unless you ask" |
| PDF to HWPX | Declined | — | See HWP |

## Documents

| Format | Home | Engine | Status |
| --- | --- | --- | --- |
| DOCX ↔ HTML, Markdown | Browser | `markup` (Omsett's own reader and writer, through rehype-sanitize) | **Shipped** (0.19.0). Structure and words; not fonts or page layout |
| Footnotes, headers and footers; pictures saved as separate files; a score for the accessibility of the result | Browser | the same | Planned |
| ODT, RTF, TXT, EPUB to and from these | Browser | ODT the same way (a ZIP of XML); Pandoc (WASM) for the rest | Planned |
| DOCM, DOTX (read) | Browser | Pandoc | Planned |
| EML, Outlook MSG to HTML, TXT; MSG to EML | Browser | JavaScript | Planned |
| DOCX to PDF, tagged | Desktop; Browser if the Typst route holds | LibreOffice; Typst | Planned |
| DOC, WPS, WPD, Pages, FODT, OTT, ClarisWorks, MacWrite, T602 | Desktop | LibreOffice | Planned |
| DOCX or HTML tables to XLSX, ODS, CSV | Browser | Pandoc + SheetJS | Planned |
| OFD | Declined | — | Chinese e-invoice format; no demand |

## Spreadsheets

| Format | Home | Engine | Status |
| --- | --- | --- | --- |
| XLSX ↔ CSV, TSV, JSON, JSON Lines, YAML, TOML, XML; and on to vCard and iCalendar | Browser | `data` (Omsett's own reader and writer) | **Shipped** (0.18.0) |
| Whether the first row names the columns; the shape of the result (records, rows, columns) | Browser | the same | **Shipped** (0.20.0) |
| Choosing which sheet; every sheet at once | Browser | the same | Done |
| XLSM (read, macros ignored), ODS | Browser | the same approach: a ZIP of XML | Planned |
| XLS, XLT (the older binary form, from Excel 97 on) to XLSX and every data format; read only | Browser | `data` (Omsett's own reader, of the container and of the workbook) | **Done** (0.45.0) |
| DOC and PPT (the older binary forms) to the newer formats; read only | Browser | Omsett's own readers, on the same container reader | Next: DOC, then PPT |
| Workbooks from Excel 95 and earlier | Browser | — | Planned |
| Numbers (read) | Browser | SheetJS | Planned |
| OTS, FODS, ET | Desktop | LibreOffice | Planned |
| Any spreadsheet to PDF | Desktop | LibreOffice | Planned |

## Presentations

| Format | Home | Engine | Status |
| --- | --- | --- | --- |
| Markdown to PPTX | Browser | Pandoc | Planned |
| PPTX to HTML and Markdown: a section to a slide, with titles, bullets, tables, links and pictures | Browser | `markup` (Omsett's own reader) | **Shipped** (0.21.0) |
| Speaker notes, as a choice; charts and SmartArt as their text; PPSX, PPTM, ODP | Browser | the same | Planned |
| PPTX, PPTM, PPSX, PPT, ODP, Keynote to PDF, PNG, JPEG, DOCX | Desktop | LibreOffice | Planned |

## HWP

| Format | Home | Status |
| --- | --- | --- |
| HWP, HWPX, and HWPX as a target elsewhere | Declined | Korean office format. Filee's home market; not Omsett's audience. Could arrive as a plugin |

## Text and markup

| Format | Home | Engine | Status |
| --- | --- | --- | --- |
| Markdown ↔ HTML | Browser | `markup` (unified: remark and rehype), cleaned with rehype-sanitize | **Shipped** (0.12.0) |
| The page's language, chosen when converting Markdown to HTML | Browser | the same | **Shipped** (0.14.0) |
| "The article only" from a web page, without its navigation and footer | Browser | the same | Planned |
| TXT, reStructuredText, LaTeX, Org, AsciiDoc, Typst, MediaWiki, DocBook, Jupyter, Textile, man, OPML to each other and to Markdown and HTML, and to DOCX, EPUB, PPTX | Browser | Pandoc (WASM) | Planned |
| Source files and logs, read as text (never run) | Browser | — | Planned |
| MHTML (read) | Browser | JavaScript | Planned |

## Screenwriting

| Format | Home | Engine | Status |
| --- | --- | --- | --- |
| Fountain ↔ Final Draft (FDX) | Browser | `script` (Omsett's own) | **Shipped** (0.22.0) |
| Drafter package (specified in the `drafter` repository, `docs/spec/drafter-package.md`) ↔ Fountain, FDX | Browser | `script` | **Shipped** (0.22.0). The script inside; not the drafts, cuts or workbook |
| A Drafter package of prose to Markdown, DOCX; a script to HTML and DOCX | Browser | `script` with `markup` | Planned |
| Screenplay to PDF, laid out to industry rules | Browser | with the PDF step | Planned |
| Celtx, Highland, Fade In, WriterDuet | Browser | to be looked at | Planned, low priority |

## E-books

| Format | Home | Engine | Status |
| --- | --- | --- | --- |
| EPUB, FB2, HTML, Markdown, DOCX to each other | Browser | Pandoc | Planned |
| CBZ; CBR, CB7 (read) | Browser | libarchive (WASM) | Planned |
| MOBI, AZW3, AZW, AZW4, KEPUB, LIT, LRF, CHM, PDB, HTMLZ, TXTZ | Desktop | Calibre | Planned |

## Video

| Format | Home | Engine | Status |
| --- | --- | --- | --- |
| MP4, MOV, MKV, WebM with H.264, VP9, AV1; to GIF, APNG, WebP, audio; 720p; trim | Browser | WebCodecs | Planned (Phase 4) |
| HEVC (H.265) | Browser where the device provides it; else Desktop | WebCodecs; FFmpeg | Planned |
| AVI, WMV, FLV, MPEG, Video CD, TS, M2TS, 3GP, OGV, VOB | Desktop | FFmpeg | Planned |
| Subtitle tracks kept or extracted | Browser for common containers; Desktop otherwise | — | Planned |
| Security-camera exports (NOV) | Declined | — | Niche |

## Audio

| Format | Home | Engine | Status |
| --- | --- | --- | --- |
| WAV, AIFF (and AIFF-C), AU to each other, unpacked sound only | Browser | Omsett's own code | **Done** |
| FLAC to and from those three | Browser | Omsett's own code | **Done** |
| MP3 to and from those four, at three qualities | Browser | mpg123 (unpacking) and LAME (packing), small WASM builds, 217 KB together | **Done** |
| M4A, AAC, OGG, Opus, WavPack, TTA, AC3, E-AC3, ALAC to each other; M4R | Browser | FFmpeg, audio-only build (WASM), decided 24 November 2026 for this long tail. To settle first: its size (about 30 MB in the usual build) and its licence (GPL in the usual build; an LGPL build means building it ourselves) | Planned |
| W64, RF64 (WAV past four gigabytes) | Browser | Omsett's own code | Planned |
| Changing the rate, the channels or the bit depth | Browser | — | Planned |
| WMA, AMR, APE, DSD (DSF, DFF), DTS (read) | Browser | the same | Planned |
| Tracker modules (XM, IT, S3M) | Declined | — | Niche. libopenmpt could do it |

## Subtitles

| Format | Home | Engine | Status |
| --- | --- | --- | --- |
| SRT, WebVTT, ASS, SSA, TTML, LRC, SBV, SAMI, MicroDVD to each other as UTF-8 | Browser | `subtitle` (Omsett's own; fast-xml-parser for TTML) | **Shipped** (0.10.0). Words and times only: styling is not carried |
| Italics, bold and position carried between the formats that have them | Browser | the same | Planned |
| SCC (broadcast captions) | Browser | JavaScript | Planned |
| KRC; legacy code pages read correctly | Browser | JavaScript | Planned, low priority |

## Archives

| Format | Home | Engine | Status |
| --- | --- | --- | --- |
| ZIP, TAR, TAR.GZ to each other | Browser | `archive` (Omsett's own) | **Shipped** (0.17.0) |
| Taking single files out of an archive; a list of what is in one | Browser | the same | Planned |
| 7Z, TAR.BZ2, TAR.XZ, TAR.ZST, GZ, ZST | Browser | libarchive or 7z (WASM) | Planned |
| RAR, ISO, CAB, DMG, JAR, NuGet (read) | Browser | libarchive | Planned. RAR's licence allows reading only |
| Any files to one ZIP | Browser | `archive` | **Shipped** (0.17.0): "Download all as a ZIP" |
| Folders to ISO | Declined | — | Low value in a browser |
| ALZ, EGG, GMA, VPK, BSP, WBPZ, Android bundles, Adobe ZXP | Declined | — | Niche |

## Fonts

| Format | Home | Engine | Status |
| --- | --- | --- | --- |
| TTF, OTF, WOFF, WOFF2: wrapped and unwrapped | Browser | `font` (Omsett's own) and `font-woff2` (woff2-encoder) | **Shipped** (0.15.0) |
| TTF ↔ OTF (redrawing the outlines) | Browser | to be found | Planned |
| A preview of the letters; font collections (TTC); EOT (read) | Browser | to be found | Planned |
| Subset to Latin, with a CSS snippet | Browser | harfbuzz (WASM) | Planned (preset) |
| FON | Declined | — | Niche |

## Data

| Format | Home | Engine | Status |
| --- | --- | --- | --- |
| JSON, JSON Lines, YAML, TOML, XML, CSV, TSV to each other | Browser | `data` (yaml, smol-toml, fast-xml-parser, and Omsett's own CSV) | **Shipped** (0.9.0) |
| The same to XLSX | Browser | SheetJS | Planned, with spreadsheets |
| Cells that a spreadsheet would run as formulas | — | — | Decided: written exactly as they are, with a warning in the picker. Never altered |
| vCard, iCalendar ↔ CSV, TSV, JSON, JSON Lines, YAML, TOML, XML | Browser | `data` (Omsett's own reader and writer) | **Shipped** (0.16.0) |
| Contact photos; a structured address; repeating events written out as dates | Browser | the same | Planned |

## 3D models

| Format | Home | Engine | Status |
| --- | --- | --- | --- |
| GLB, glTF, STL, OBJ, 3MF, PLY to each other; PNG preview | Browser | three.js or assimp (WASM) | Planned (Phase 5) |
| FBX (read) | Browser | the same | Planned (Phase 5) |
| Source-engine models (SMD, MDL) | Declined | — | Niche |

## Geospatial

| Format | Home | Engine | Status |
| --- | --- | --- | --- |
| Shapefile, GeoJSON, KML, KMZ, GPX to each other, and to CSV, XLSX, JSON; reprojected to WGS 84 | Browser | JavaScript, proj4 | Planned (Phase 5) |
| Garmin FIT, OpenStreetMap (read) | Browser | JavaScript | Planned (Phase 5) |

## CAD

| Format | Home | Engine | Status |
| --- | --- | --- | --- |
| DXF to SVG, PNG, PDF | Browser | JavaScript | Planned (Phase 5) |
| DWG ↔ DXF | Desktop | LibreDWG | Planned (Phase 5) |
| Gerber, G-code previews | Declined | — | Niche |

## The app itself

Work that is not a format, kept here so it is scheduled with the formats.

### Side-by-side view for data and subtitles (shipped, 0.11.0)

After a data or subtitle conversion, the result card shows the start of the original and of the
converted file next to each other: 200 lines at most, from the first 64 KB, each line cut at
500 characters, with line numbers, in the system's fixed-width typeface. Contents are put on the
page as text and never as markup. The bytes are decoded on the page, not in the worker: it is a
bounded read of 64 KB and involves no engine.

Still to do: colouring by format, and marking which lines changed.

### PDF to Markdown

A conversion the owner uses often, for content going into Strapi, and one that is usually a
mess: a PDF records where letters sit, not what is a heading or a table. Three steps, in order:

1. **Tagged PDFs.** Where the PDF carries structure tags, read them. Nothing is guessed, and
   Omsett says the structure is exact.
2. **Untagged PDFs.** Rebuild structure from layout: font size for headings, spacing for
   paragraphs, alignment for columns and tables. Omsett says the structure is estimated.
   Tables, multi-column pages and footnotes are where this goes wrong.
3. **Hard layouts and scans**, in the desktop app, with a layout-analysis model. Docling and
   Marker are the candidates; compare them on real files before choosing.

The side-by-side view shows the Markdown beside the page's text, so a conversion can be checked
before it is downloaded. Test against real documents the owner sends, not only made-up ones;
the output has to paste cleanly into Strapi's Markdown editor.

### Accessibility of converted documents (with documents and PDF)

A converted document must not be less accessible than the original. Accessibility is measured
with [audit.icjia.app](https://audit.icjia.app).

- **In development:** every document fixture is scored before and after conversion. A
  conversion that lowers the score fails its test, or is a stated limit with a warning in the
  picker; it is never silent.
- **In the app:** every document conversion carries a warning that the converted file may have
  more accessibility problems than the original, and names what is at risk (tags, headings,
  alternative text, reading order).
- **With the audit the user opts into:** after a conversion Omsett asks whether to run an
  accessibility audit. Only on yes is anything uploaded. Both files are scored, and the two
  scores are shown together, with a clear statement if the converted file scores lower.

## What decides "Browser" or "Desktop"

- **If a browser can do it, it does.** No upload, no install.
- **Licences.** Ghostscript is AGPL and is not served from the site. HEVC encoding needs a patent
  licence, so HEIC and H.265 are written only where the device supplies the encoder.
- **Size and time.** A job needing more memory than a tab safely has, or hours of processing,
  belongs on the desktop.
- **Fidelity.** Office documents to PDF need LibreOffice to look right.

## Suggested order

1. Images are largely done: 31 formats. Left: the camera makers' own RAW formats, carrying animation across, and the packed kinds of DDS.
2. Data and subtitles are done: seven data formats, nine subtitle formats. The side-by-side view for text formats is done too, and Markdown ↔ HTML. Fonts are done as well, vCard and iCalendar, and the first archives. XLSX, DOCX, PPTX, the screenwriting formats and reading PDF are done. Details of a file before converting are done too. Next: the remaining image formats; then audio. All three are ZIPs of XML, and Omsett reads both itself. Then the screenwriting formats, Fountain, Final Draft (FDX) and Drafter. Small JavaScript libraries, no large downloads.
3. Archives are done. Audio has begun: WAV, AIFF, AU and FLAC convert to each other with nothing lost, and MP3 to and from all four. Next for audio: the long tail (AAC, Ogg, Opus and the rest) through an audio-only FFmpeg build.
4. Documents and e-books through Pandoc; then the PDF tools. A converted document must not score lower for accessibility than its original (see "Accessibility of converted documents").
5. Video in the browser.
6. The desktop app, which unlocks everything marked Desktop at once.
