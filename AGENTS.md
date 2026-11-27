# AGENTS.md

Rules for anyone, human or agent, working in this repository. They are condensed from
[`docs/01-kickoff-prompt-phase-0.md`](docs/01-kickoff-prompt-phase-0.md); the design is in
[`docs/00-high-level-design.md`](docs/00-high-level-design.md).

Omsett is an open-source file converter. Every conversion that can run in the browser runs
there, so files never leave the device.

## Commands

```
pnpm install         # also copies engine binaries, fonts, and the sample file into apps/web
pnpm dev             # the app at http://localhost:3000, this machine only
pnpm dev:lan         # the same, reachable from other devices on the network (plain HTTP)
pnpm dev:lan:https   # the same over HTTPS: needed for Safari and for libvips on other devices
pnpm test            # Vitest: registry, router, detection, fixtures through Node engines
pnpm build           # static site + generated headers and policies → apps/web/.output/public
pnpm e2e             # Playwright against the built site, in Chromium, Firefox, WebKit
pnpm lint && pnpm typecheck
docker compose up --build   # the self-host image at http://localhost:8080
scripts/publish-static.sh   # build and publish atomically, as the server does
```

`pnpm e2e` needs `pnpm build` first. `BASE_URL=https://… pnpm e2e` points it at a deployed copy.

## Architecture rules

These are invariants. A change that breaks one is wrong even if it works.

1. **The registry is data, and the only place that says what converts to what.** A format is a
   `Format` record plus a fixture. A conversion is a format listed in an engine's `Capability`.
   Edges are derived (`packages/registry/src/derive.ts`); nobody writes one. No component,
   composable, or engine hard-codes a format name, extension, or MIME type, the file input's
   `accept` included.
2. **Engines never run on the browser's main thread.** `packages/engines` holds plain async
   modules with no worker code. `apps/web` runs each inside a Web Worker
   (`app/workers/engine.worker.ts`). In Node they are called in-process.
3. **Engines are lazy.** No `.wasm` is fetched until a conversion needs it, and the tile shows
   the download size first.
4. **Two tiers, named the same everywhere:** `browser` and `native`.
5. **Detection by content, not name.** `packages/detect` reads magic bytes; the detected format
   wins over the extension. Two exceptions, both in `packages/detect/src/text.ts`: YAML, TOML,
   CSV and TSV are plain text that cannot always be told apart, so among those four the name
   settles it; and Markdown, Fountain and plain text are any text at all, so only a name can
   say that a file is one of them (`.txt` is asked last, so that a `.txt` that is JSON or
   subtitles is that). A name never makes text of something that is not.
6. **Nothing leaves the origin.** No request to another origin, ever; no request carrying file
   bytes to its own, with one exception that the person must ask for each time: checking a
   document's accessibility (`app/utils/accessibility.ts`, `useAccessibilityCheck`). That is
   off unless a copy is set up for it, sends nothing until the person has read where the file
   goes and pressed "Send", and sends to the copy's own origin, whose server forwards it. Do
   not add a second exception, and do not make this one quieter. Enforced by policy, not intention (see below), and asserted in
   `e2e/gate.spec.ts`. Counting visits does not change this: where a copy of Omsett is set up
   to count them, the app's own code reports a page view to the copy's own origin, whose server
   forwards it (`app/utils/visits.ts`, `docs/deploy-digitalocean.md`). No analytics script is
   ever loaded, from anywhere: third-party code does not run in the page where the files are.
7. **Every engine is tested where it really runs.** Engines whose `runtimes` include `node` run
   the fixtures in Vitest; browser-only engines run them in Playwright.
8. **Accessibility work waits for the final phase.** Until then: no audits, no axe gate, no
   screen reader testing, and no changes made for accessibility's sake. What already exists (the
   real file input, the radio-group picker, the live region) stays as it is; do not remove it and
   do not extend it. The axe and keyboard-order tests in `e2e/gate.spec.ts` are parked behind
   `ACCESSIBILITY_DEFERRED`. One exception, asked for on 24 November 2026: an automated check
   of every page, recorded in the README, and its two findings fixed. A table wrapped in
   `.table-wrap` is given `tabindex="0"`, `role="region"` and a label, so a keyboard can scroll it.
9. **The converter is one screen.** `pages/index.vue` is the whole tool: no steps across pages,
   no modals on the happy path. The information pages (About, Trust, Technical details, What's new, Security, Settings, Trap files,
   Status) sit beside it and never stand between a person and a conversion.
10. **A server is optional and absent by default.** `useServerHealth` is the only code that knows
    one might exist, and it only talks to its own origin. There is no field for a server URL.
11. **Every engine declares its license** (`license`, `sourceUrl` in
    `packages/engines/src/info.ts`) and appears in `THIRD-PARTY-NOTICES.md`.

## Security policies

All of it is defined in one file, `apps/web/security-headers.ts`, and written out after the
build by `apps/web/scripts/write-headers.ts`.

- The **page** carries its Content-Security-Policy as a `<meta>` tag, so it applies wherever the
  files are hosted. It allows no eval. Inline scripts are allowed by hash, computed at build.
- **Worker scripts** carry their own policy as a response header, because a worker is governed
  by its own script's response and not by the page. That policy adds `'unsafe-eval'`, which
  libvips's bindings need, and nothing else. Workers are emitted under `/_nuxt/workers/`; the
  build fails if one lands anywhere else.
- Both policies carry `connect-src 'self' blob:`. Never widen it.
- Do not add a `Content-Security-Policy` header to `/*`: it would also govern worker scripts and
  break libvips.
