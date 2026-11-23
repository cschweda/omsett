<p align="center">
  <img src="brand/og.png" alt="Omsett — open-source file converter. Drop a file. Pick a format. Nothing leaves your device.">
</p>

<p align="center">
  <a href="https://forge.laravel.com/chris-schweda/aged-autumn-jm7/3514825"><img src="https://img.shields.io/endpoint?url=https%3A%2F%2Fforge.laravel.com%2Fsite-badges%2F43519b34-25cc-454e-9f75-ce22271fdc1f&style=plastic" alt="Laravel Forge site deployment status"></a>
  <a href="https://github.com/cschweda/omsett/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/cschweda/omsett/ci.yml?branch=main&label=tests&style=plastic" alt="Test status"></a>
  <a href="https://omsett.com"><img src="https://img.shields.io/website?url=https%3A%2F%2Fomsett.com&label=omsett.com&style=plastic" alt="Website status"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/cschweda/omsett?style=plastic" alt="MIT license"></a>
  <a href="CHANGELOG.md"><img src="https://img.shields.io/github/last-commit/cschweda/omsett?label=updated&style=plastic" alt="Last updated"></a>
</p>

# Omsett

**Drop a file. Pick a format. Nothing leaves your device.**

Omsett is a free, open-source, accessible file converter. Every conversion that can run in the browser runs there — images, audio, documents, data, archives, fonts, subtitles, and common video — so your files never touch a server. A desktop app adds the long tail (full ffmpeg, LibreOffice-grade office fidelity, Calibre ebook targets) on your own machine.

*Omsett* is Norwegian: to translate; to convert.

