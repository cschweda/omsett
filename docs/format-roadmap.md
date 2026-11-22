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
| SVGZ | yes | no | Browser | gunzip, then resvg | Planned |
| BMP, ICO, CUR, ICNS, TGA, PPM/PGM/PBM/PAM, QOI, PCX, DDS, SGI, Sun Raster | yes | yes | Browser | ImageMagick (WASM) | Planned. Needs a second engine and a damage test per format |
| JPEG 2000, APNG, MNG | yes | yes | Browser | ImageMagick (WASM) | Planned |
| OpenEXR, Radiance HDR, FITS | yes | some | Browser | ImageMagick (WASM) | Planned |
| PSD, PSB | yes | no | Browser | ImageMagick (WASM) | Planned (flattened). Layers are not kept |
| Camera RAW (CR2, CR3, NEF, ARW, DNG, …) | yes | no | Browser | LibRaw (WASM) | Planned. Large files may be sent to the desktop app |
| DICOM | yes | no | Browser | ImageMagick or dicom.ts | Planned |
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
| Merge, split, page ranges | Browser | pdf-lib | Planned |
| Images, Markdown, HTML, text to PDF | Browser | pdf-lib; Typst (to be proven) | Planned |
| Compress; PDF/A | Desktop | Ghostscript, qpdf | Planned |
| PDF to DOCX, XLSX, PPTX, SVG | Desktop | LibreOffice | Planned |
| Accessibility check | Browser, by request: the file is sent to audit.icjia.app only when the person asks; veraPDF on the desktop | audit.icjia.app's public API | Planned, with the PDF work. Decided 22 November 2026: never automatic. After a conversion Omsett asks whether an accessibility audit is wanted; only on a yes is the file uploaded, worded plainly ("this sends the file to audit.icjia.app"), no privileged token, and a link to the audit's shareable results page shown in Omsett. Needs the security policy to allow that one origin, the audit API to accept requests from omsett.com, and the site's promise reworded to "nothing leaves unless you ask" |
| PDF to HWPX | Declined | — | See HWP |

## Documents

| Format | Home | Engine | Status |
| --- | --- | --- | --- |
| DOCX, ODT, RTF, Markdown, HTML, TXT, EPUB to each other | Browser | Pandoc (WASM) | Planned |
| DOCM, DOTX (read) | Browser | Pandoc | Planned |
| EML, Outlook MSG to HTML, TXT; MSG to EML | Browser | JavaScript | Planned |
| DOCX to PDF, tagged | Desktop; Browser if the Typst route holds | LibreOffice; Typst | Planned |
| DOC, WPS, WPD, Pages, FODT, OTT, ClarisWorks, MacWrite, T602 | Desktop | LibreOffice | Planned |
| DOCX or HTML tables to XLSX, ODS, CSV | Browser | Pandoc + SheetJS | Planned |
| OFD | Declined | — | Chinese e-invoice format; no demand |

## Spreadsheets

| Format | Home | Engine | Status |
| --- | --- | --- | --- |
| XLSX, XLSM, XLS, XLT, ODS, CSV, TSV, JSON, HTML to each other | Browser | SheetJS | Planned |
| Numbers (read) | Browser | SheetJS | Planned |
| OTS, FODS, ET | Desktop | LibreOffice | Planned |
| Any spreadsheet to PDF | Desktop | LibreOffice | Planned |

## Presentations

| Format | Home | Engine | Status |
| --- | --- | --- | --- |
| Markdown to PPTX | Browser | Pandoc | Planned |
| PPTX to its text as Markdown | Browser | unzip | Planned |
| PPTX, PPTM, PPSX, PPT, ODP, Keynote to PDF, PNG, JPEG, DOCX | Desktop | LibreOffice | Planned |

## HWP

| Format | Home | Status |
| --- | --- | --- |
| HWP, HWPX, and HWPX as a target elsewhere | Declined | Korean office format. Filee's home market; not Omsett's audience. Could arrive as a plugin |

## Text and markup

| Format | Home | Engine | Status |
| --- | --- | --- | --- |
| TXT, Markdown, HTML, reStructuredText, LaTeX, Org, AsciiDoc, Typst, MediaWiki, DocBook, Jupyter, Textile, man, OPML to each other, and to DOCX, EPUB, PPTX | Browser | Pandoc (WASM) | Planned |
| Source files and logs, read as text (never run) | Browser | — | Planned |
| MHTML (read) | Browser | JavaScript | Planned |

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
| MP3, M4A, AAC, WAV, FLAC, OGG, Opus, AIFF, WavPack, TTA, W64, AC3, E-AC3, ALAC to each other; M4R | Browser | FFmpeg, audio-only build (WASM) | Planned |
| WMA, AMR, APE, DSD (DSF, DFF), DTS (read) | Browser | the same | Planned |
| Tracker modules (XM, IT, S3M) | Declined | — | Niche. libopenmpt could do it |

## Subtitles

| Format | Home | Engine | Status |
| --- | --- | --- | --- |
| SRT, ASS/SSA, WebVTT, SAMI, LRC, TTML, MicroDVD, SCC to each other as UTF-8 | Browser | JavaScript | Planned |
| KRC; legacy code pages read correctly | Browser | JavaScript | Planned, low priority |

## Archives

| Format | Home | Engine | Status |
| --- | --- | --- | --- |
| ZIP, 7Z, TAR, TAR.GZ, TAR.BZ2, TAR.XZ, TAR.ZST, GZ, ZST: extract and create | Browser | fflate, libarchive, 7z (WASM) | Planned |
| RAR, ISO, CAB, DMG, JAR, NuGet (read) | Browser | libarchive | Planned. RAR's licence allows reading only |
| Any files to one ZIP | Browser | fflate | Planned (the "download all" path) |
| Folders to ISO | Declined | — | Low value in a browser |
| ALZ, EGG, GMA, VPK, BSP, WBPZ, Android bundles, Adobe ZXP | Declined | — | Niche |

## Fonts

| Format | Home | Engine | Status |
| --- | --- | --- | --- |
| TTF, OTF, WOFF, WOFF2, EOT to each other | Browser | fontkit, wawoff2 | Planned |
| Subset to Latin, with a CSS snippet | Browser | harfbuzz (WASM) | Planned (preset) |
| FON | Declined | — | Niche |

## Data

| Format | Home | Engine | Status |
| --- | --- | --- | --- |
| JSON, JSON Lines, YAML, TOML, XML to each other; to CSV and XLSX | Browser | JavaScript | Planned |
| vCard, iCalendar ↔ CSV | Browser | JavaScript | Planned |

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

## What decides "Browser" or "Desktop"

- **If a browser can do it, it does.** No upload, no install.
- **Licences.** Ghostscript is AGPL and is not served from the site. HEVC encoding needs a patent
  licence, so HEIC and H.265 are written only where the device supplies the encoder.
- **Size and time.** A job needing more memory than a tab safely has, or hours of processing,
  belongs on the desktop.
- **Fidelity.** Office documents to PDF need LibreOffice to look right.

## Suggested order

1. The rest of the images: the ImageMagick set, and SVGZ. AVIF, JPEG XL, HEIC (read) and SVG (read) are done.
2. Data, subtitles, fonts: small JavaScript libraries, no large downloads.
3. Archives, then audio.
4. Documents and e-books through Pandoc; then the PDF tools.
5. Video in the browser.
6. The desktop app, which unlocks everything marked Desktop at once.