- The headers are written in three formats (Netlify `_headers`, a Caddy snippet, an nginx
  snippet). The site is served by nginx; CI runs the conversion tests through
  `apps/web/nginx/omsett.conf` so that path stays proven.

## Things that will bite

- **Nuxt has its own `useAnnouncer`.** Ours is `usePoliteAnnouncer`.
- **Engine binaries, fonts, and the sample file in `apps/web/public` are generated**, by
  `scripts/prepare-assets.ts`, and are not committed.
- **Safari cannot encode WebP from a canvas** and answers with a PNG. The canvas engine probes
  for this (`available()`), and Safari falls through to libvips.
- **Playwright's Firefox build crashes** (content process, signal 11) when an axe scan and a
  conversion happen in the same page, so the axe tests (parked for now) skip Firefox. Its test profile also needs
  a preference to treat a WebP link as a download (see `playwright.config.ts`).
- **CI runs in parallel jobs** (`.github/workflows/ci.yml`): unit checks, the browser suite
  split by browser and by shard, the nginx run, and the Docker image. "All checks" passes only
  if every one did; that is the name to look at before merging. When a browser job passes ten
  minutes, add a shard.
- **GitHub Actions are pinned to commit SHAs**, with the release in a trailing comment. Keep it
  that way when adding or updating one; look the SHA up, do not guess it.
- **The README's figures and format table are generated** (`pnpm readme:facts`, from the
  registry and the trap list), and a test fails when they are stale. After a change that adds a
  format or a trap: `pnpm readme:facts`, then `pnpm test && pnpm tests:count`.
  Its prose and its screenshots (`docs/screenshots/`, made by `e2e/readme-screenshots.spec.ts`)
  are kept current by hand, in the same change that alters what they show.
- **The Trust page's figures are counted, never typed.** Tests are counted from a real run:
  after adding or removing a test, run `pnpm test && pnpm tests:count` and commit
  `test-count.json`. CI runs `pnpm tests:count --check` and fails if it is out of date.
- **Security audits** live in `security/audits.json`, newest first. The site's Security page,
  `SECURITY.md`, and the README's Security section are generated from it; run
  `pnpm security:docs` after editing, or a test fails. Never mark a finding fixed without a test.
- **Every conversion has a time limit** (`apps/web/app/utils/limits.ts`); past it the worker is
  terminated. A new engine needs no code for this, but must be safe to kill at any moment.
- **A browser's decoder never converts a file the app has not verified.** The canvas
  engine reads PNG only, after `structureProblem` has passed it. Previews are the one
  exception, and only to be looked at (`app/workers/thumbnail.worker.ts`): a dropped picture is
  drawn only if it states its size and that is under `PREVIEW_MAX_PIXELS`, one at a time. To let the canvas read another
  format, first write a structure check for it in `packages/detect`; until then libvips reads it.
  A registry test fails if any other format is given to the canvas.
- **A format can be switched off in one line**, in `packages/registry/src/switches.ts`. Off, it
  is gone from the registry and so from the whole app; `everything` is the registry before
  switches. HEIC has one, because of HEVC patents. Tests must pass with a switch either way.
- **ImageMagick is always told what it is reading.** The `magick` engine passes the detected
  format as the coder and never lets ImageMagick guess: some of what it can guess its way into
  (scripts, drawings that name other files) is not a picture. Do not add an unhinted read.
- **A file is offered only formats of its own kind** (`packages/registry/src/kinds.ts`):
  pictures and drawings are one kind, data another, subtitles a third, Markdown and HTML a
  fourth, fonts a fifth, archives a sixth, sound a seventh. Spreadsheets are of data's kind, and documents of
  Markdown's and HTML's, as are PDFs and e-books: a book is writing. Screenplays are a kind of their own. A new category that should convert into an
  existing one must be added there, or its formats will never be listed for it.
- **A few things can become something of another kind, one way only** (`ALSO` and `canBecome` in
  `kinds.ts`): a picture can become a PDF, and a PDF's pages can be drawn as pictures. The
  router ends no road at a kind the file cannot become, so a picture does not go on through a
  PDF to a Word document, and a PDF does not become a drawing. A table can be set out as a page,
  and so become a document or a PDF; a page does not become a table. Add a pair there; do not
  merge two kinds to get one conversion.
- **A step of a route may make several files, and every one goes on** (`runFile` in
  `useConversionQueue`): a PDF's pages are drawn as PNGs, and each is converted by the next
  step. Never pass on only the first output of a step.
- **A format is offered to itself only where its capability says what that does** (`itself`
  on a `WriteSpec`, shown on the tile in place of the name). PDF to PDF is a split. The router
  takes such a pair in one step and never as a step of a longer road. Every other format says
  "Already …".
- **A PDF is taken apart by qpdf, and what goes with the pages is decided by Omsett**
  (`qpdf/clean.ts`, over `--json=2`). Allowed, not forbidden: an action stays only if it goes to
  a page or a web or mail address, and after drawing, an annotation stays only if it is a link.
  The order matters: notes and pop-ups out first, then the rest drawn into the page
  (`--flatten-annotations`), then forms and every other annotation out. Each PDF written is
  read with object streams off, and refused if `FORBIDDEN` matches anywhere in it. The person's
  page range is read by `pagesFrom` and only numbers reach qpdf. Refused: encrypted, repaired
  (exit 3), any layers at all, redactions not applied. Streams are copied, never unpacked
  (`--decode-level=none`), and pages taken with `--remove-unreferenced-resources=yes`. qpdf wears
  out past about 240 calls in one instance: each conversion starts its own, and a long split a
  fresh one every `CALLS_PER_INSTANCE`. qpdf's loader takes no bytes; it is given a
  `blob:` address of the verified binary, and `pdf-split.spec.ts` asserts no other is fetched.
