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
   settles it; and Markdown and Fountain are any text at all, so only a name can say that a
   file is one of them. A name never makes text of something that is not.
6. **Nothing leaves the origin.** No request to another origin, ever; no request carrying file
   bytes to its own. Enforced by policy, not intention (see below), and asserted in
   `e2e/gate.spec.ts`.
7. **Every engine is tested where it really runs.** Engines whose `runtimes` include `node` run
   the fixtures in Vitest; browser-only engines run them in Playwright.
8. **Accessibility work waits for the final phase.** Until then: no audits, no axe gate, no
   screen reader testing, and no changes made for accessibility's sake. What already exists (the
   real file input, the radio-group picker, the live region) stays as it is; do not remove it and
   do not extend it. The axe and keyboard-order tests in `e2e/gate.spec.ts` are parked behind
   `ACCESSIBILITY_DEFERRED`.
9. **The converter is one screen.** `pages/index.vue` is the whole tool: no steps across pages,
   no modals on the happy path. The information pages (About, Technical details, What's new,
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
- **Security audits** live in `security/audits.json`, newest first. The site's Security page,
  `SECURITY.md`, and the README's Security section are generated from it; run
  `pnpm security:docs` after editing, or a test fails. Never mark a finding fixed without a test.
- **Every conversion has a time limit** (`apps/web/app/utils/limits.ts`); past it the worker is
  terminated. A new engine needs no code for this, but must be safe to kill at any moment.
- **A browser's decoder is never trusted with a file the app has not verified.** The canvas
  engine reads PNG only, after `structureProblem` has passed it. To let the canvas read another
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
  fourth, fonts a fifth, archives a sixth. Spreadsheets are of data's kind, and documents of
  Markdown's and HTML's. Screenplays are a kind of their own. A new category that should convert into an
  existing one must be added there, or its formats will never be listed for it.
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
  refused. Formulas are never worked out and never written; macros and linked files are never
  opened. DOCX and PPTX should be read the same way.
- **A document conversion keeps what a screen reader relies on, and says what to check.**
  Headings as headings, lists as lists, table headers marked, language and title stated,
  picture descriptions carried (`packages/engines/src/markup/docx-*.ts`). Every document pair
  carries the `accessibility-check` warning. A change that drops one of these is a regression.
- **What a document's author deleted or hid is never carried across**: tracked deletions,
  hidden text, comments, author names; and from a presentation, hidden slides and speaker
  notes. There is a trap for each.
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
- **Data outputs must be recognisable without a name.** Markdown and Fountain are the two
  formats that cannot be; the tests give their names, and only theirs. The tests identify every output from
  its bytes alone, so what the data engine writes has to read unmistakably as its format.
- **Never rely on a reader running out of stack to refuse a file.** How deep that is differs by
  browser and by operating system; WebKit on Linux read what every other browser refused. State
  the limit and check it (`limitDepth` in the markup engine).
- **Results are kept per file and per format** (`${file}:${format}:${n}`). Converting to
  another format adds; converting to the same one replaces its own results and nothing else.
- **A choice offered to the user is a key in a capability's `defaultOptions`**, and one of the
  names `useConversionQueue` knows (`OFFERED`). The page shows a control for each key the
  selected conversion has; nothing in the page names a format. To offer a choice for some
  sources only, give those sources their own capability entry, as tables have.
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
  - `README.md`, the design doc, and this file, wherever they describe what changed.
- **Commits** are small and labeled (`feat(registry): …`, `fix(web): …`, `chore(ci): …`), and
  each builds and passes tests. No `Co-Authored-By` line and no other AI attribution trailer.
- **Decide small things; ask about big ones.** Anything that changes the public shape (the
  contracts in `packages/*/src/types.ts`, the registry schema, tier names, URL structure, the
  security policies, a new dependency): stop and ask, with a recommendation.
- **Never weaken a test to make it pass**, and never report a check you did not run.
- **No placeholder content in the UI.** No tiles for formats that are not registered.
- **`explain` is real copy**, written for a non-technical reader.
- **README:** the og:image is the first thing in the file, with any badges directly under it.
- **Design.** Swiss: one typeface (Helvetica Neue, else Inter), the twelve-column grid in
  `tokens.css`, rules instead of boxes, square corners, no shadows, no second typeface. The one
  exception is `--font-file`, the system's fixed-width typeface, for the contents of a file in
  the side-by-side view and nothing else. Blue is
  the accent; red means something went wrong or cannot be done; green means ready, or new. Tokens live in `tokens.css` only.
- **Tone:** plain, short, no cheerleading.