> **Status: pre-alpha, and live at [omsett.com](https://omsett.com).** One real conversion so far, PNG → WebP, running entirely in the browser, with the plumbing every later format will use. The site's own [About](https://omsett.com/about), [Technical details](https://omsett.com/technical), and [What's new](https://omsett.com/whats-new) pages are kept current with the code.

## What it will do

| Public site (omsett.com) | Desktop app | CLI |
| --- | --- | --- |
| Everything the browser can do: ~200 formats via WebAssembly and WebCodecs | The full suite, including video and office fidelity, with no server | `npx omsett report.docx --to pdf` — same engines in Node |
| Purpose presets: OpenGraph image, favicon pack, responsive set, Kindle | Watch folders, file associations, bundled ffmpeg | Batch, globs, `--watch`, JSON output for scripts |
| Fidelity warnings before you convert; metadata shown and stripped by default | Auto-update via GitHub Releases | Optional `omsett.config.ts` for build-time conversion |

A self-hostable `omsettd` (Docker) is planned for teams and phones that want the full suite through the browser on their own network. There is no public server; there never will be.

## Principles

- **Private by construction.** Browser-tier conversions make no network request with file data. Verifiable in DevTools.
- **Accessible as a feature.** WCAG 2.2 AA in the interface; tagged, structured PDF output by default.
- **Honest about limits.** Every target says where it runs and what it will lose before you click Convert.
- **The registry is data.** Adding a format is a record and a fixture, never a UI change.

## Stack

Nuxt 4 + Nuxt UI (a static site, served by nginx) · TypeScript · pnpm · Web Workers + WASM (`wasm-vips`, `pandoc-wasm`, `ffmpeg.wasm`, `mediabunny`) · Electron for the desktop app · Docker Compose for self-hosting.

## Run it locally

```
pnpm install
pnpm dev
open http://localhost:3000
```

To try it from a phone or another computer on the same network, use `pnpm dev:lan` and open `http://<this machine's address>:3000`. Over plain HTTP, browsers switch off what libvips needs, so Chrome and Firefox convert there and Safari cannot; `pnpm dev:lan:https` serves it over HTTPS with a self-signed certificate (accept the browser's warning once) and everything works.

Node 24 and pnpm (the versions in `.nvmrc` and `package.json`). `pnpm test` runs the unit and fixture tests; `pnpm build && pnpm e2e` runs the browser tests against the built site in Chromium, Firefox, and WebKit.

## Add a format

Formats are data. Nothing in the UI changes when one is added.

1. Add a `Format` record in [`packages/registry/src/formats/`](packages/registry/src/formats/) and list it in `formats/index.ts`. Write its `explain` paragraph for someone who has never heard of the format.
2. Add its id to the `reads` or `writes` of an engine in [`packages/registry/src/capabilities.ts`](packages/registry/src/capabilities.ts). Routes and fidelity warnings are derived from that.
3. Drop one small real file in `fixtures/<format-id>/`. The fixture tests pick it up and run it through every engine that claims the format.

A new engine also needs an implementation in [`packages/engines/src/`](packages/engines/src/) and an entry, with its license and source, in `info.ts` and [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md).

## Deploy

The site is static files plus a set of response headers the build generates. Without the headers the page loads but nothing converts, so each host gets them in its own format.

**The live site (DigitalOcean, nginx).** [`docs/deploy-digitalocean.md`](docs/deploy-digitalocean.md) has the full steps for a Laravel Forge server. In short: nginx serves `live/public`, includes the generated `headers.nginx`, and the deploy script is `scripts/publish-static.sh`, which builds and then switches to the new build in one step. Every push to `main` deploys; there is no staging branch.

**Self-host with Docker.** `docker compose up --build` serves the same build from Caddy at `http://localhost:8080`, as a non-root user on a read-only filesystem. To reach it from other devices, set `OMSETT_SITE_ADDRESS` to a hostname so Caddy serves HTTPS: away from `localhost`, browsers give multi-threaded WebAssembly and offline use to HTTPS only.

**Netlify.** [`netlify.toml`](netlify.toml) still works if you would rather host there; the build writes Netlify's `_headers` file too.

## Security

<!-- security:start -->
<!-- Generated from security/audits.json by `pnpm security:docs`. Do not edit by hand. -->

Every audit is recorded in full, with how each problem was found and what was done about it, in [`SECURITY.md`](SECURITY.md) and on the site’s [Security page](https://omsett.com/security).

| Date | Audit | Findings | Fixed | Open | Accepted |
| --- | --- | --- | --- | --- | --- |
| 23 November 2026 | Red and blue: every reader, every engine, the page and its deployment | 29 (4 high, 14 medium, 11 low) | 24 | 4 | 1 |
| 22 November 2026 | Follow-up: closing two open findings | 3 (1 medium, 1 low, 1 info) | 2 | 1 | 0 |
| 22 November 2026 | Red/blue audit of the converter and its hosting | 10 (3 medium, 5 low, 2 info) | 6 | 3 | 1 |
| 22 November 2026 | Review with deliberately broken files, and a deployment incident | 6 (2 high, 3 medium, 1 low) | 5 | 1 | 0 |

**Latest audit, 23 November 2026:**

| ID | Severity | Finding | Status |
| --- | --- | --- | --- |
| OMS-102 | High | Text hidden in a Word document was carried across unless it was hidden the plainest way | Fixed |
| OMS-103 | High | A slide hidden with the word "false", and shapes hidden in the editor, were published from a presentation | Fixed |
| OMS-101 | High | A workbook of 88 KB made the reader hold three gigabytes | Fixed |
| OMS-116 | High | Counting visits as first built would have run another party's code in the page | Fixed |
| OMS-104 | Medium | Tags could be smuggled through the subtitle cleaner by nesting them | Fixed |
| OMS-120 | Medium | A drawing was held to the size it stated, not to the pictures inside it | Fixed |
| OMS-121 | Medium | A drawing of 275 bytes could ask for work that never finishes | Fixed |
| OMS-122 | Medium | One drawing left the SVG engine unfit for every file after it | Fixed |
| OMS-123 | Medium | ImageMagick checked a picture's size after decoding it, and read any number of pictures | Fixed |
| OMS-124 | Medium | The size guard and the engine read a file's size from different places | Fixed |
| OMS-125 | Medium | A Photoshop file was converted to its largest layer, hidden or not | Fixed |
| OMS-126 | Medium | Photographs taken upright came out on their side | Fixed |
| OMS-106 | Medium | A table could be written thousands of times larger than what it was made from | Fixed |
| OMS-105 | Medium | A font whose tables share bytes was written out hundreds of times larger | Fixed |
| OMS-107 | Medium | Archive names that mean something else on Windows and Macs were carried into the new archive | Fixed |
| OMS-119 | Low | Previews handed any picture to the browser to draw, with no limit on how many or how large | Fixed |
| OMS-117 | Low | A batch left behind by "Convert another" converted discarded files into the new session | Fixed |
| OMS-118 | Low | Asking for a file's details could stop another file's conversion | Fixed |
| OMS-108 | Low | Seven readers and writers went round once for everything already read | Fixed |
| OMS-113 | Low | A long page was refused as "nested too deeply"; deep HTML inside Markdown was not refused | Fixed |
| OMS-114 | Low | Names every JavaScript object answers to were read as values | Fixed |
| OMS-115 | Low | Text that reads as structure was written unescaped into lyrics, contacts and calendars | Fixed |
| OMS-127 | Low | A HEIC file was converted to its first picture, not the one it names as the one to show | Fixed |
| OMS-128 | Low | Ordinary text that begins with a signature's letters was taken for a picture | Fixed |
| OMS-130 | Medium | The live site was not sending a security header added a day earlier | Open |
| OMS-131 | Medium | Nothing stands between a push and the live site, and the site is built on its own server | Open |
| OMS-129 | Medium | The security policy cannot stop a script in the page from sending a file elsewhere by navigating | Accepted |
| OMS-132 | Low | Supply-chain settings looser than the rest of the project | Open |
| OMS-133 | Low | Two warnings the picker does not give | Open |

To report a vulnerability, use the **Security** tab of this repository (“Report a vulnerability”), not a public issue.

<!-- security:end -->

## Documents

- [`docs/00-high-level-design.md`](docs/00-high-level-design.md) — architecture, format matrix, engines, roadmap, brand
- `docs/01-kickoff-prompt-phase-0.md` — the Phase 0 build prompt for Claude Code
- [`docs/deploy-digitalocean.md`](docs/deploy-digitalocean.md) — putting the site on a DigitalOcean droplet with Forge and nginx
- [`AGENTS.md`](AGENTS.md) — the architecture rules and working agreements, condensed
- [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md) — every shipped engine and library, with license and source
- [`brand/`](brand/) — OpenGraph image and its source

## Roadmap

| Phase | Gate |
| --- | --- |
| 0 · Foundation | PNG → WebP end to end on omsett.com |
| 1 · Images, data, archives, fonts, PWA | Squish parity |
| 2 · Documents, audio, ebooks, subtitles | DOCX → Markdown/EPUB and WAV → MP3 in the browser |
| 3 · Desktop app and CLI | DOC → tagged PDF locally; installers on 3 OSes |
| 4 · Video | 10-minute MOV → MP4 with progress, offline |
| 5 · Plugins | CAD, 3D, geospatial, HWP as registry plugins |
| 6 · Accessibility | WCAG 2.2 AA audit of the finished interface; axe clean; NVDA and VoiceOver pass |

## Related

[vert.sh](https://github.com/VERT-sh/VERT) and [Filee](https://github.com/KnifeLemon/Filee) are the two projects Omsett learns most from; see the design doc for exactly what is borrowed and credited.

## License

[MIT](LICENSE) © 2026 Christopher Schweda
