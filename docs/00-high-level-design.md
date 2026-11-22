# Omsett — High-Level Design

Nov 1, 2026 · Christopher Schweda · revised Nov 22, 2026

## Overview & goals

Omsett is an open-source file converter: drop a file, pick a target format, get the result — with every conversion that can run in the browser running there, so files never leave the device. It ships as a static site at omsett.com and, later, as a downloadable desktop app built from the same code.

**The name.** *Omsett* is Norwegian Nynorsk: the past participle and imperative of *omsetja* / *omsette*, "to translate" — literally "to set over." The broader sense "to convert, to turn into" is the same verb in Bokmål (*omsette*, as in converting currency or *omsetning*, turnover). So *omsett* reads as "translated" or "translate!", and by extension "converted." (Verified against Wiktionary's Nynorsk entries; the gloss order on the og:image is "to translate; to convert" for that reason.) A file converter named in a language most users don't speak explains itself to anyone who looks it up and reads as a brand to everyone else. The meaning is stated once in the UI (footer and About) and on the og:image, never as a pun.

**Who it's for.** Writers, editors, and web people who need one file in another format right now and don't want to install anything, create an account, or trust a random upload site. The same crowd Squish already serves — the converter is the natural next tool for that audience.

**What "useful, not hard to use" means here:**

- One screen. Drop zone, format picker, download button. No settings page on the happy path.
- The format picker only ever shows targets that are actually possible for the dropped file.
- Batch by default: drop ten files, convert them all, download one ZIP.
- Works offline after first load (PWA), so the "downloadable" promise is met before any desktop build exists.
- Honest about limits: when a conversion needs native engines (video, LibreOffice-class office work) the UI says "Get the desktop app" before the user commits.

**Non-goals for v1:**

- Video (deferred to Phase 4; common codecs run in the browser via WebCodecs, the long tail on the desktop app).
- General-purpose editing. The only transforms are the ones a preset needs (crop to a ratio, resize, trim a clip); no freeform crop, no page reordering, no filters.
- Accounts, history, or cloud storage. Nothing is stored anywhere.
- Pixel-perfect office fidelity. Omsett converts documents; it is not LibreOffice.

**Success looks like:** a non-technical colleague converts a HEIC photo to JPG, a WAV to MP3, and a Markdown file to DOCX in under a minute each, without asking how.

## Reference points

Three existing tools define the lane: [vert.sh](https://github.com/VERT-sh/VERT) proves the browser-WASM architecture, [filee.sh](https://filee.sh/) sets the bar for format breadth on the desktop, and [squish.icjia.app](https://squish.icjia.app) proves the UI approach already works for this audience.

|  | vert.sh | filee.sh | Squish | Omsett takes |
| --- | --- | --- | --- | --- |
| Scope | 250+ formats: image, audio, document, video | 255 formats in 18 categories incl. CAD, 3D, fonts, geospatial, subtitles | Image compression only (PNG, JPG, WebP) | filee's breadth as the long-term target list, Squish's one-screen focus |
| Where it runs | Browser WASM; video on self-hostable daemon `vertd` | Desktop only (Windows/Linux, macOS preview, .NET); optional engines downloaded on demand | Browser only | Browser first; the desktop app for everything native; an optional self-hosted server for teams and phones |
| UI | Drop zone → per-file format dropdowns | Ctrl-drag a file → ring of compatible formats appears at the cursor → drop onto one; keyboard equivalent | Drop zone → quality slider → before/after preview | Drop zone → one big visual target picker → convert all |
| Extras | — | Multi-step routes, watch folders, CLI, presets, crop/rotate/merge tools | Sample image button | Presets (OpenGraph etc.), shareable preset links, fidelity warnings, metadata strip |
| Stack | SvelteKit, TypeScript, Tailwind, Bun | .NET desktop | Static site | Nuxt 4, Nuxt UI, TypeScript, pnpm |
| License | AGPL-3.0 | MIT | ICJIA GitHub | MIT |

**Borrow from vert.sh:** the WASM-first architecture, lazy-loading each engine only when a file of that type is dropped, and `mediabunny` for in-browser video. Don't borrow its video server: Omsett's answer to "the browser can't do this" is the desktop app, not a GPU box.

**Borrow from Squish:** the single-purpose screen, the "Load sample file" button for zero-friction trial, the explicit "your files never leave your device" promise in the UI, and the dark minimal layout.

**Borrow from filee.sh:** the format list itself (it's the most complete public inventory of what a converter can reasonably do), the optional-engine model where heavy engines are fetched only when a user needs them, multi-step routing (A→B→C when no direct A→C exists), and the keyboard path for choosing a target. Skip the Ctrl-drag ring: it's clever on a desktop, impossible on a phone, and hard to discover.

**Filee's source is MIT ([KnifeLemon/Filee](https://github.com/KnifeLemon/Filee), C# on .NET 10 with Avalonia), so its data and design can be ported outright even though none of its code is reusable in a TypeScript stack.** Worth lifting directly, with attribution in `THIRD-PARTY-NOTICES.md`:

- **The format matrix as data.** Filee's from/to tables by category are the seed for `packages/registry`; transcribe them rather than rediscovering which 244 formats matter.
- **`RoutePlanner`: Dijkstra over converter edges, capped at 3 hops, engine priority breaks ties.** Same algorithm for Omsett's router, with fidelity-loss added as the edge weight so lossless paths win.
- **`engines.json`** pinning official download URLs for optional engines, and the "downloaded only when needed, removed on uninstall" rule. Omsett's desktop app does the same for ffmpeg, LibreOffice, Calibre, Ghostscript, Pandoc.
- **`presets.json` + `PresetAvailability`** (a preset knows whether it can run on the selected files and shows the reason when it can't) maps one-to-one onto the dimmed picker tiles with a reason.
- **`ProfileSelector`** logic for mixed selections: pick the first profile whose extensions cover every dropped file. That's exactly the rule for which tiles light up when a user drops a PNG and a DOCX together.
- **Architecture split**: `FormatRegistry` / `IConverter` / `JobQueue` / `RoutePlanner` is the same core-vs-shell separation as `packages/registry` + `packages/engines` + the worker queue; `docs/ADDING-A-CONVERTER.md` is a good model for Omsett's contributor doc.

What not to port: the donut gesture UI (desktop-only), the Avalonia shell, and the HWP engines (Phase 5 at most).

**VERT's source, read directly ([VERT-sh/VERT](https://github.com/VERT-sh/VERT), AGPL-3.0, SvelteKit).** Its engine list is more interesting than its README admits, and its gaps are exactly where Omsett's differentiators sit. Because VERT is AGPL and Omsett is MIT, VERT is a source of ideas only: which engines exist and where the gaps are. No VERT code, data file, or schema is copied or transcribed into this repo (see Licensing).

What VERT actually runs, per `src/lib/converters`: `wasm-vips` and `@imagemagick/magick-wasm` (with x64/x86 variant detection) for images; `@neplex/vectorizer` for raster → SVG; `ffmpeg.wasm` (multi-thread when `crossOriginIsolated`) for audio; **`mediabunny`** for in-browser video via WebCodecs; `spessasynth` for MIDI and SoundFont; `pandoc-wasm` for documents; `dicom.ts`; `vertd` (a GPU box the project pays for) for the rest of video. A per-converter `SettingDefinition` schema drives the settings UI; a `FORMAT_ENGINES` priority list picks one engine per format (no multi-hop routing). i18n via Paraglide, Plausible analytics with opt-out, Stripe donations.

*Take from VERT:*

- **`mediabunny` for Tier 2 video.** WebCodecs transcodes MP4/WebM/MKV/MOV with H.264/VP9/AV1 at near-native speed in the browser, no WASM download. This moves common video *onto the public site*; the desktop app remains for exotic codecs, long files, and anything WebCodecs can't decode. Big correction to this doc's earlier "video needs native" line.
- **`@neplex/vectorizer`** for PNG → SVG tracing (better than `imagetracerjs`).
- **`spessasynth`** for MIDI → WAV/MP3 — cheap, delightful, and the kind of thing a writer with an old `.mid` will remember you for.
- The *idea* of a per-converter settings schema driving the Adjust panel. Omsett designs its own; VERT's is not copied.
- The *idea* that formats differ in what they can carry (transparency, metadata). Omsett records this as per-format traits written from the format specifications, and derives fidelity warnings from them (see Project structure).

*Gaps VERT leaves (confirmed in source, not guessed):* 13 ARIA attributes in the whole app and no live region, so no screen-reader path through a conversion; no presets or purpose-driven targets; no fidelity warnings shown to the user (the data exists, it only gates settings); single-hop engine selection, no routing; document tier is Pandoc only, so no PDF input, no DOCX → PDF, no spreadsheets, archives, fonts, subtitles, or Calibre ebook targets; no CLI, no desktop app, no PWA install path; metadata is a keep/strip toggle with no inspector; analytics and a donation flow on a privacy tool. Each of those is a line in the Differentiators table.

**Do differently from both:** a target-format picker that is one large, visual control rather than a per-file dropdown; grouping targets by what the user wants ("smaller", "for the web", "for Word") rather than only by extension; and first-class accessibility, which neither reference tool treats as a feature.

## Core architecture decision

**Decision: browser-side WASM for everything that can run there, and the desktop app — the same code in an Electron shell with native engines — for everything that can't. No server is required for any conversion.** The front end is a fully static Nuxt 4 build on Netlify. A small self-hostable service, `omsettd`, exists late in the roadmap for the one audience the desktop app can't reach: people who can't install anything (phones, Chromebooks, locked-down machines) and teams that want one shared converter. You do not run a public one.

**Why not serverless.** You've ruled it out, and the constraints agree: Netlify Functions cap at 10–26 s and \~50 MB bundles, which fails on ffmpeg, LibreOffice, and any file over a few MB. Static hosting plus WASM has none of those limits and costs nothing per conversion.

**Why not server-only.** Uploading every file to a server makes Omsett just another upload site: slower, a privacy liability, a bandwidth bill, and a single point of failure. The browser already has the compute.

**What runs where:**

| Tier | Runs | Covers | Why |
| --- | --- | --- | --- |
| 1 — Browser WASM | Netlify static, in the user's tab | Images, audio, text/markup, data, ebooks, fonts, archives, subtitles, most document directions | Fast, private, free, works offline, no server to keep up |
| 2 — Browser native APIs | Same | Image decode/encode via Canvas and `OffscreenCanvas`, WebCodecs video transcoding via mediabunny (MP4, WebM, MKV, MOV) | Zero download cost; fallback to WASM when the browser lacks a codec |
| 3 — Native engines | The desktop app on the user's machine. Optionally a self-hosted `omsettd` (Docker) that a user points the web app at | Video codecs WebCodecs can't handle (ffmpeg), LibreOffice-class office fidelity, Calibre ebook targets, anything over the browser's memory ceiling (\~2 GB) | Some jobs need real CPU, native binaries, or hours of runtime — the user's own machine has all three and costs you nothing |

**Rules that keep this honest:**

1. Every conversion has a tier in the format registry. In code there are two: `browser` (Tiers 1 and 2 above) and `native` (Tier 3). The UI shows one of three badges before the user clicks Convert: "on your device", "needs the desktop app", or "via your server" (only on a self-hosted copy of the web app that has an omsettd behind it).
2. The web app treats a server as optional and absent by default. omsett.com has no server and no way to be pointed at one: its Content-Security-Policy is `connect-src 'self'`, on the page and on every worker, so nothing in it can send data to any other origin, which is what makes the privacy promise checkable rather than merely stated. A server exists only behind the self-hosted `omsett-web` image, where Caddy proxies `/api/*` to omsettd on the same origin.
3. On the public site Tier 3 targets are never hidden and never broken: they show as "Get the desktop app". If a self-hosted copy's omsettd is unreachable, the badge falls back to the same. The site stays fully functional as a Tier 1/2 tool.
4. omsettd never stores files. Input is streamed in, output streamed back, temp files deleted on completion or after 10 minutes.
5. The desktop app (Electron) collapses the tiers: it ships the same web app plus a bundled ffmpeg, and can shell out to LibreOffice, Calibre, Ghostscript and Pandoc if present, so Tier 3 runs on the user's own machine with no server at all.

**Does the server do anything the desktop app can't?** Only one thing: serve native conversions to people who cannot install software. The desktop app covers every format, costs nothing per conversion, and never touches your bandwidth, so it is the primary home for Tier 3 and the public site simply says "Get the desktop app (free)" on native-only tiles.

- **omsett.com (public)** offers Tiers 1 and 2 — everything the browser can do, which is most of the matrix. There is no public server behind it.
- **The desktop app** bundles or installs the native engines and runs Tier 3 locally. This is the full suite.
- **omsettd (self-host only, Phase 4)** is a Docker image for a homelab, a newsroom, or an ICJIA-internal box, so that phones and locked-down machines on that network get the full suite through the browser. Your droplet is one place you *could* run a private instance; nothing in the plan requires it.

This ordering also decides the roadmap: the desktop app arrives before video, so video launches with a home that costs nothing to run, and the server is last because it serves the smallest audience.

**Browser ceilings to design around:** WASM memory is 4 GB max and 2 GB in practice; a single-threaded ffmpeg.wasm is 10–20× slower than native; `SharedArrayBuffer` (needed for multi-threaded WASM) requires `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy` headers, which Netlify's `_headers` file can set. Those headers also block some third-party embeds, which is fine for a single-purpose tool.

## Deployment topology

**Netlify serves the site; GitHub Releases serve the desktop app; nothing else is required.** The DigitalOcean droplet is not part of the plan. It stays available as one place you could run a private `omsettd` for yourself or ICJIA, using the same Docker image a homelab user gets.

**Why no server at all for the public product?** Every conversion the browser can't do, the desktop app can, on the user's own CPU, with no upload and no bill. A public server would add latency, a privacy liability, and bandwidth cost while serving only people who can't install software — and those people are better served by a self-hosted instance on their own network, where video and large files aren't your problem. Netlify's CDN is also simply the right place for a static site and 10–35 MB WASM engines; a single droplet behind Caddy is not.

**What goes where:**

| Piece | Lives | Deploys via | Notes |
| --- | --- | --- | --- |
| `omsett.com` — Nuxt 4 static site + WASM engines + PWA | Netlify Pro | Feature PRs merge into a long-lived `staging` branch (a free branch deploy); `staging` merges into `main` only on an explicit release, because each production build costs 15 Netlify credits | The page's CSP is a `<meta>` tag in the HTML; `_headers` carries COOP/COEP, the worker CSP on worker scripts, and a long cache on the `.wasm` by content hash |
| Desktop app (full suite) | GitHub Releases | electron-builder in GitHub Actions (macOS signed + notarized, Windows signed, Linux AppImage/deb) | Same Nuxt build inside an Electron shell (as Drafter); ffmpeg bundled, other engines installed on first use; auto-update via electron-updater |
| CLI `npx omsett` | npm | GitHub Actions on tag | Shares the registry; Tier 1 via WASM in Node, Tier 3 by shelling out to local binaries |
| `omsettd` (self-host only, Phase 4) | Wherever the user runs Docker: homelab, office box, or your droplet if you want a private one | `ghcr.io/cschweda/omsettd` image + `docker-compose.yml` | Never a public endpoint you operate |

**If you ever run a private omsettd on the droplet,** reuse the [file-accessibility-audit](https://github.com/ICJIA/file-accessibility-audit) deploy pattern as-is: its `rebuild.sh` (timestamped logs, pre-pull SHA, re-exec on changed HEAD, `pnpm install --frozen-lockfile`, `pm2 restart --update-env`, non-fatal smoke checks) and `ecosystem.config.cjs` are already the right shape for a Node service on a Forge box. Or skip PM2 and run the Docker image there. Either way it's your private instance, not infrastructure the product depends on.

**Self-hosting with Docker (homelab path).** This is how omsettd ships, and the only way: two images published to GHCR on every tagged release, plus a `docker-compose.yml` at the repo root so a homelab user gets the whole product — video included, for every phone and laptop on their network — with one command:

| Image | Contents | Size target |
| --- | --- | --- |
| `ghcr.io/cschweda/omsett-web` | The static Nuxt build served by Caddy with the same headers as Netlify baked in; proxies `/api/*` to omsettd when `OMSETT_SERVER` is set | \~60 MB |
| `ghcr.io/cschweda/omsettd` | Node 24 + omsettd + ffmpeg, LibreOffice headless, Calibre, Ghostscript, Pandoc, qpdf, veraPDF | \~1.5 GB (Debian slim; LibreOffice is most of it). A `-lite` tag without video/office engines for people who don't need video or office engines |

```yaml
# docker-compose.yml (homelab default: everything on, big files allowed, no quota)
services:
  web:
    image: ghcr.io/cschweda/omsett-web:latest
    ports: ["8080:8080"]                # for LAN use, publish 443 and set a hostname below
    environment:
      OMSETT_SITE_ADDRESS: ":8080"      # Caddy's site address; a hostname here turns on HTTPS
      OMSETT_SERVER: http://omsettd:4310   # Caddy proxies /api/* here; unset means no server
    read_only: true
    cap_drop: [ALL]
    tmpfs: ["/data", "/config"]         # Caddy's state; nothing else is writable
  omsettd:
    image: ghcr.io/cschweda/omsettd:latest
    expose: ["4310"]                    # reached only through web's /api proxy
    environment:
      OMSETT_MAX_BYTES: 2147483648      # 2 GB; an office instance might set 104857600
      OMSETT_ENGINES: ffmpeg,soffice,ebook-convert,gs,pandoc   # drop any you don't want exposed
      OMSETT_DAILY_QUOTA: 0             # conversions per IP per day; 0 = unlimited
    tmpfs: ["/var/tmp/omsett"]
    read_only: true
    cap_drop: [ALL]
```

`/health` reports the effective `engines` and `maxBytes`, and the web app reads them (as same-origin `/api/health`) to decide which tiles switch from "needs the desktop app" to "via your server". The `OMSETT_MAX_BYTES`, `OMSETT_ENGINES`, and `OMSETT_DAILY_QUOTA` knobs exist so an office or shared instance can be made conservative; a homelab leaves them wide open.

**The web image and omsettd share one origin.** The browser only ever talks to the address it loaded the page from; Caddy forwards `/api/*` to omsettd inside the Docker network. That removes CORS, removes any field for typing a server URL, and lets the self-hosted copy keep the same `connect-src 'self'` policy as omsett.com.

**HTTPS is required for anything but `localhost`.** Browsers give `SharedArrayBuffer`, service workers, and WebCodecs only to secure contexts, so a phone opening `http://192.168.1.50:8080` gets a crippled app: no multi-threaded WASM, no offline, no in-browser video. `http://localhost:8080` on the machine running Docker is exempt, which is why the default compose file works for a first try. To serve a network, set `OMSETT_SITE_ADDRESS` to a hostname and give Caddy a certificate one of three ways: a real domain with Caddy's automatic certificates (a DNS challenge keeps it off the public internet), Caddy's internal CA with its root certificate installed on each device, or an existing TLS-terminating proxy or Tailscale in front. Over plain HTTP the app says so in one line and offers what still works (the Canvas path and server-side conversions).

**Phase 0 needs no server.** The web app ships with a `useServerHealth` composable that reads `/config.json`, probes same-origin `/api/health` only when that file says a server exists, and treats "absent" as the normal state. That is the entire server-side footprint until Phase 4, when the `omsettd` image is built against a contract the web app already understands.

**omsettd contract (Phase 4; the web app's useServerHealth targets this from Phase 0):**

- `GET /health` → `{ ok, version, engines: ["ffmpeg", "soffice", …], maxBytes }`. Engine names are the binary names, the same ones `OMSETT_ENGINES` takes: `ffmpeg`, `soffice`, `ebook-convert`, `gs`, `pandoc`
- `POST /convert?to=mp4` → streams the file in, returns a job id
- `GET /jobs/:id` → progress via Server-Sent Events
- `GET /jobs/:id/result` → streams the output once; file deleted after download or 10 minutes
- No auth in v1 beyond optional rate limiting by IP (`OMSETT_DAILY_QUOTA`) and the per-file cap (`OMSETT_MAX_BYTES`; 2 GB in the homelab compose file). omsettd is reached only through the web image's same-origin `/api` proxy or from the CLI; it never trusts the client and never stores anything.

## UI / UX

**One screen, three moves: drop, pick, download.** Dark by default, big type, big targets, and nothing on the page that isn't one of those three moves. The "infographic" feel comes from making the format picker itself the visual centerpiece rather than from decoration.

**The flow:**

1. **Drop.** A full-viewport drop zone (also click-to-browse, paste from clipboard, and "Try a sample file"). Accepts many files at once. Each file appears as a card: icon, name, size, detected format, and a thumbnail or waveform where cheap to produce.
2. **Pick.** Below the files, the target picker: a grid of large tiles, one per possible output, grouped by category (Image · Document · Audio · Data · …) and then by intent ("Smaller", "For the web", "For Word", "For Kindle"). Only targets valid for every dropped file are enabled; others are dimmed with a one-line reason on hover/focus. Each tile shows a tier badge: "on your device"; "needs the desktop app" (video, office fidelity, large files); or, only on a self-hosted copy with an omsettd behind it, "via your server".
3. **Convert.** One big button. Per-file progress bars; total progress in the tab title so the user can switch tabs. Output appears as new cards with a Download button each, plus "Download all as ZIP" when there's more than one.

**Presets — the OpenGraph case and friends.** A preset is a named target that is more than an extension: it fixes dimensions, format, quality, and sometimes produces several files. Presets live in the same picker under their own category, "For a purpose":

| Preset | Produces | Notes |
| --- | --- | --- |
| OpenGraph image | 1200×630 JPG (quality 80) + 1200×630 WebP + `og-image` meta snippet to copy | Smart-crop to 1.91:1 with a draggable focal point; warns if the result is over 300 KB (Facebook/LinkedIn) |
| Twitter/X card | 1200×675 (16:9) + 1200×1200 (square) | Same focal-point crop |
| Favicon pack | `favicon.ico` (16/32/48), `apple-touch-icon.png` 180, `icon-192.png`, `icon-512.png`, `site.webmanifest`, `<link>` snippet | From any square-ish image or SVG |
| Responsive image set | 480/768/1024/1600 widths as WebP + AVIF + JPG fallback, plus a `<picture>`/`srcset` snippet | The Squish use case, generalized |
| Email-safe image | Max 600 px wide JPG, sRGB, under 200 KB | For Outlook-bound newsletters |
| Print PDF | PDF/A-2b from DOCX/ODT/MD/HTML | Desktop app (or omsettd). A browser path exists only if the Phase 2 Typst spike holds, and then with a fidelity warning |
| Accessible PDF check | Desktop app: runs veraPDF locally and shows the grade. Web: a link that opens file-accessibility-audit in a new tab, where the user uploads the file themselves; Omsett sends nothing | Links the two tools; see Differentiators |

**Fidelity warnings before Convert.** The picker knows what each conversion loses and says so in one line on the tile before the user commits: "Transparency will be flattened to white", "Animation will be dropped (first frame kept)", "Comments and tracked changes will be lost", "Lossy → lossy: quality can't improve." This is cheap to build (each format lists what it can carry, a warning is derived wherever the source carries something the target can't, and a few pair-specific overrides cover the rest) and no other converter does it.

**Options, kept out of the way.** A single "Adjust" disclosure per conversion exposes the two or three settings that matter for that pair (quality, dimensions, sample rate, page range). Defaults are chosen so most users never open it. Squish's before/after slider appears for image→image conversions.

**Nuxt UI mapping.** `UFileUpload`-style drop zone (custom), `UCard` for file and result cards, `UButtonGroup`/`URadioGroup` rendered as large tiles for the picker, `UProgress`, `UBadge` for tier and format labels, `UTooltip` for dimmed-tile reasons, `UCollapsible` for Adjust, `UToast` for completion. Dark mode via Nuxt UI's `color-mode` with dark as default and a toggle in the footer.

**Look.** Near-black background (`#0d0d0d`, matching Squish), one accent color per category so the picker reads as a color-coded chart, format extensions set large in a monospace face, generous spacing. No illustrations, no hero copy. The tagline is the whole pitch: *"Drop a file. Pick a format. Nothing leaves your device."*

**Mobile.** Same screen; the picker becomes a horizontally scrolling category strip with a bottom-sheet tile grid. On Android and desktop Chromium the share sheet can send a file straight into Omsett via the PWA `share_target`; iOS has no `share_target`, so iPhone users open the PWA and choose the file.

## Brand & og:image

**Omsett is Swiss in structure but not in costume: a 12-column grid, one accent, asymmetric blocks, and a wordmark in a grotesk that is deliberately not Helvetica.** That last choice keeps it visually separate from Fotobogen, which owns the Helvetica-and-hairlines look in your portfolio.

| Element | Omsett | Why / how it differs from Fotobogen |
| --- | --- | --- |
| Wordmark | `omsett.` in Space Grotesk Bold, lowercase, tracking −5.5%, with the full stop in the accent color | Space Grotesk has a rounder, slightly technical personality; the accent period reads as "done" and as a file-extension dot |
| Accent | **Omsett blue `#3b6cff`** on `#0d0d0d` | A single cool, saturated blue; a nod to the Norwegian name without flags or fjords. Fotobogen keeps the classic Swiss red/black/white lane |
| Type system | Space Grotesk for display and UI labels; JetBrains Mono for anything that is a format, extension, path, or number; Inter as the body fallback | Mono for extensions makes the picker read as data; Fotobogen uses one Helvetica-like family throughout |
| Motif | The arrow `→`: between extensions, as a block-scale glyph, as the Convert button icon | Conversion is the whole product; the arrow is the only picture it needs |
| Grid | 12 columns, 48 px margins, 24 px gutters, hairlines at `#2a2a28` | Same discipline as Fotobogen, different voice |
| Light mode | Inverted: `#f4f4f2` ground, ink `#0d0d0d`, the same blue | The blue is chosen to pass 4.5:1 as text on both grounds |

**og:image (1200×630).** Left two-thirds: kicker in mono caps ("OPEN SOURCE · FREE · ACCESSIBLE · RUNS IN YOUR BROWSER" — the four promises, with accessibility named as a feature on the image itself), the wordmark at 216 px, a mono line beneath it giving the name's meaning ("omsett · Norwegian — to translate; to convert", with "Norwegian" in the accent), and the tagline "Drop a file. Pick a format. / Nothing leaves your device." Right third: a solid blue block carrying four mono pairs (`heic → jpg`, `wav → mp3`, `docx → pdf`, `png → webp`), a 300 px black arrow, and `omsett.com`. Delivered as `omsett-og.png` (1200×630), a 2× version, and the HTML source that rendered them, so the same file is the first fixture for Omsett's own OpenGraph preset: the preset's job is to produce exactly this shape from any image.

**Where it goes.** `apps/web/public/og.png`; `<meta property="og:image" content="https://omsett.com/og.png">` plus `og:image:width/height`, `twitter:card=summary_large_image`, and a `theme-color` of `#0d0d0d`. The favicon pack is generated from the wordmark's accent-dot on `#0d0d0d` by the favicon preset itself — Omsett should be the first site to use its own presets.

## What Omsett does that vert and filee don't

**The gap both tools leave is the same: they convert extensions, not outcomes.** Neither knows *why* you want the file, and neither tells you what you'll lose. Those two ideas, plus your accessibility background, produce a feature set nobody else in this category has.

| Feature | What it is | Why neither competitor has it | Effort |
| --- | --- | --- | --- |
| **Purpose presets** | OpenGraph, favicon pack, responsive set, email-safe, Kindle, print PDF — targets defined by use, not extension | Both pickers are flat extension lists | Low: a preset is a registry entry with fixed options and a post-step |
| **Fidelity warnings** | One line per conversion saying what gets lost, shown before Convert | Nobody annotates the conversion graph | Low: traits per format, warnings derived |
| **Shareable preset links** | `omsett.com/#to=og-image&q=80` opens the site pre-set; a web lead sends one link and the whole team's images come out right | Both are app-centric; filee has presets but they're local | Low: URL state |
| **Metadata inspector & strip** | Show EXIF/GPS/author/XMP before converting; strip on by default for images headed to the web | vert strips silently; filee doesn't surface it | Low–medium: `exifr` in browser |
| **Accessibility pass-through** | DOCX→PDF keeps heading structure and alt text (tagged PDF); after any →PDF conversion, offer an accessibility check (local in the desktop app, a link out to file-accessibility-audit on the web) | No converter treats accessibility as a feature; this is your lane and ICJIA's | Medium: tagged PDF needs the LibreOffice tier; a browser route through Typst is a Phase 2 spike |
| **Smart crop with focal point** | For any resize preset, auto-detect the subject (face/saliency) and let the user drag the focal point | Both do naive center crops or none | Medium: `smartcrop.js` in browser |
| **Multi-step routing with the route shown** | When no direct A→C exists, Omsett finds A→B→C and shows the path and its cumulative losses | filee has a RoutePlanner but hides the route; neither shows the loss | Medium: Dijkstra over the registry with loss weights |
| **Install-free, account-free PWA** | Install from the browser; works offline; share-sheet target on Android | vert is web-only without install; filee is desktop-only | Low: Nuxt PWA module |
| **Same engine, three shells** | Web, `npx omsett`, desktop — one registry, one set of tests | vert has no CLI; filee has no web | Medium: monorepo discipline |
| **Explain the format** | A one-paragraph "what is AVIF / when to use it" per tile, written for writers and web people | Both assume you already know | Low: content |

**The pitch in one line:** *vert converts files, filee converts everything, Omsett converts files for a reason and tells you the truth about it.*

**Deliberately not chasing:** filee's 18 categories (CAD, 3D, geospatial, HWP) in v1. Those are real but serve a different user; they can arrive later as plugins to the same registry without touching the UI.

## Format matrix

**Target: \~200 formats browser-side by the end of Phase 2, filee's full 255 once the desktop app ships.** Tiers: **B** = browser (WASM or native API), **S** = native engines (the desktop app, or a self-hosted omsettd), **B/S** = browser for normal files, native for large or high-fidelity jobs. "Both" means read and write. Within a category, any "Both" input converts to any "Both" output; cross-category edges are listed under *Cross-category routes*.

### Images

| Direction | Formats | Engine | Tier |
| --- | --- | --- | --- |
| Both | JPG, PNG, WebP, AVIF, GIF, BMP, TIFF, JPEG XL, QOI, APNG, ICO, ICNS | Squoosh codecs (`@jsquash/*`), `wasm-vips`, Canvas | B |
| Both | TGA, PPM/PGM/PBM/PAM/PFM, PCX, XPM, XBM, WBMP, DDS, SGI, Sun Raster, MIFF, MNG, JPEG 2000 | `magick-wasm` (ImageMagick) | B |
| Input only | HEIC/HEIF | `libheif-js` decode | B. No HEIC output in v1: HEVC encoding carries patent licensing (see Licensing) |
| Input only | PSD, PSB, XCF, OpenEXR, Radiance HDR, DICOM, Photo CD, JPEG XR | `magick-wasm`, `wasm-vips` | B |
| Input only | Camera RAW: DNG, CR2, CR3, CRW, NEF, NRW, ARW, SRF, SR2, ORF, RW2, RAF, PEF, SRW, X3F, 3FR, ERF, MOS, MRW, DCR, KDC, IIQ, FFF, MEF, RWL | `libraw-wasm` | B/S (large files to the desktop app) |
| Input only | Live Photo (LIVP) | unzip → HEIC + MOV | B |
| Presets | OpenGraph, Twitter card, favicon pack, responsive set, email-safe | `wasm-vips` resize + `smartcrop.js` | B |

### Vector graphics

| Direction | Formats | Engine | Tier |
| --- | --- | --- | --- |
| Both | SVG, SVGZ | native + `fflate` | B |
| Both | EPS, PS | Ghostscript | S. No Ghostscript WASM on the public site: it is AGPL (see Licensing) |
| Both | EMF, WMF, ODG | LibreOffice | S |
| Input only | AI (PDF-based), PDF→SVG | `pdfjs-dist` + SVG renderer | B |
| Input only | CDR, CGM, VSD, VSDX, FODG | LibreOffice | S |
| Raster→vector | PNG/JPG→SVG (traced) | `@neplex/vectorizer` | B |
| Vector→raster | SVG→PNG/JPG/WebP/AVIF/PDF at any size | Canvas + codecs | B |

### PDF

| Direction | Formats | Engine | Tier |
| --- | --- | --- | --- |
| PDF → images | PNG, JPG, WebP, TIFF per page or contact sheet | `pdfjs-dist` | B |
| PDF → text/markup | TXT, Markdown, HTML | `pdfjs-dist` text layer; `pdftotext` for layout fidelity | B / S |
| PDF → DOCX | DOCX | LibreOffice | S |
| → PDF | from images, SVG, HTML, MD, TXT, DOCX, ODT, XLSX, PPTX, EPUB | `pdf-lib` for images and SVG (B); LibreOffice for office files (S); text and markup in the browser only if the Phase 2 Typst spike holds, otherwise S | B / S |
| PDF → PDF | PDF/A-2b, compressed, linearized, merged pages | `pdf-lib` (merge, page ops), Ghostscript or qpdf (compress, PDF/A) | B / S |
| Check | Accessibility grade | veraPDF | Local in the desktop app; on the web, a link out to file-accessibility-audit |

### Documents

| Direction | Formats | Engine | Tier |
| --- | --- | --- | --- |
| Both | DOCX, ODT, Markdown, HTML, TXT, RTF, EPUB | `pandoc-wasm` (Pandoc in the browser) | B |
| Both | FODT, OTT | LibreOffice | S |
| Input only | DOCM, DOTX, DOTM (unzip as DOCX) | `pandoc-wasm` | B |
| Input only | DOC, DOT, WPS, WPD, LWP, ABW, Pages, SDW, ClarisWorks, MacWrite, T602, Pocket Word, PUB, OFD | LibreOffice | S |
| Both | EML, MSG → HTML/PDF/TXT | `postal-mime`, `msg-reader` | B |
| Fidelity path | DOCX→PDF with tagged structure | LibreOffice `--convert-to pdf:writer_pdf_Export:{"UseTaggedPDF":true}` | S |

### Spreadsheets

| Direction | Formats | Engine | Tier |
| --- | --- | --- | --- |
| Both | XLSX, XLS, CSV, TSV, ODS, HTML table, JSON, Markdown table | SheetJS | B |
| Input only | XLSM, XLTX, XLT, Numbers, FODS, OTS, ETS, DCF | SheetJS (Numbers) / LibreOffice (rest) | B / S |
| → PDF | any spreadsheet | LibreOffice | S |

### Presentations

| Direction | Formats | Engine | Tier |
| --- | --- | --- | --- |
| Output | PPTX from Markdown | `pandoc-wasm` or Marp | B |
| Input | PPTX, PPTM, POTX, POTM, PPSX → PDF, images per slide, Markdown outline | `pptx` unzip for outline (B); LibreOffice for PDF/images (S) | B / S |
| Both | ODP, OTP; input PPT, POT, FODP, Keynote, DPS, SDA | LibreOffice | S |

### Text & markup

| Direction | Formats | Engine | Tier |
| --- | --- | --- | --- |
| Both | Markdown, HTML, TXT, reStructuredText, LaTeX, Org, AsciiDoc, Typst, MediaWiki, DocBook, Jupyter (ipynb), Textile, man page, OPML, FB2, TEI | `pandoc-wasm` | B |
| Input only | MHTML; any source file read as text | native | B |
| Preset | Markdown → self-contained HTML with inlined CSS | `pandoc-wasm` + template | B |

### Data

| Direction | Formats | Engine | Tier |
| --- | --- | --- | --- |
| Both | JSON, JSON Lines, YAML, TOML, XML, CSV, TSV, XLSX, vCard, iCal, INI, Properties, NDJSON | `js-yaml`, `smol-toml`, `fast-xml-parser`, `papaparse`, SheetJS | B |
| Pretty/minify | JSON, XML, YAML, SQL | pure JS | B |

### E-books & comics

| Direction | Formats | Engine | Tier |
| --- | --- | --- | --- |
| Both | EPUB, KEPUB, HTML, Markdown, DOCX, FB2 | `pandoc-wasm` + `fflate` | B |
| Both | CBZ; CBR/CB7/CBT input | `libarchive.js` | B |
| Output | MOBI, AZW3 | Calibre `ebook-convert` | S |
| Input | AZW, AZW4, PRC, LIT, LRF, CHM, PDB, PML, RB, SNB, TCR, OEB | Calibre | S |
| Preset | "For Kindle": EPUB tuned for Send-to-Kindle | `pandoc-wasm` | B |

### Audio

| Direction | Formats | Engine | Tier |
| --- | --- | --- | --- |
| Both | MP3, WAV, FLAC, OGG (Vorbis), Opus, AAC/M4A, AIFF, WavPack, TTA, W64, AC3, E-AC3, ALAC | `ffmpeg.wasm` (audio-only build, \~12 MB) | B |
| Input only | M4B, WMA, AMR, AU, CAF, WebA, MKA, MP2, DSS, APE, Musepack, TAK, DSF, DFF, DTS, Speex | `ffmpeg.wasm` | B |
| Extract | Audio track from any video container | `ffmpeg.wasm` (demux only, fast) | B |
| Presets | Podcast MP3 (mono 64k), voice memo → transcript-ready WAV 16k | `ffmpeg.wasm` | B |

### Subtitles

| Direction | Formats | Engine | Tier |
| --- | --- | --- | --- |
| Both | SRT, WebVTT, ASS, SSA, SAMI, LRC, TTML/DFXP, MicroDVD, SCC (input), SBV, JSON | `subsrt-ts` | B |
| Extract | From MKV, MP4, MOV, WebM | `ffmpeg.wasm` | B |
| Shift/resync | ± offset, framerate change | pure JS | B |

### Archives

| Direction | Formats | Engine | Tier |
| --- | --- | --- | --- |
| Both | ZIP, 7Z, TAR, TAR.GZ, TAR.BZ2, TAR.XZ, GZ, BZ2, XZ | `libarchive.js`, `fflate`, `7z-wasm` | B |
| Input only | RAR, CAB, CPIO, DEB, RPM, ISO, IMG, DMG, JAR, LHA/LZH, ARJ, LZMA, Z | `libarchive.js` | B |
| Preset | Any files → ZIP (the "Download all" path) | `fflate` | B |

### Fonts

| Direction | Formats | Engine | Tier |
| --- | --- | --- | --- |
| Both | TTF, OTF, WOFF, WOFF2, EOT | `fontkit`, `wawoff2` | B |
| Preset | Subset to Latin + `@font-face` snippet | `subset-font` (harfbuzz-wasm) | B |
| Preview | Specimen PNG/SVG | Canvas | B |

### Video (Phase 4 — common codecs in the browser via WebCodecs; the rest on the desktop app or a self-hosted omsettd)

| Direction | Formats | Engine | Tier |
| --- | --- | --- | --- |
| Both | MP4, MOV, MKV, WebM with H.264/H.265/VP9/AV1 and AAC/Opus; trim, mute, resize; GIF and APNG out | `mediabunny` (WebCodecs) | B — public site, near-native speed |
| Both | AVI, and any H.264/VP9/AV1 file the browser's WebCodecs lacks a decoder for | ffmpeg native | S — desktop app or self-hosted omsettd |
| Input only | M4V, WMV, FLV, MPEG, TS, M2TS, MTS, 3GP, 3G2, OGV, VOB, MOD, DV, MXF, RM, RMVB, SWF, WTV | ffmpeg native | S |
| Browser last resort | Any of the above when no desktop app is installed, clips under \~100 MB | `ffmpeg.wasm` multi-thread | B, slow, explicit opt-in |
| Presets | Social (1080×1080 / 1080×1920), GIF from clip, thumbnail at t=n, poster + `<video>` snippet | `mediabunny` where the codec allows, else ffmpeg | B / S |

### Later / plugin candidates (filee parity)

CAD (DWG, DXF via LibreDWG), 3D (GLB, glTF, STL, OBJ, 3MF, PLY, FBX via assimp-wasm), geospatial (GeoJSON, KML, KMZ, GPX, Shapefile via `gdal3.js`), HWP/HWPX. All fit the registry; none are v1.

### Cross-category routes

The registry is a directed graph; these are the edges that cross categories and the routes the router may chain:

- Image → PDF (one or many images to pages); PDF → images; SVG → image → ICO (favicon pack is a 2-step route)
- Document → PDF → image (thumbnail of a DOCX); Markdown → Typst → PDF (browser, if the Phase 2 spike holds) vs Markdown → DOCX → PDF (desktop app, better fonts)
- Spreadsheet → CSV → JSON/YAML; JSON → CSV → XLSX
- Any text/markup → EPUB → MOBI (desktop app)
- Video → audio → MP3; video → frame → image → OpenGraph preset
- Archive → contents → batch convert → re-archive (e.g. CBR → CBZ with WebP pages)

The router prefers B over S, fewer steps over more, and lossless edges over lossy; it shows the chosen route and its cumulative fidelity warnings on the tile.

## Conversion engines

**Every engine is a lazy-loaded Web Worker module behind one interface; the page itself ships at under 300 KB and never blocks on an engine.** A user who only ever converts images never downloads ffmpeg.

**The engine interface** (`packages/engines/src/types.ts`):

```ts
interface Engine {
  id: string                        // 'vips' | 'ffmpeg' | 'pandoc' | ...
  sizeBytes: number                 // shown as "downloads 12 MB once" on first use
  runtimes: ('browser' | 'node')[]  // where it can run; decides which test suite covers it
  maxPixels?: number                // raster engines: largest decoded image accepted
  license: string                   // SPDX id of the shipped artifact
  sourceUrl: string                 // where that artifact's exact source lives
  available(): Promise<boolean>     // cheap runtime probe, no download
  load(): Promise<void>             // fetch + instantiate WASM, cached by service worker
  convert(input: ConvertInput): Promise<{ name: string; format: string; blob: Blob }[]>
}
```

The Kickoff Prompt holds the authoritative version of this and the registry types. Three points matter at this level. An engine has no `supports()`: what it converts is declared once, in the registry, as a capability (the formats it reads and the formats it writes), and edges are derived from that rather than written per pair, so 25 image formats cost 25 entries, not 600. Outputs carry names, because a preset such as the favicon pack returns several files. And engines are plain async modules: the web app runs each in a Web Worker, while Node (tests, the CLI) calls them in-process.

**Browser engines (Tier 1/2):**

| Engine | Covers | Approx. download | Threads | Notes |
| --- | --- | --- | --- | --- |
| Canvas / `OffscreenCanvas` / WebCodecs | JPG, PNG, WebP, (AVIF decode), SVG rasterize | 0 | n/a | Tried first, but only when a runtime probe confirms the browser really encodes the target (some return a PNG when asked for WebP); otherwise the next engine runs |
| `mediabunny` (WebCodecs) | MP4, WebM, MKV, MOV with H.264/H.265/VP9/AV1/AAC/Opus; mux, demux, transcode, trim | \~0.3 MB | native | Tier 2 video in the browser at near-native speed; what VERT uses before falling back to its server |
| `@jsquash/*` (Squoosh codecs) | JPEG (MozJPEG), PNG (OxiPNG), WebP, AVIF, JXL, QOI | 0.3–2 MB each | optional | Best-in-class encoders; load per codec |
| `wasm-vips` | Resize, crop, TIFF, GIF, HEIC decode, color management, most raster I/O | \~8 MB | yes (needs COOP/COEP) | Primary image engine |
| `magick-wasm` | Long tail of raster formats, PSD/XCF read, ICO/ICNS write | \~15 MB | no | Fallback only when vips can't; VERT ships x64 and x86 builds and picks by `wasm-feature-detect` |
| `@neplex/vectorizer` | Raster → SVG tracing | \~2 MB | no | From VERT; replaces `imagetracerjs` |
| `libraw-wasm` | Camera RAW decode | \~3 MB | no | Large RAWs (> 50 MB) suggest the desktop app |
| `ffmpeg.wasm` (audio build) | All audio, subtitle extraction, audio from video | \~12 MB | yes | Custom build without video encoders keeps it small |
| `ffmpeg.wasm` (full) | Video the WebCodecs path can't decode (WMV, FLV, MPEG-2, etc.) when no desktop app | \~32 MB | yes | Loaded only on explicit opt-in; slow |
| `spessasynth` | MIDI and SoundFont → WAV/MP3 | \~1 MB + soundfont | no | From VERT |
| `pandoc-wasm` | Documents, markup, EPUB, DOCX↔MD | \~25 MB | no | Pandoc 3.x compiled to WASM; VERT ships it today, which de-risks the spike |
| `pdfjs-dist` + `pdf-lib` | PDF render, text, merge, page ops | \~2 MB | worker | Already battle-tested |
| SheetJS | Spreadsheets | \~1 MB | no | Community edition |
| `libarchive.js` / `fflate` / `7z-wasm` | Archives | 1–3 MB | no | `fflate` is tiny and handles the ZIP-download path alone |
| `fontkit` + `wawoff2` + `subset-font` | Fonts | \~2 MB | no |  |
| `subsrt-ts`, `js-yaml`, `smol-toml`, `fast-xml-parser`, `papaparse`, `exifr`, `smartcrop.js`, `dicom.ts` | Subtitles, data, metadata, smart crop, DICOM | < 1 MB total | no | Pure JS |

**Native engines (Tier 3 — in the desktop app via sidecar, or on a self-hosted omsettd):** ffmpeg (full, with libx264/x265/aom/svt-av1), LibreOffice headless (`soffice --headless --convert-to`), Calibre (`ebook-convert`), Ghostscript, Pandoc native (for files too large for the WASM heap), ImageMagick native, qpdf, veraPDF (shared with file-accessibility-audit). All invoked as child processes with a hard timeout and a per-job temp directory, since input files are untrusted; omsettd's container adds a memory limit and no outbound network.

**Loading strategy:**

1. On drop, detect format by magic bytes (`file-type`), never by extension alone.
2. Resolve the best route in the registry; identify the engines it needs.
3. Show the tile with a "downloads 12 MB once" note if an engine isn't cached yet; start prefetching it on hover/focus.
4. On Convert, instantiate in a dedicated Worker; stream progress back; transfer the result as a `Blob` via `postMessage` (zero-copy).
5. The service worker caches every `.wasm` by content hash for offline use; a "Manage engines" footer link shows what's cached and lets the user clear it.

**Memory discipline.** Files over \~500 MB, or any job whose estimated working set exceeds 1.5 GB, are routed to the desktop app (or a configured omsettd) when available and refused with a plain explanation when not. For raster images the limit is decoded pixels, not bytes: dimensions are read from the header before any decode, because a small file can declare an enormous image. Browsers kill tabs that exceed memory without warning; Omsett should never be the reason a user loses a tab.

**Testing the engines.** A fixture corpus (one small real file per input format, \~300 files, stored in the repo via Git LFS) runs in CI against the real engines. Coverage is linear, not quadratic: every format an engine reads is converted to one canonical target, every format it writes is produced from one canonical source, and every pair with an override is run as well. Engines that run in Node are tested in Vitest; browser-only engines (Canvas, WebCodecs) run the same fixtures in Playwright across Chromium, Firefox, and WebKit, so the path most users get is the path CI tests. A conversion that produces an empty or unreadable output fails the build. This is the single highest-value piece of infrastructure in the project: it's what lets you add formats without fear.

## Downloadable app

**"Downloadable" is met in three shapes, all from one codebase: a PWA from the first release, an Electron desktop app in Phase 3, and a CLI alongside it.** The desktop app and CLI share the same Nuxt build, registry, and engine packages; they only add what a browser can't do.

### Stage 1 — PWA (ships with v1)

`@vite-pwa/nuxt` with a precache of the app shell and runtime caching of `.wasm` files. Installable from Chrome, Edge, Safari (macOS/iOS) and Android. Gets Omsett an icon in the dock, offline operation, and on Android the share sheet as an input (`share_target` in the manifest; iOS does not support it). For most users this is the download; nothing more is needed.

### Stage 2 — Electron desktop app (Phase 3)

**Decision: Electron, the shell you already ship Drafter with, so the two projects share one desktop toolchain, one signing setup, and one set of lessons.** Tauri would give a 10 MB binary instead of \~120 MB, but a second desktop stack for a one-person portfolio costs more than the 110 MB saves, and Electron's bundled Chromium guarantees WebCodecs, `OffscreenCanvas`, and `SharedArrayBuffer` behave identically on every OS — Tauri's system WebView does not. Concretely for Omsett: WebCodecs (the Tier 2 video path) is absent or partial in WKWebView and older WebView2 builds, `SharedArrayBuffer` needs per-platform workarounds in Tauri, and spawning ffmpeg from Electron's main process is twenty lines of Node with `execa` rather than a Rust sidecar. Tauri wins only on installer size, and only matters if you wanted a Rust codebase.

**Architecture**

| Piece | Choice |
| --- | --- |
| Build | `electron-vite` for main/preload/renderer; `electron-builder` for installers; the renderer is the exact `apps/web` static output, loaded through a custom `omsett://` protocol handler that sets COOP/COEP so multi-threaded WASM works offline |
| Process model | `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`. The renderer is the web app and cannot touch the filesystem; everything native goes through a typed `window.omsett` bridge exposed by the preload via `contextBridge` |
| Native engines | Bundled: a static `ffmpeg` (`ffmpeg-static`, \~80 MB, the single biggest reason the app exists). Detected or installed on demand: LibreOffice (`soffice`), Calibre (`ebook-convert`), Ghostscript, Pandoc, qpdf, veraPDF — via `engines.json` (Filee-style: pinned URL + SHA-256 per platform) and an in-app "Install" button that shells out to Homebrew / winget / apt, or downloads the pinned binary into `userData/engines/` |
| Engine execution | Main process spawns engines with `execa`, hard timeout, `nice`d, per-job temp dir under `userData/tmp/<jobId>` deleted on completion; progress parsed from stderr and streamed to the renderer over IPC |
| OS integration | Native open/save dialogs; file associations for every registered input format (opens Omsett with the file pre-dropped); "Open with Omsett" in Finder/Explorer context menu; macOS Services and Windows Send To; drag out of the result card onto the desktop; dock/taskbar progress bar; tray item for watch folders |
| Watch folders | `chokidar` on `~/Omsett/<preset>/` (e.g. `to-webp`, `og-image`); any file dropped in is converted next to it, with a `.omsett.log` line per job. Configured in the app's only settings page |
| Updates | `electron-updater` against GitHub Releases, check on launch, apply on quit; release notes shown in-app |
| Signing | macOS: Developer ID + notarization via the Apple Developer Program ($99/yr; you're enrolling now, so macOS is first-class from Phase 3, and the same certificate covers Drafter). Store the `notarytool` credentials once as GitHub Actions secrets and both apps' release workflows share them. Windows: [Azure Artifact Signing](https://azure.microsoft.com/en-us/pricing/details/trusted-signing/) (formerly Trusted Signing), Basic tier at $9.99/month for 5,000 signatures and one certificate profile; individuals in the US are eligible, identity validation takes a few days, certificates rotate daily with timestamping, `electron-builder` supports it natively. Not EV, so SmartScreen reputation still accrues over time, but signed from day one. Linux: AppImage + `.deb`, unsigned. Total signing cost for both platforms and both apps: about $220/yr |
| Size | \~120 MB installer with ffmpeg; \~40 MB without. Both published; the picker tells a user without ffmpeg what they're missing |
| Accessibility | Same DOM as the web app, so the same WCAG 2.2 AA surface; native menus with accelerators; `app.setAccessibilitySupportEnabled(true)`; tested with VoiceOver and NVDA like the site |
| CLI inside the app | "Install `omsett` command" menu item symlinks the bundled CLI onto the PATH, VS Code-style |

**What the desktop app changes in the picker:** every Tier 3 tile becomes live, badges read "on this computer," and the memory ceiling disappears (native engines stream from disk). The web app and the desktop app are otherwise pixel-identical, which is the point of one codebase.

### Stage 3 — CLI (`npx omsett`, Phase 3)

**The CLI is the registry and engines running in Node, with no UI.** Published as `omsett` on npm; also bundled inside the desktop app. Node 24+ (the repo's `.nvmrc`).

```
omsett <input...> --to <format|preset> [options]

  omsett report.docx --to pdf
  omsett *.heic --to jpg --quality 85 --out ./jpg/
  omsett hero.png --to og-image            # preset: 1200×630 JPG + WebP + <meta> snippet
  omsett logo.svg --to favicon-pack
  omsett talk.wav --to mp3 --preset podcast
  omsett book.md --to epub --to docx       # several targets in one run
  omsett photos/ --to webp --recursive --watch
  omsett --list                            # formats and presets, as a table or --json
  omsett --explain heic                    # the same "what is this format" paragraph the tile shows
  omsett --engines                         # which native engines are on PATH / installed
  omsett big.mov --to mp4 --server https://omsett.home.example/api   # route Tier 3 to a self-hosted omsettd
```

| Behavior | Rule |
| --- | --- |
| Output naming | Same basename, new extension, same directory, unless `--out <dir>` or `--name "{name}-{preset}.{ext}"`; never overwrites without `--force` |
| Routing | Same router as the web app; `--route` prints the chosen path and its fidelity warnings; `--dry-run` prints what would happen and exits 0 |
| Tiers | Browser-tier engines run as WASM in Node; native-tier engines are found on PATH, in the desktop app's `userData/engines/`, or at `--server`; a missing engine is a clear error naming what to install |
| Batch | Globs and directories; parallelism = CPU count, `--jobs N` to change; one progress line per file, or `--quiet`, or `--json` for one NDJSON event per job for scripting |
| Metadata | `--strip-metadata` (default for web presets), `--keep-metadata` |
| Exit codes | 0 all converted; 1 some failed (listed on stderr); 2 bad arguments; 3 missing engine |
| Config | Optional `omsett.config.ts` in the working directory: default presets, output rules, server URL. Lets the ICJIA sites convert images at build time with a one-line `package.json` script |
| Accessibility of the CLI itself | Plain text, no color-only meaning, `NO_COLOR` respected, progress collapses to one line per file under `CI=1` |

### Phones

Electron has no mobile build and bundling ffmpeg or LibreOffice into a phone app is not realistic anyway, so phones get the PWA (most of the matrix, including WebCodecs video) and, on a network with a self-hosted omsettd served over HTTPS (see Deployment topology), the full suite through the browser. That is the one job the server exists for.

## Accessibility & privacy

**Omsett meets WCAG 2.2 AA itself and treats the accessibility of its *output* as a feature.** Neither competitor does either; for a tool built by the person who runs ICJIA's Title II program, both are table stakes.

**The interface:**

- Every action is keyboard-reachable: Tab to the drop zone, Enter/Space to browse, arrow keys across the picker tiles, Enter to select, a single "Convert" shortcut (`Ctrl/Cmd+Enter`).
- The picker is a `radiogroup` with roving tabindex; dimmed tiles are `aria-disabled` with the reason in `aria-describedby`, never removed from the DOM.
- Progress uses `aria-live="polite"` region announcements at 25/50/75/100%, not per-percent chatter. Completion is announced in the same polite region with the result count; nothing in a conversion is urgent enough for `assertive`.
- Drop zone is also a real `<input type="file">`; drag-and-drop is an enhancement, never the only path.
- Dark mode is default but respects `prefers-color-scheme` and `prefers-reduced-motion`; all text at 4.5:1 or better against `#0d0d0d`; focus rings are 2 px and never suppressed.
- Tested with NVDA and VoiceOver before each release using the voicecap/axecap tooling you already have; axe-core runs in CI on the built site.

**The output:**

- DOCX/ODT/MD/HTML → PDF produces tagged PDF with heading structure, reading order, alt text, and language set, by default. Untagged is an opt-out, not the other way round. This holds on every route that can tag (LibreOffice today; Typst in the browser if the Phase 2 spike holds). A route that cannot tag is never offered silently: its tile carries the warning "This PDF will not be tagged for screen readers."
- Image conversions carry alt text through where the container supports it (EXIF `ImageDescription` → XMP `dc:description` → `<img alt>` in generated snippets).
- After any → PDF conversion, "Check accessibility" is one click away. In the desktop app it runs veraPDF locally and shows the letter grade inline. On the web it is a link that opens file-accessibility-audit in a new tab, where the user uploads the file themselves: Omsett's own page sends nothing, so "nothing leaves your device" stays true without an asterisk.
- Subtitle conversions preserve speaker labels and positioning where the target format allows; the fidelity warning says when it doesn't.

**Privacy, stated plainly on the page and kept:**

- Tier 1/2 conversions never make a network request with file data. This is the headline promise. It is verifiable in DevTools and enforced by `connect-src 'self'` in two Content-Security-Policies, one on the page and one on every worker script: neither can send anything to another origin even if a dependency tried.
- omsett.com has no Tier 3 upload path at all. On a self-hosted copy, sending a file to that copy's own omsettd is opt-in per conversion and labeled before the click.
- omsettd stores nothing beyond the life of the job; logs record sizes and formats, never filenames or content.
- No analytics beyond Netlify's server-side counts. No cookies. No accounts.
- Metadata (EXIF/GPS/author) is shown before converting and stripped by default for web-bound presets, since the most common privacy leak in file conversion is the metadata nobody looked at.

## Licensing

**Omsett's own code is MIT. The engines it ships are not all MIT, and each keeps its own license.** Every engine is loaded as a separate, unmodified artifact, never compiled into Omsett's code, and the rules below keep that arrangement honest. This is an engineering position, not legal advice; have the notices checked once before the desktop app bundles a GPL binary.

**Rules:**

1. Every engine record carries `license` (an SPDX id) and `sourceUrl`. A registry test fails without them, the "Manage engines" panel shows them, and `THIRD-PARTY-NOTICES.md` lists every shipped engine and library with license, version, and source link.
2. Copyleft engines ship as unmodified upstream builds wherever one exists. Where Omsett builds its own (the audio-only `ffmpeg.wasm`), the build script and exact configuration live in this repo so the corresponding source is always reproducible.
3. Ideas travel; code and data do not. Filee is MIT, so its format tables and design may be ported with attribution. VERT is AGPL-3.0, so nothing from its source is copied or transcribed: not code, not data sets, not schemas.
4. Patent-encumbered encoders are not shipped in v1. WebCodecs uses whatever the user's browser and OS already license; Omsett does not bundle an HEVC encoder, so HEIC and H.265 are decode-only wherever the platform does not supply the encoder itself.
5. AGPL engines never run on the public site. Ghostscript is a native, separately installed binary in the desktop app and a component of the self-host image; no Ghostscript WASM build is served from omsett.com.

**Licenses as understood today; confirm each against the exact artifact when its engine is added:**

| Engine | License | Consequence |
| --- | --- | --- |
| Pandoc (`pandoc-wasm`) | GPL-2.0-or-later | Ship an unmodified build; link its source and version in the notices |
| FFmpeg | LGPL-2.1-or-later by default; GPL when built with x264/x265 | Browser audio build stays LGPL-only. The desktop bundle is an open decision (below) |
| Ghostscript | AGPL-3.0 (commercial license available) | Rule 5 |
| Calibre | GPL-3.0 | Never bundled; invoked as a separate installed program |
| LibreOffice | MPL-2.0 | Invoked as a separate installed program; bundled only in the omsettd image |
| libvips (`wasm-vips`) | LGPL-2.1-or-later, with LGPL libraries inside; wrapper MIT | Unmodified build, listed with its bundled libraries |
| libheif | LGPL-3.0 | Decode only (rule 4) |
| LibRaw | LGPL-2.1 / CDDL | Unmodified build |
| ImageMagick (`magick-wasm`) | ImageMagick License / Apache-2.0 | Notice only |
| veraPDF | GPL-3.0-or-later / MPL-2.0 | Desktop and omsettd only; separate program |
| 7-Zip (`7z-wasm`) | LGPL, with an unRAR restriction | Check the restriction before offering RAR input through it |
| mediabunny | MPL-2.0 | Notice only |
| pdf.js, pdf-lib, SheetJS CE, fflate, and the small pure-JS libraries | Permissive (MIT / Apache-2.0 / BSD) | Notice only |

## Project structure & tech stack

**A pnpm monorepo with one shared registry package, so web, server, CLI and desktop can never disagree about what converts to what.** Same shape as file-accessibility-audit (`apps/` + `packages/`), so the tooling carries over.

```
omsett/
├─ apps/
│  ├─ web/            Nuxt 4 + Nuxt UI, static build → Netlify; Dockerfile (Caddy) for self-hosters
│  ├─ desktop/        Electron shell wrapping apps/web + bundled ffmpeg (Phase 3)
│  ├─ cli/            npx omsett → npm (Phase 3)
│  └─ server/         omsettd: Node 24, Hono, child_process engines → Docker image, self-host only (Phase 4)
├─ packages/
│  ├─ registry/       Format definitions, edges, fidelity notes, presets, router
│  ├─ engines/        Engine interface + one folder per engine (vips, ffmpeg, pandoc, …)
│  └─ detect/         Magic-byte detection, metadata readers (exifr etc.)
├─ fixtures/          One real sample file per input format (Git LFS)
├─ e2e/               Playwright gate flows + axe
├─ docs/              This suite, as Markdown
├─ docker-compose.yml Homelab: web + omsettd
└─ netlify.toml
```

**Stack decisions:**

| Layer | Choice | Why |
| --- | --- | --- |
| Framework | Nuxt 4, `nuxt generate` (SSG), no server routes | Static is the whole point; SSR adds nothing to a drop zone |
| UI | Nuxt UI v4 (Tailwind v4 underneath) | Your default; `color-mode` built in; accessible primitives from Reka UI |
| Language | TypeScript strict everywhere, including engine wrappers | The registry is a typed graph; let the compiler catch a bad edge |
| Package manager | pnpm workspaces | Your default; `--frozen-lockfile` in CI and Docker builds |
| Workers | Vite worker imports (`new Worker(new URL(…, import.meta.url), { type: 'module' })`) + Comlink | Every engine runs off the main thread |
| PWA | `@vite-pwa/nuxt` | Offline shell + `.wasm` runtime cache + `share_target` |
| Server framework | Hono on Node 24 | Phase 4, self-host image only; tiny, streams well |
| Process manager | PM2 via `ecosystem.config.cjs` | Docker Compose for self-hosters; PM2 only if you run a private droplet instance |
| Reverse proxy | Caddy | Caddy inside the `omsett-web` image sets COOP/COEP for self-hosters |
| Desktop | Electron (electron-vite + electron-builder) | Same shell as Drafter; bundled Chromium makes WebCodecs/WASM behave identically on every OS; \~120 MB with ffmpeg |
| Tests | Vitest for unit + registry graph checks; Playwright for the drop→pick→download flow; fixture corpus through every edge in CI | The corpus is the real test suite |
| CI | GitHub Actions: lint, typecheck, fixtures, axe-core, Playwright, electron-builder matrix on tag |  |
| Hosting | Netlify Pro (web), GitHub Releases (desktop), npm (CLI), GHCR (self-host images) |  |
| License | MIT, personal project under github.com/cschweda/omsett (decided) |  |

**Netlify specifics:**

```
# netlify.toml
[build]
  command = "pnpm --filter web generate"
  publish = "apps/web/.output/public"

```

Policies and response headers are defined once in `apps/web/security-headers.ts` and written out after the build, so the two hosts cannot drift. COOP `same-origin` and COEP `require-corp` go on everything, and `/engines/*` gets a one-year immutable cache plus `Cross-Origin-Resource-Policy: same-origin`.

**There are two Content-Security-Policies, because a browser governs a page and a worker separately.** A worker answers to the policy on its own script's response, not to the page's.

| Policy | Delivered as | What it allows |
| --- | --- | --- |
| Document | A `<meta>` tag written into each built HTML file | Scripts from this origin and the build's own inline scripts, by hash. No eval of any kind |
| Worker | A response header on `/_nuxt/workers/*` and `/engines/*` only | The same, plus `'wasm-unsafe-eval'` and `'unsafe-eval'` |

Both carry `connect-src 'self'`, which is the enforcement behind the privacy promise.

The worker policy allows eval because libvips's JavaScript bindings (Emscripten's embind) build their call wrappers with `new Function`, and other Emscripten engines are likely to need the same. Confining that to the conversion worker keeps it away from the page, where the DOM and the user's input live; the worker runs no third-party script and cannot reach the network. The document policy is a `<meta>` tag for two reasons: a header on `/*` would also land on worker scripts and override their allowance (two policies on one response are both enforced), and a policy inside the HTML still applies when the files are hosted somewhere that cannot set headers. Framing is refused with `X-Frame-Options: DENY`, since a `<meta>` policy cannot carry `frame-ancestors`.

**Rule for every later engine:** if it needs eval, it runs in a worker served from one of those two paths. The page's policy is never loosened for an engine.

COOP/COEP enable `SharedArrayBuffer` for multi-threaded `wasm-vips` and `ffmpeg.wasm`. The cost is that cross-origin resources need CORP headers, so engines are self-hosted under `/engines/` rather than pulled from a CDN like unpkg.

**The registry is data, not code.** Each format is a TS record (`id`, `name`, `extensions`, `mime`, `detect`, `category`, `explain`, whether it is lossy `never`/`always`/`optional`, and the `traits` it can carry: alpha, animation, metadata, multiple pages, layers). Each engine has one capability record: the formats it reads, the formats it writes (with default options and whether those defaults are lossy), its tier, and a priority. Edges are derived from capabilities, with several candidate engines per pair in priority order, and fidelity warnings are derived from traits the source has and the target lacks. A short list of overrides covers the pairs that need a specific warning or must be blocked. Presets are named routes with fixed options and an optional post-step. Adding a format is a PR that touches the registry and drops a fixture; the UI never changes.

## Roadmap

**Six phases, each gated by one conversion working end to end in public, no dates attached.** Phase 0 is small on purpose: the first thing on omsett.com should be a single working conversion with all the plumbing behind it, not a format list.

| Phase | Scope | Gate |
| --- | --- | --- |
| 0 · Foundation | Monorepo, registry, engine interface, fixture CI; Netlify deploy; CI with fixtures, axe and Playwright | PNG to WebP end to end on omsett.com |
| 1 · Images, data, archives, fonts, PWA | Raster and vector formats, data, archives, fonts; OpenGraph, favicon, responsive presets; installable | Squish parity; axe clean; NVDA pass |
| 2 · Documents, audio, ebooks, subtitles | pandoc-wasm, ffmpeg audio build, SheetJS, PDF tools; fidelity warnings and multi-step router live; the Typst spike for PDF in the browser | DOCX to Markdown and EPUB, and WAV to MP3, in the browser; DOCX to PDF in the browser decided one way or the other by the spike |
| 3 · Desktop app and CLI | Electron installers; bundled ffmpeg, local LibreOffice, Calibre; npx omsett; accessibility check on PDF output | DOC to tagged PDF locally; installers on 3 OSes |
| 4 · Video | WebCodecs video in the browser; full ffmpeg in the desktop app; self-hosted omsettd (Docker) for teams and phones | 10-minute MOV to MP4 with progress, offline |
| 5 · Plugins (filee parity) | CAD, 3D, geospatial, HWP as registry plugins; community-contributed engines | — |

The desktop app lands before video on purpose: once it exists, the long tail of video and all heavy office conversions run on the user's own machine, and nothing you operate ever carries them. Common-codec video runs in the browser via WebCodecs from Phase 4.

## Open questions & risks

**Decisions still yours to make:**

- [x] **License.** Decided: MIT.
- [x] **Personal or ICJIA?** Decided: personal, under github.com/cschweda/omsett; npm name omsett. (Was: which org, affecting license line, npm scope `omsett` vs `@icjia/omsett`).
- [x] **Is omsettd ever public?** Decided: no public server. The desktop app is the full suite; omsettd is self-host only (Docker, Phase 4) for teams and phones. The droplet is not part of the plan unless you want a private instance.
- [ ] **pandoc-wasm viability.** It's the keystone of the document tier in the browser. Verify early (Phase 0 spike) that current builds handle DOCX↔MD↔EPUB at the sizes writers actually use (a 200-page manuscript) within the WASM heap. If not, documents shift to the desktop tier sooner.
- [x] **Office → PDF in the browser.** Decided: no good WASM LibreOffice exists at a sane size, so on the public site DOCX → PDF shows "needs the desktop app" unless a Phase 2 spike proves a browser route: pandoc-wasm to Typst markup, compiled by Typst's WASM build. Recent Typst releases are reported to emit tagged PDF; the spike confirms that, and the output quality on a real manuscript, before the edge is registered (with a fidelity warning: the layout is rebuilt, not preserved). There is no "browser print" route: `window.print()` opens a dialog and returns no file, so it cannot be an engine.
- [ ] **Desktop ffmpeg build.** LGPL-only, or a GPL build with x264? The GPL build encodes H.264 better and obliges the app to ship the GPL notice and a source offer; `ffmpeg-static`'s prebuilt binaries need checking for which they are. See Licensing.
- [ ] **Preset list for v1.** OpenGraph is confirmed. Favicon pack and responsive set are strongly implied by your sites. Confirm or cut the rest (email-safe, Kindle, podcast).

**Risks and mitigations:**

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| WASM engine download sizes deter first-time users | Medium | Lazy load per engine; show "12 MB once" before the click; service-worker cache; Canvas fast-path means most image jobs need nothing |
| COOP/COEP headers break something unexpected (e.g., a future embed) | Low | Single-purpose site; no third-party embeds planned |
| A WASM engine needs JavaScript eval, which a strict policy forbids | Happened in Phase 0 (libvips) | Two policies: the page allows no eval; worker scripts carry their own policy that does. Both keep `connect-src 'self'` |
| Browser memory kills a tab on a big file | Medium | Size estimate before convert; route to desktop above 500 MB; never silently try |
| Format long tail is endless and distracts from the core | High | Registry is data; fixture corpus gates every addition; v1 scope is fixed to the matrix above |
| Native engines (LibreOffice, Calibre) complicate the desktop installer; code-signing identity validation takes patience | Medium | Bundle only ffmpeg; detect the rest on PATH and offer a one-click install via Homebrew/winget/apt, as filee does. Enroll in the Apple Developer Program and Azure Artifact Signing (about $220/yr together, covering Drafter too) and wire both into CI before Phase 3 starts, since validation is the slow part |
| Maintenance load for a one-person project | High | Phases gated by one working conversion each; nothing ships half-done; CI corpus does the regression work |
| An engine's license or a codec patent conflicts with how it is shipped | Medium | The Licensing rules; `license` and `sourceUrl` required on every engine and checked in CI; HEIC output and Ghostscript WASM kept off the public site |
| Someone wraps the open code in an ad-laden upload site | Medium | MIT allows it; the privacy promise, the name, and omsett.com are the brand |
| WoW/gaming "transmog" confusion | Gone | Omsett has no such neighbor |

**First concrete step:** Phase 0 spike — a bare Nuxt 4 page on Netlify with COOP/COEP headers that loads `wasm-vips` in a worker and converts a dropped PNG to WebP, and the same page served by `docker compose up` on your own machine. If both work in a weekend, every later phase is just more registry entries. The Kickoff Prompt doc specifies it exactly.