- **A trap may say what it is converted to** (`to` in `make-traps.py`), where the usual target
  for its kind would not reach the engine it tests.
- **A PDF's pages are drawn by pdf.js trusting nothing in the file** (`pdf/pages.ts`): its
  typefaces are drawn as outlines and never installed, no typeface of the device is consulted,
  a picture inside it is decoded by pdf.js's own code and never by the browser's
  (`isImageDecoderSupported: false`), and pdf.js fetches nothing. The files it asks for by name
  (standard typefaces, character tables, picture decoders) come through `BinaryDataFactory`
  from bytes the worker has verified; its JavaScript fallbacks are never published. Only in a
  browser, so it is tested in `e2e/pdf-pages.spec.ts`; the generic conversion test skips PDF to
  picture, whose results are one to a page at a size of their own.
- **Only PNG is set on a PDF page** (`picturePage` in the `typst` engine). Every other picture is
  made a PNG first, by the engines that drop its metadata; Typst would embed a JPEG as it is,
  location and all. The PNG's structure is checked before Typst decodes it.
- **An engine's reason for refusing a file reaches the user only as a `Refusal`**
  (`packages/engines/src/util.ts`). Any other error is shown as "This file couldn't be
  converted". Write the message for the person who dropped the file.
- **Readers of text formats are written to be attacked.** The subtitle readers
  (`packages/engines/src/subtitle/read.ts`) pass over the text once, cap how many subtitles and
  how much text a file may turn into, and refuse a time that does not read as a time. Keep a
  new reader to the same rules, and give it a trap for each.
- **A blocked pair has no route at all.** An override with `block` and no engine removes the
  pair even where two other steps would get there (TTF to WOFF to OTF). Give the reason in a
  sentence; the picker shows it.
- **A web font unwraps to TTF or OTF, not both.** Which one depends on the outlines inside, so
  each web-font sample converts to one and is refused for the other, in exact words the fixture
  test allows. Every conversion must still succeed for at least one sample.
- **Everything an archive says is checked before it is acted on**
  (`packages/engines/src/archive/entries.ts`): sizes are added up before anything is unpacked,
  unpacking stops at the stated size, and every name goes through `safeName`. A name that
  points outside the archive is not cleaned up; the archive is refused. Any new archive format
  reads into the same `Contents`, so it gets the same limits.
- **An office file is a ZIP of XML, and is read as both** (`packages/engines/src/data/sheet.ts`):
  through `readZip`, so the archive limits hold, and with any part that declares a DOCTYPE
  refused, wherever in the part it does so, never only near the start. Formulas are never worked out and never written; macros and linked files are never
  opened. DOCX and PPTX should be read the same way. A file saved with macros or as a template
  (DOCM, DOTX, PPTM, PPSX, XLSM and the rest) is its family's package under another label, and
  is that family's format in the registry, not one of its own: it is read by the same reader
  under the same limits, and its macro project is never opened.
- **An OpenDocument text is read as a DOCX is** (`packages/engines/src/markup/odt-read.ts`), through
  the same `openOffice`, so the archive limits and the DOCTYPE refusal hold. Bold, slanted and
  hidden are said by styles, which take from other styles; a chain is followed no further than
  it is long and a circle says nothing. Deleted text is kept apart in a list of changes and is
  never read; comments, notes, hidden text, hidden paragraphs and sections hidden outright or
  on a condition are left out; so are fields, columns and rows hidden the same ways, and
  paragraphs hidden inside a box of text. A heading's own style does not make its words bold.
  Its XML is read with namespaces resolved (`openOffice(…, ODF)`): names in OpenDocument's
  vocabularies lose their prefix, any other becomes `foreign:…` and is never read as one of
  them. Do not read an ODT with prefixes simply dropped.
- **An OpenDocument presentation is read with the ODT reader's text** (`openOdf` in
  `odt-read.ts`, `odp-read.ts`): the slides are walked in the order their shapes are stored,
  and each box handed to the same `blocks`, so lists, tables, emphasis, links, pictures and
  what is hidden inside a box behave as in an ODT. Left out besides: speaker notes (unless asked for), slides
  hidden by their style (found among the named styles and through parents too), and any shape,
  at any depth, that `odf.shown` turns away: `display` of `none` or `printer`, a hidden layer,
  an empty placeholder, the slide's number, date, header and footer. An OpenDocument
  attribute is named by its vocabulary's fixed prefix (`@draw:display`, `@text:display`),
  whatever prefix the file chose; ask for the one you mean, never a bare name. `sample.odp` reads to exactly the page
  `pptx/sample.pptx` does, and a test holds them to it.
- **RTF is read by Pandoc, and never trusted** (`packages/engines/src/pandoc`). Pandoc is the
  project's own WebAssembly build, shipped unchanged (GPL-2.0-or-later), fetched only for an
  RTF, and started by its package's own loader (`pandoc-wasm/core`, an alias in
  `nuxt.config.ts`) from bytes the worker has verified; its browser entry, which fetches the
  binary itself, is never imported. Before Pandoc sees an RTF, `prepareRtf` walks it once: it
  takes out words deleted with changes tracked (Pandoc keeps them, struck out), refuses
  nesting past 200 groups, raw bytes past the end, a brace that closes nothing, and anything
  after the document's end, and mends two of Pandoc 3.10's slips (a letter by number loses the
  next character; a list just before a table moves to the top). After it, the page goes through
  `officeToHtml` like any other: Pandoc's title block, which names the author, is dropped; the
  description "image" it makes up is dropped; a picture's bytes are checked; a list Pandoc
  split is joined; a table's heading row, which Pandoc forgets, is marked from the RTF. RTF is
  written by Omsett's own writer (`markup/rtf-write.ts`), with real lists, which Pandoc's
  writer does not make. Plain text is read and written by Omsett's own code.
- **A picture inside an office file is believed by its bytes, never its name**
  (`pictureAddress` in `docx-read.ts`). A part named `.png` that does not begin as a PNG is
  described, not carried. Every reader that carries pictures goes through it.
- **An old Office file is two things to check, one inside the other.** Outside, the container
  (`packages/detect/src/cfb.ts`): every sector number, chain and length is held against the size
  of the file, and a chain is followed no further than the file has sectors. Inside, for a
  workbook, a row of records (`packages/engines/src/data/xls.ts`), each checked to lie within
  its stream. Which of Word, Excel or PowerPoint a file is, is said by its streams, never its
  name. DOC and PPT are read through the same container reader (`packages/engines/src/markup/doc-read.ts`,
  `ppt-read.ts`). All are read only.
- **An old PowerPoint file is found by its directories, newest first** (`ppt-read.ts`). Each
  save adds a directory of where every object is and points to the save before; the reader
  follows that chain (refusing a circle), lays the directories down oldest first so that the
  last save's word stands, and reads only what the newest names. The text of an earlier save is
  still in such a file and must never come out (`earlier-save-still-in-the-file.ppt`). The list
  of slides decides their order, never where each is stored. A placeholder's text is kept in that
  list (PowerPoint) or in its shape (Apache POI); both are read. Every record's length is held to
  its container's, with one exception: inside a shape's client data, where POI writes an atom
  longer than it is, the reader keeps the placeholder and reads no further. Do not widen that.
- **An old Word document is mostly directions, and each is checked before it is followed**: the
  list of which stretches of the file are the text, the numbered pages that say how each run is
  set, the count of characters. Text is taken in the order of the list, never the order of the
  file. What is struck out (`sprmCFRMarkDel`) or hidden (`sprmCFVanish`) is dropped as it is
  read, and so is everything between a field's opening mark and its separator. A reader that
  writes HTML writes tags from a fixed list and nothing else: words from a file (an address, a
  name) are escaped into text or an attribute, and never join the names of tags.
- **The three workbook readers give the same shape and are held to the same answer.** XLS and
  ODS are opened into the `Opened` that XLSX is, so sheets, limits, dates and the column names
  are one piece of code. `xls/sample.xls` and `ods/sample.ods` hold what `xlsx/sample.xlsx`
  holds, and each `events` sample what the others do; a change to one sample is made to all.
  An ODS is known by its first bytes (`looksLikeOds`), or by its type part where a writer
  packed that against the rules. A column's name is kept to 255 letters (`rowsFrom`): every
  name is made from a cell, and an uncut name is a copy of the cell for every column. A cell or row an ODS repeats is counted against the limits as
  if written out; an empty one repeated to the edge of the sheet costs nothing.
- **A Kindle book is read by the numbers it gives, each checked first** (`packages/engines/src/ebook`):
  where each record starts, how long the text is, which stretch is which page, where each piece
  goes. Its text is unpacked under a limit set by how many records it has, never by the length
  it claims; a phrase in its dictionary that is made of other phrases is unpacked once, to a
  bounded size and depth, and one that names itself is refused.
- **Bytes are counted as bytes** (`byteText` in `ebook/kindle.ts`). A Kindle book gives places as
  counts of bytes, so its text is handled one letter to a byte until the links are settled.
  `TextDecoder('latin1')` is not that: it is Windows-1252, and turns some bytes into letters
  that do not fit back into a byte. That mistake corrupted every curly quote, and a test with
  accented and Chinese text now guards it.
- **An EPUB's pages are written by Omsett's own writer** (`written` in `ebook/epub-write.ts`),
  from a tree that has been through the sanitizer, so they are well-formed whatever went in.
  Marks (`id`) are kept, since a book's links depend on them; a link whose mark did not
  survive cleaning falls back to its page.
- **A stylesheet is cleaned by allowing, not by forbidding** (`cleanStyle`). CSS lets any letter
  be an escape and has many ways to name an address, so a list of bad patterns always misses
  one. Escapes and comments are removed first; `url()` is kept only for a picture in the book;
  every other function that takes an address is renamed; and it is cleaned until cleaning
  changes nothing, because taking a thing out can join its two sides into the thing taken out.
  Add a new case to its test, and never a new pattern that keeps something.
- **A book reaches PDF, Word and Markdown as one page, and a page reaches EPUB as chapters**
  (`ebook/page.ts`). `bookPage` renames every mark for the section it is in and points every
  link at the new name; a test requires that no link on the page is dead. `pageParts` cuts a
  page at the highest level of heading it has more than one of. Both hand on to code that
  already cleans (`officeToHtml`, `writeEpub`); neither writes a page of its own.
- **An EPUB's pages are XML and are read as web pages, so tags written closed are opened first**
  (`openedAndClosed` in `ebook/epub-read.ts`). `<a id="x"/>` and `<title/>`, read as HTML,
  swallow what follows them. A name in a book's list is a file in the book or it is nothing:
  every path is worked out from the file that names it, and one that leads out names nothing.
  A list that declares shorthand (`<!ENTITY`) is refused.
- **A walk over a page that stops short leaves the rest uncleaned.** A review put a picture kept
  on another site at the top of a page of two million line breaks: the walk that drops such
  pictures stopped at its limit before reaching it. A page of a book is now counted before it
  is read (`MAX_PAGE_TAGS`) and refused past the count, and `elements` refuses rather than
  stops. A new walk with a guard must do one or the other; never stop quietly.
- **A book's page is checked for depth before it is parsed** (`tooDeep` in `ebook/epub-read.ts`),
  and tags that turn the rest of a page into text (`plaintext`) are never read or written.
- **A heading is made from a paragraph only where the book's own list of contents says so**
  (`bookPage`): the page has no heading, and the paragraph is an entry of the list word for
  word. The result says how many were made. Do not guess headings from size or weight.
- **For a book, book formats are offered first** (`ownFirst` in `kinds.ts`). It is the one
  exception to "formats are ranked by their order in `formats/index.ts`".
- **Every conversion of a book carries `book-as-published`**: it is only as accessible as its
  publisher made it. Omsett does not write descriptions or invent table headings for a book.
- **Copy protection is never worked round.** A locked book is refused in words that say so.
- **Books lent for testing live in `docs/ebooks`, which git ignores.** They are other people's
  work: never commit one, never quote from one, and print only counts when testing with them.
- **A document conversion keeps what a screen reader relies on, and says what to check.**
  Headings as headings, lists as lists, table headers marked, language and title stated,
  picture descriptions carried (`packages/engines/src/markup/docx-*.ts`, `odt-*.ts`). Every
  document pair carries the `accessibility-check` warning. A change that drops one of these is
  a regression. A written ODT is read back by Omsett's own reader in its tests, to the same page
  the DOCX sample reads to; nothing in CI checks it against the standard itself, so when
  changing the ODT writer also validate a file it writes by hand against OASIS's schema
  (`xmllint --relaxng OpenDocument-v1.3-schema.rng content.xml`, and the same for `styles.xml`,
  `meta.xml`, and the manifest schema for `META-INF/manifest.xml`). Each must validate. Its first
  entry is `mimetype`, stored (`writeZip(…, { stored })`).
- **What a document's author deleted or hid is never carried across**: tracked deletions,
  hidden text, comments, author names; and from a presentation, hidden slides. There is a trap
  for each. Speaker notes are left out too, unless the person converting asks for them, each
  time (`speakerNotes`, off by default, decided 26 November 2026): they then follow their
  slide under the heading "Speaker notes". A hidden slide's notes never come, asked or not. Do
  not turn the choice on by default, and do not remember it between conversions.
- **Binary formats are fuzzed on every run** (`fixtures/fuzz.test.ts`), in a child process with a
  watchdog. A new binary format is picked up from the registry; it needs only its `sample.*`.
  A hang, a wrong result or more than three engine deaths fails the run. Do not raise that
  number to get a format in: find the file that kills the engine and make a trap of it.
- **What a file holds is read by `describeFile`** (`packages/engines/src/details`), in the
  worker, and never throws. It is shown as text. Mark what a conversion removes as `removed`.
- **Every format has a code trap, and every code trap is run to every target**
  (`fixtures/code-traps.test.ts`). A new format gets one in the "code" section of
  `make-traps.py`, with the payload wherever the format holds text. `expectNoCodeRan` runs after
  every trap in both suites; a test of the test fails if a kind of file has no code trap.
- **No word of a document is ever written as Typst markup** (`packages/engines/src/typst/source.ts`).
  Typst's language runs code. Every word from a page is written as a quoted string, an
  argument to a function this file chose, through `quoted`; a link is made only of a web or
  mail address, a picture only of one inside the page. A test takes every quoted string out of
  the program and requires that nothing of the page is left. Do not add a path that writes
  markup, however well escaped.
- **Typst is given the program, the pictures it names, and the typeface, and nothing else.**
  `loadFonts(..., { assets: false })`: without that the library fetches fonts from another
  site. No package registry and no access to files is set. A browser test asserts that writing
  a PDF asks nothing of any other origin.
- **A PDF is finished by adding to it, never by rewriting it** (`typst/finish.ts`). `titleShown`
  appends the catalog again, asking for the title to be shown (`DisplayDocTitle`), with a table
  that points back to Typst's. Without it the PDF scores a grade lower than the document it
  came from. Anything else a checker wants and Typst does not write goes there, the same way.
- **A PDF Omsett writes must be tagged, and is read back to prove it.** `typst.test.ts` gives the
  PDF to Omsett's own reader and requires headings, lists, the table's head and links from the
  tags. In Typst a picture must be set in a `box`: put any other way inside a paragraph it is
  silently left out, tags and all.
- **Letters the PDF's typeface cannot draw are left out by Typst, not shown as boxes.** For
  other scripts there are Noto faces, fetched a piece at a time (`typst/scripts.ts`): the
  engine asks a face's own list which piece draws a letter, and fetches only those. The list
  of faces is in three places that a test holds together: `SCRIPTS`, `SCRIPT_FACES` in
  `prepare-assets.ts`, and the packages in `packages/engines/package.json`. What no face draws
  is counted, named in the result, and a page that is mostly such letters is refused. Do not turn that into a quiet conversion: a blank PDF is worse than a refusal.
- **A PDF's tags are believed only if they describe and cover its text**
  (`packages/engines/src/pdf/read.ts`). Do not loosen that to make a file come out "tagged":
  the fallback exists because real PDFs are tagged for their pictures alone.
- **An engine tells the person what it found by reading the file through `ConvertOutput.note`**,
  which the result card shows. Use it for what could not be known before converting.
- **The data engine writes one thing that is not data: a page** (`writeTablePage`). It is how a
  spreadsheet reaches PDF, DOCX and Markdown. Every cell and every column name is written as
  escaped text; the page is plain enough that the markup engine and Typst need no special case.
  A choice belongs to the step that makes use of it, wherever in the route that step is
  (`defaults` and `runAll` in `useConversionQueue`): a sheet is chosen where a workbook is read,
  speaker notes where a presentation is, so a workbook going to PDF chooses its sheet as one
  going to CSV does.
- **A value written into a line-based format is escaped, always** (`escaped` in
  `packages/engines/src/data/cards.ts`). Anything written as a parameter or an unescaped value
  (a time zone, a repeat rule, a status) is held to a pattern first, and left out if it fails.
- **`file-type` is believed about bytes, not about text.** It calls anything that begins
  `BEGIN:VCARD` a vCard. For text formats Omsett's own sniffing decides.
- **File contents go on the page as text, never as markup**, and never more than
  `app/utils/text-preview.ts` allows. No `v-html` for anything that came out of a file.
- **The tooltip is styled in `main.css` (`.tile-tip`)**, over the component library's own
  classes, which is why those rules carry `!important`. Its colours are tokens.
- **Tailwind owns some class names.** A scoped class called `contents` or `hidden` picks up the
  utility of that name; `contents` made an element vanish from layout.
- **HTML is cleaned on the way in and on the way out** (`packages/engines/src/markup`), with
  rehype-sanitize. Nothing that could run is ever written. Do not add a path that skips it.
- **A package's "browser" build may assume a page.** Engines run in a worker, which has no
  `document`. `decode-named-character-reference` (under the Markdown parser) did; it is aliased
  to its plain build in `nuxt.config.ts`. Node tests cannot catch this; the browser tests do.
- **Data outputs must be recognisable without a name.** Markdown, Fountain and plain text are
  the three formats that cannot be; the tests give their names, and only theirs. The tests identify every output from
  its bytes alone, so what the data engine writes has to read unmistakably as its format.
- **Never rely on a reader running out of stack to refuse a file.** How deep that is differs by
  browser and by operating system; WebKit on Linux read what every other browser refused. State
  the limit and check it (`limitDepth` in the markup engine).
- **Results are kept per file and per format** (`${file}:${format}:${n}`). Converting to
  another format adds; converting to the same one replaces its own results and nothing else.
- **Which sheet of a workbook is converted is such a choice** (`sheet`: `first`, `all`, or a
  position among the sheets shown). The names in the control are read from the file in the
  side worker (`listSheets`); hidden sheets have no position and cannot be asked for.
- **A choice offered to the user is a key in a capability's `defaultOptions`**, and one of the
  names `useConversionQueue` knows (`OFFERED`). The page shows a control for each key the
  selected conversion has; nothing in the page names a format. To offer a choice for some
  sources only, give those sources their own capability entry, as tables have.
- **omsett.com's own settings are in `site.env`**, which only `scripts/publish-static.sh` reads
  (and, for the checker, the development server). `pnpm build`, the tests and the self-host
  image never read it, so they stay a copy of Omsett that counts nothing and checks nothing.
- **What a copy passes on to another server is written by the build** (`forwardingRules` in
  `apps/web/security-headers.ts`, into `headers.nginx`), from `OMSETT_VISITS_SITE` and
  `OMSETT_ACCESSIBILITY_CHECKER`. No forwarding rule is typed by hand, and none takes a key.
- **Counting visits is off unless three things hold** (`visitCounting` in `app/utils/visits.ts`):
  the build names the site (`OMSETT_VISITS_SITE`), the visitor has not turned it off in Settings,
  and the browser has not asked not to be tracked. The self-host image and the tests name none.
  Never proxy or vendor an analytics script to "satisfy" the policy: a red-team review found
  that doing so keeps the policy intact while handing a third party the page.
- **A converted file is named "-converted" unless the person says otherwise** (`DEFAULT_NAMING` in
  `app/utils/naming.ts`). Nothing stored means the default; no words at all is a choice and is
  stored as one. The browser tests ask for plain names in `playwright.config.ts`, so a test
  that states a file's name is about the conversion; the default is tested in `settings.spec.ts`.
- **The accessibility check shows that it is working, never how far.** The checker answers once,
  at the end. Do not draw a bar that fills: it would be made up. The steps that can be told
  apart are the two requests (`onStep` in `useAccessibilityCheck`).
- **Details and the ZIP of results have a worker of their own** (`sideWorker` in
  `useEngines`). One worker does one thing at a time; asked of the converting worker, they
  would wait behind a long conversion, time out, and stop it.
- **The preview before converting is the conversion itself, run quietly** (`makePreview` in
  `useConversionQueue`): one picture, a picture target, under `PREVIEW_MAX_PIXELS`. It never
  fetches an engine: one that is not loaded is offered with its size, and fetched on a press.
  It waits for a conversion and a conversion waits for it, since one worker does one thing at a
  time. It is hidden while converting and once there is a result, so that only one comparison
  is ever on the page; the tests rely on that.
- **The page goes to the result only for a conversion a person asked for** (`arrived`). A
  re-conversion from moving a setting must not move the page. It goes at once, never as a
  glide: a click made while the page is moving misses, in a browser and in the tests.
- **A press on a format's Convert button during a conversion waits its turn** (`running` in
  `useConversionQueue`), and is dropped only if the session ends meanwhile. Do not go back to
  ignoring it: the page gives no sign that a press was lost.
- **"Convert another" ends a session** (`sessions` in `useConversionQueue`). A batch checks
  after every wait whether its session is over, and writes nothing if it is.
- **Word from the worker can arrive late.** A progress event may land after its file is
  finished. Nothing it does may bring a finished file back to "converting".
- **`?slow=800` holds each file before it converts** (localhost only), so tests can see the
  page mid-conversion.
- **Kill a leftover test server after a rebuild.** `pnpm e2e` reuses a server already on its
  port, and one started before `pnpm build` can go on serving the old build's policies.
- **Formats are ranked by their order in `formats/index.ts`.** The first four a file can become
  are shown as large tiles, the rest as a list.
- **Engines must agree on what they leave out.** Both drop metadata, declared as `drops` on the
  capability. If one engine for a pair kept it, what leaks would depend on the browser.
- **Settings in the address bar are for tests and work on localhost only** (`testHook`).
- **Trap files** (`fixtures/_traps/`, listed in `manifest.json`) run in both test suites. A new
  failure mode gets a trap; add it in `fixtures/_tools/make-traps.py`.
- **A conversion keeps the size of the picture, with one exception that the registry states.**
  An icon, a pointer or a Mac icon is written square, at the sizes in its capability's
  `iconSizes` (and, for a Mac icon, under the names in `iconNames`); `writtenSize` (`packages/registry`) says what size comes out, and the tests that
  compare sizes ask it. A second output at another size goes there too, not into a test.
- **A picture is turned upright before its metadata is dropped** (`autoOrient` in the `magick`
  engine). The note of which way is up is metadata; strip it first and a photo taken on its
  side stays on its side. A size reader for such a format gives the size after turning.
- **A raw photograph is developed, not copied.** DNG comes out with ImageMagick's standard
  settings, so its tests compare sizes and nearby colours, never exact pixels against the file.
- **A decoder is shown no more of a file than it needs.** A DICOM scan is walked by Omsett's own
  code (`packages/detect/src/dicom.ts`) and ImageMagick is handed the picture and the elements
  that describe it (`pictureOnly`), never the patient's details, the notes or the lists. The
  elements kept are a fixed list; add to it only a plain value the pixels cannot be drawn
  without. A size is taken from the scan itself, never from a list inside it.
- **Unpacked sound is copied, never worked out** (`packages/engines/src/audio`). WAV, AIFF and
  AU hold the same numbers behind different labels; a conversion turns bytes round, flips the
  sign of a single byte, or unpacks a telephone code by table, and does nothing else. No number
  passes through a fraction on the way. `audio.test.ts` reads every number back and compares
  it; a new layout or format goes into that test. The readers take the start of a file and the
  length of the whole (`readSound(format, head, length)`), so details come from the label alone.
- **A length a sound file gives is compared with the file before anything is set aside for it.**
  What a conversion holds is the file and one copy, never a buffer sized by a header. FLAC is
  the exception that needs a limit instead, because a packed file really can hold far more than
  its size: 1 GB where the label says how much, 256 MB where it does not (`flac.ts`).
- **A FLAC is believed only when all three of its checksums agree** (`unpackFlac`): one on the
  start of each stretch, one on each whole stretch, and the file's own on all the sound. Do not
  hand on sound that failed one, and do not make a check optional to read a file some other
  program accepts. Every number unpacked is also held to the bits the file promised.
- **Omsett's FLAC packer is checked by Omsett's unpacker and by nothing else in CI**, so
  `audio.test.ts` packs every kind of sound a packer finds hard (noise, clicks, the loudest
  and quietest numbers by turns) at every width and reads every number back. When changing the
  packer, also run a file through the reference tool by hand: `flac -t` must accept it. The
  samples in `fixtures/flac` come from that tool and from ffmpeg, never from Omsett.
- **A decoder that forgives is given only what Omsett has walked.** mpg123 plays whatever it can
  find in a damaged MP3 and reports nothing. `readMp3` follows the file from its first stretch
  to its last by the length each gives, and refuses one that stops inside a stretch, counts
  more stretches than it has, changes rate or channels part-way, or holds anything between
  stretches. Only that span is handed to the decoder. Do not loosen the walk to read a file a
  player accepts; a player's job is to make noise, and Omsett's is to hand back the whole sound
  or say why not.
- **Import one thing from `wasm-media-encoders`, through `app/workers/lame.ts`.** The package
  carries LAME and an Ogg encoder inside its own script; imported whole it adds 780 KB that
  never runs, and would start LAME from a copy the app has not verified.
- **The long tail of sound is Omsett's own build of FFmpeg** (`packages/engines/vendor/libav`,
  libav.js, variant `omsett-audio`). What is in it is said by `build/fragments.json` and nothing
  else; rebuild with `build/build.sh` (Docker) and the bytes come out the same, as the table in
  its README records. Nothing GPL goes in, and no AAC or AC-3 encoder: those formats are read
  only. Its readers are told to stop at damage (`err_detect`, on the reader and on each
  decoder), and the engine refuses what FFmpeg would forgive: a file that holds less sound than
  its container says, bytes in an AAC or AC-3 stream that no frame takes, an AC-3 whose last
  frame is short, and a WMA that holds a film. libav.js copies no 64-bit samples out of itself,
  so those stay inside it as pointers until the filter has turned them into a format it can.
  A sample format is named to the filter by its name, never its number: libav.js reads 0
  (unsigned 8-bit) as none given. Surround sound is moved onto Opus's and Apple Lossless's own
  layouts, which are the only ones they take. `ff_filter_multi` frees a frame given to it as a
  pointer; free one yourself only if the filter never took it. Everything else made inside
  libav.js is freed in `finally`, refused or not, because the worker converts again.
- **An Ogg file is walked by Omsett before FFmpeg reads it** (`oggProblem` in
  `audio-libav/ogg.ts`): libav.js's Ogg reader ignores `err_detect` and plays a page whose
  checksum fails, and reads a file cut between pages as a shorter whole. Every page's checksum,
  its place in the count, one stream, and the end mark on the last page. A file with a second
  track or a film is refused, never converted in part. A lossless target is written at the
  sound's own depth or refused (`lossless` in `TARGETS`); never pack 32 bits into 16.
- **FFmpeg 9.0.2 cannot read 32-bit whole-number WavPack with its checks on** (its extra-bits
  check is wrong; `wvunpack -v` accepts the same files). Such a file is refused in its own words.
  Do not turn `crccheck` off for WavPack to read one.
- **A choice of how much sound to leave out is `soundQuality`** (`smaller`, `standard`, `best`),
  a key in the capability's `defaultOptions` like any other choice. The engine maps it to the
  encoder's settings; the page names no format and no bitrate.
- **The time a conversion is given grows with pixels and with bytes** (`conversionBudgetMs`).
  Sound has no pixels; without the bytes a long recording would be stopped half-way.
- **A setting for ImageMagick's writer is data in the registry** (`defines` in a capability's
  `defaultOptions`, as DDS has), held to a pattern by the engine. A format the registry calls
  lossless is sent there and back in `magick/exact.test.ts` and every pixel compared; add a new
  one to that test.
- **ImageMagick forgives some damaged files too.** Of a Photoshop file that stopped halfway it
  returned the half it found. `layoutProblem` (`packages/detect/src/structure.ts`) adds up the
  lengths such a file gives for its own parts, and the `magick` engine refuses what does not fit
  before ImageMagick reads it. When a new format's `truncated` trap converts, write its check
  there; do not change the trap to "succeeds".
- **A picture taken out of a container is checked as if it had been dropped by itself.** The
  `icon` engine hands a Mac icon's PNG on as it found it, so it runs `pngStructureProblem` on
  it first and drops every chunk that is not the picture. The size checked is the one the
  picture states (`readIcns` in `packages/detect`), never the one its entry is named for.
- **libvips forgives damaged files unless told not to.** The engine loads with
  `fail_on: 'error'`. Do not remove it.
- **`mv` onto a link to a directory moves into it.** `scripts/publish-static.sh` uses `mv -T`
  for that reason. macOS and Linux differ here; test deploy scripts on Linux, more than once.
- **Restart `pnpm dev` after editing `nuxt.config.ts` or installing a package.** Nuxt's own
  restart drops the isolation headers Vite sends, and then no worker starts and nothing converts.
  In dev, `?demo` loads and converts the sample, and `?theme=light` or `?theme=dark` sets the theme.
- **A canvas has a size limit**; `maxPixels` on the engine sends larger images to libvips.

## Working agreements

- **Branches and deploys.** There is no staging branch. Changes go to `main`, and the server
  rebuilds the live site from `main` on every push (see `docs/deploy-digitalocean.md`); a deploy
  costs nothing. Use a short-lived branch and a pull request when CI should vouch for a change
  before it is live, which is most of the time.
- **Keep the record current, in the same change.** When a feature is added or behaviour changes:
  - `CHANGELOG.md`, under "Unreleased" (added, changed, fixed, or known). The site's What's new
    page is generated from it, and the paragraph that opens the newest version is the home
    page's "What's new" banner: two or three sentences on what a visitor will notice.
  - The About and Technical details pages (`apps/web/app/pages`). Their figures and tables are
    read from the registry and the repository, so they update themselves; their prose and the
    diagrams in `app/utils/diagrams.ts` do not, and must be edited when the process they
    describe changes.
  - `security/audits.json`, when the change fixes or opens a security finding.
  - `README.md`, before every commit: its generated figures (`pnpm readme:facts`), its feature
    list, and its screenshots where the screen they show has changed.
  - The design doc and this file, wherever they describe what changed.
- **Commits** are small and labeled (`feat(registry): …`, `fix(web): …`, `chore(ci): …`), and
  each builds and passes tests. No `Co-Authored-By` line and no other AI attribution trailer.
- **Decide small things; ask about big ones.** Anything that changes the public shape (the
  contracts in `packages/*/src/types.ts`, the registry schema, tier names, URL structure, the
  security policies, a new dependency): stop and ask, with a recommendation.
- **Never weaken a test to make it pass**, and never report a check you did not run.
- **No placeholder content in the UI.** No tiles for formats that are not registered.
- **`explain` is real copy**, written for a non-technical reader.
- **README:** the og:image is the first thing in the file, with any badges directly under it.
  Every conversion named on that image must be one the app does; `brand/og-source.html` is its
  source, and `brand/og.png`, `brand/og@2x.png` and `apps/web/public/og.png` are rendered from it.
- **Design.** Swiss: one typeface (Helvetica Neue, else Inter), the twelve-column grid in
  `tokens.css`, rules instead of boxes, square corners, no shadows, no second typeface. The one
  exception is `--font-file`, the system's fixed-width typeface, for the contents of a file in
  the side-by-side view and nothing else. Blue is
  the accent; red means something went wrong or cannot be done, and nothing else is red, a kind of file's colour included (`test/colours.test.ts`); green means ready, or new. Tokens live in `tokens.css` only.
- **Tone:** plain, short, no cheerleading.
