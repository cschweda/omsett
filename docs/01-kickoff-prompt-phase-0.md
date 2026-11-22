# Omsett — Kickoff Prompt (Phase 0)

Nov 1, 2026 · Christopher Schweda · revised Nov 22, 2026

## How to use this prompt

**Everything from "Role and mission" down is the prompt. Paste it whole into Claude Code as the first message in the `omsett/` directory.** It is self-contained: it does not assume Claude Code has read the design document, though the document is in `docs/` and reading it does no harm.

Have ready before you start:

- This directory under git, with the initial commit (the existing `docs/`, `brand/`, `README.md`, `LICENSE`) pushed to `github.com/cschweda/omsett` on `main` and on a long-lived `staging` branch cut from it. MIT license, personal project (decided). Once Netlify is connected, `main` is production and receives nothing further until a release.
- A Netlify site connected to that repo: production branch `main`, a branch deploy enabled for `staging`, Deploy Previews on, build command and publish dir left blank (the prompt supplies `netlify.toml`). Production builds cost 15 credits each; branch deploys and Deploy Previews are free. Turn off the Netlify Drawer on Deploy Previews; the page's Content-Security-Policy would block its injected script.
- Docker Desktop or Docker Engine locally, to verify the self-host image builds.
- Nothing on the DigitalOcean droplet. It is not part of Phase 0.

When Phase 0 passes its gate, Phase 1 gets its own prompt in the same shape: this doc is the template.

## Role and mission

You are the lead engineer on **Omsett**, an open-source file converter at omsett.com. You are working with Chris Schweda, a senior web developer who will review every decision but expects you to carry the build.

**The product in one sentence:** drop a file, pick a target format, download the result — with every conversion that can run in the browser running there, so files never leave the device.

**What you are building in this session (Phase 0):** the foundation only. One real conversion, PNG → WebP, working end to end on a static Nuxt 4 site, plus every piece of plumbing that later phases will fill: a typed format registry, an engine interface, a fixture-driven test corpus that runs in Node and in real browsers, a Docker image for self-hosters, and deployment to Netlify. There is no server in Phase 0 and none is needed for any conversion; a later phase adds an optional self-hosted `omsettd`, and the web app should already treat such a server as optional and absent. If Phase 0 is right, every later phase is more registry records and more engines, with no architecture rework.

Build it as if 200 formats are coming, and ship exactly one conversion.

## Starting state

The directory is not empty. It already holds `docs/` (the design doc and this prompt), `brand/` (`og.png`, `og@2x.png`, `og-source.html`), `README.md`, `LICENSE`, and `.gitignore`, committed on `staging`.

- Keep all of them. Build around them.
- Copy `brand/og.png` to `apps/web/public/og.png` unchanged.
- Extend the existing `README.md`; do not replace it. The og:image stays the very first thing in the file, with any badges directly under it.

## Phase 0 scope

**Build:**

1. A pnpm monorepo with `apps/web`, `packages/registry`, `packages/engines`, `packages/detect`, `fixtures/`, `e2e/`. Reserve `apps/server`, `apps/cli`, `apps/desktop` as directories holding only a `README.md` that says what will live there and in which phase.
2. `packages/registry`: typed `Format`, `Capability`, and `EdgeOverride` records; edges **derived** from capabilities, never written by hand; a `Router` that finds the cheapest path between two formats (Dijkstra, max 3 hops, lossless preferred). Three formats registered: `png`, `webp`, `jpeg`. Two capabilities: `canvas` and `vips`, each reading `png` and writing `webp`. JPEG is registered so that a dropped JPEG is named correctly and shown as having no conversions yet; it has no reader or writer in Phase 0.
3. `packages/detect`: format detection by magic bytes using `file-type`, never by extension alone, plus image dimensions read from the header without decoding.
4. `packages/engines`: the `Engine` interface, a `canvas` engine (zero download, browser only) that converts PNG → WebP via `OffscreenCanvas`, and a `vips` engine (`wasm-vips`, browser and Node) behind the same interface. Engines are plain async modules that know nothing about workers.
5. `apps/web`: a single-screen Nuxt 4 + Nuxt UI app. Drop zone, file cards, target picker rendered from the registry, Convert button, result cards with Download. Dark by default. Fully keyboard-operable and screen-reader-announced. Every engine runs in a Web Worker. Deployed to Netlify with COOP/COEP, a Content-Security-Policy in the page, and a second one on its worker scripts.
6. `useServerHealth` composable: fetches same-origin `/config.json` (`{ "server": boolean }`). When `server` is false it does nothing more. When true it probes same-origin `GET /api/health` with a 3 s timeout. It exposes `{ state: 'absent' | 'reachable' | 'unreachable', engines: string[], maxBytes: number | null }`. In Phase 0 nothing consumes it except a footer line. Absent is the normal state and must never produce an error or a toast. There is no field for typing a server URL, anywhere.
7. `fixtures/`: one real PNG (not generated at test time), a Vitest run that puts it through every Node-capable engine, and a Playwright run that puts it through the browser engines in Chromium, Firefox, and WebKit.
8. Docker for self-hosters: `apps/web/Dockerfile` (build stage runs `nuxt generate`; runtime stage is `caddy:2-alpine` serving the static output with the same headers as Netlify) and a root `docker-compose.yml` with the `web` service only, plus a commented-out `omsettd` service block marked `# Phase 4`. `docker compose up` on a clean machine must yield a working PNG → WebP at `http://localhost:8080`.
9. CI: GitHub Actions running lint, typecheck, Vitest, Playwright + axe-core against the built site, and `docker build` of the web image on every PR.

**Do not build:** any other conversion, any preset, the PWA manifest, the Electron app, the CLI, multi-file ZIP download, the Adjust panel, i18n, analytics, a settings page, or native engines inside the Docker image. Leave clear `TODO(phase-1)` markers where they will go.

**Gate:** on the pull request's Netlify Deploy Preview, a stranger can drop a PNG, choose WebP, click Convert, and download a valid WebP, using only a keyboard if they choose, with no request leaving the page's origin (verifiable in DevTools). The same works from `docker compose up` on a clean machine. CI is green. Chris merges the PR into `staging`, checks the staging branch deploy, and releases `staging` to `main` when he chooses; omsett.com then serves the same build.

## Tech stack, pinned

| Layer | Use | Not |
| --- | --- | --- |
| Framework | Nuxt 4 (latest stable), `ssr: false`, `nuxt generate` for a fully static output | No server routes, no Nitro presets, no SSR |
| UI | Nuxt UI v4 (latest), Tailwind v4 underneath, `@nuxtjs/color-mode` via Nuxt UI with `preference: 'dark'` | No other component library; no hand-rolled CSS framework |
| Language | TypeScript, `strict: true`, `noUncheckedIndexedAccess: true`, everywhere including workers | No `any` without a comment explaining why |
| Package manager | pnpm (current stable), exact version pinned in the root `packageManager` field, workspaces, `--frozen-lockfile` in CI | No npm or yarn |
| Node | 24 LTS, declared in `.nvmrc` (the file reads exactly `24`) and in `engines`. Netlify reads `.nvmrc` and `packageManager`, so `netlify.toml` sets neither |  |
| Workers | In `apps/web` only. Vite worker imports: `new Worker(new URL('./x.worker.ts', import.meta.url), { type: 'module' })` with Comlink | No inline blob workers; no worker code inside `packages/engines` |
| Image engines | `OffscreenCanvas` (`canvas`); `wasm-vips` (`vips`) | No `sharp` in the browser bundle (Node-only) |
| Detection | `file-type` (ESM, browser build) | No extension sniffing as the only signal |
| Self-host | Docker: `caddy:2-alpine` serving the static build; Docker Compose at the root | No Kubernetes, no Helm; no server container in Phase 0 |
| Server | None in Phase 0. Phase 4 adds `omsettd` (Hono on Node 24) as a self-host-only image | No Netlify Functions, ever; no public server |
| Tests | Vitest (unit + Node fixtures), Playwright on Chromium, Firefox, and WebKit (the gate flow + browser fixtures), `@axe-core/playwright` |  |
| Lint/format | ESLint flat config with `@nuxt/eslint`, Prettier |  |
| CI | GitHub Actions |  |
| Hosting | Netlify (web); GitHub Releases (desktop, later); GHCR (self-host images) | No DigitalOcean in Phase 0 |

If a pinned choice turns out to be impossible, stop and say so with the reason and an alternative. Do not silently substitute.

## Repository layout

Create this around the existing files. Empty directories get a `README.md` saying what will live there.

```
omsett/
├─ apps/
│  ├─ web/                      Nuxt 4 app (static)
│  │  ├─ app/
│  │  │  ├─ components/         DropZone, FileCard, TargetPicker, TargetTile, ResultCard, TierBadge
│  │  │  ├─ composables/        useConversionQueue, useEngines, usePoliteAnnouncer, useServerHealth
│  │  │  ├─ workers/            engine.worker.ts (Comlink host for packages/engines), thumbnail.worker.ts
│  │  │  ├─ pages/index.vue     the one screen
│  │  │  └─ app.vue
│  │  ├─ public/engines/         self-hosted .wasm files, content-hashed at build
│  │  ├─ public/fonts/           Space Grotesk 500/700, JetBrains Mono 400/500 (woff2, self-hosted)
│  │  ├─ public/config.json      {"server": false}
│  │  ├─ public/og.png           copied from brand/og.png
│  │  ├─ security-headers.ts     the one definition of both policies and every response header
│  │  ├─ scripts/write-headers.ts  post-generate: policy <meta> into the HTML, Netlify _headers, Caddy snippet
│  │  ├─ Dockerfile              build → caddy:2-alpine serving the static output
│  │  ├─ Caddyfile               imports the generated header snippet
│  │  ├─ nuxt.config.ts
│  │  └─ package.json
│  ├─ server/README.md          reserved: omsettd, Phase 4, self-host only
│  ├─ cli/README.md             reserved: npx omsett, Phase 3
│  └─ desktop/README.md         reserved: Electron shell (electron-vite + electron-builder), Phase 3
├─ packages/
│  ├─ registry/
│  │  ├─ src/types.ts            Format, Capability, EdgeOverride, Edge, Route, Tier, Trait, Warning
│  │  ├─ src/formats/            one file per format: png.ts, webp.ts, jpeg.ts
│  │  ├─ src/capabilities.ts     what each engine reads and writes
│  │  ├─ src/overrides.ts        pair-specific exceptions (empty in Phase 0)
│  │  ├─ src/trait-warnings.ts   one Warning per Trait
│  │  ├─ src/derive.ts           capabilities + formats + overrides → edges
│  │  ├─ src/router.ts           Dijkstra, 3-hop cap
│  │  └─ src/index.ts
│  ├─ engines/
│  │  ├─ src/types.ts            Engine interface
│  │  ├─ src/canvas/             browser only
│  │  ├─ src/vips/               wasm-vips, browser and Node
│  │  └─ src/index.ts            engine table + lazy loader
│  └─ detect/
│     └─ src/index.ts            magic-byte detection, header dimensions
├─ fixtures/
│  ├─ png/sample.png             a real file, committed
│  └─ fixtures.test.ts           Node-capable engines × fixtures
├─ e2e/
│  ├─ gate.spec.ts               the Phase 0 gate, in Playwright, with axe
│  └─ fixtures.spec.ts           browser engines × fixtures, three browsers
├─ .github/workflows/
│  ├─ ci.yml                     lint, typecheck, test, e2e + axe, docker build
│  └─ release.yml                on tag: push omsett-web image to GHCR
├─ brand/                         existing; leave as is
├─ docs/                          existing; leave as is
├─ docker-compose.yml             homelab: web :8080 (omsettd block commented, Phase 4)
├─ netlify.toml
├─ pnpm-workspace.yaml
├─ package.json                   root scripts: dev, build, test, lint, typecheck
├─ tsconfig.base.json
├─ .nvmrc                         24
├─ LICENSE                        existing, MIT
├─ THIRD-PARTY-NOTICES.md         every shipped engine and library: license, version, source link
├─ AGENTS.md                      this prompt's rules, condensed, for future sessions
└─ README.md                      existing; extend
```

## Architecture rules

These are invariants. A PR that breaks one is wrong even if it works.

1. **The registry is data, and the only place that says what converts to what.** A format is added by adding a `Format` record and a fixture; a conversion is added by listing the format in a `Capability`. Edges are derived. No UI component, composable, or engine may contain a hard-coded format name, extension, or MIME type; they read the registry. That includes the file input's `accept` attribute.
2. **Engines never run on the browser's main thread.** `packages/engines` exports plain async modules with no worker code. `apps/web` runs every one of them inside a Web Worker; the main thread only moves `Blob`s and progress events. In Node (tests now, the CLI later) engines are called in-process.
3. **Engines are lazy.** No `.wasm` is fetched until a conversion that needs it is requested, and the UI shows the download size before the first fetch.
4. **Two tiers, named everywhere the same way:** `browser` (WASM or a native browser API; runs on the public site) and `native` (needs ffmpeg/LibreOffice-class binaries). In Phase 0 `native` exists in the types, the router, and the `TierBadge` component ("needs the desktop app"), exercised by tests against a synthetic registry; no real capability uses it.
5. **Detection by content, not name.** `packages/detect` reads magic bytes. Extension is a hint for the UI label only. A mismatch (a `.png` that is a JPEG) is reported to the user and the detected format wins.
6. **Nothing leaves the origin.** The page makes no request to any other origin, ever, and no request carrying file bytes to its own. This is enforced by `connect-src 'self' blob:` in the page's Content-Security-Policy and again in the policy every worker script carries, not by good intentions, and asserted in the E2E test.
7. **Every engine is tested where it really runs.** Engines whose `runtimes` include `node` run the fixtures in Vitest. Engines that are browser-only run the same fixtures in Playwright. No engine ships with neither.
8. **Accessibility is a build failure, not a review comment.** axe-core violations at `serious` or `critical` fail CI. Every interactive element is keyboard-reachable; every state change is announced.
9. **One screen.** `pages/index.vue` is the whole app in Phase 0. No routing, no modals for the happy path.
10. **A server is optional and absent by default.** `useServerHealth` is the only code that knows a server might exist, and it only ever talks to its own origin. No feature may require a server; a missing or unreachable one is a normal state with no error UI.
11. **Every engine declares its license.** An engine record without `license` and `sourceUrl` fails a registry test, and every engine appears in `THIRD-PARTY-NOTICES.md`.

## Registry and engine contracts

Implement these as written. Extend them only by adding optional fields or union members.

```ts
// packages/registry/src/types.ts
export type Tier = 'browser' | 'native'
export type Category =
  | 'image' | 'vector' | 'pdf' | 'document' | 'spreadsheet' | 'presentation'
  | 'text' | 'data' | 'ebook' | 'audio' | 'subtitle' | 'archive' | 'font' | 'video'

// Things a format can carry. A warning is derived whenever the source has one the target lacks.
export type Trait = 'alpha' | 'animation' | 'metadata' | 'multi-page' | 'layers'

export interface Format {
  id: string                 // 'png'
  name: string               // 'PNG'
  category: Category
  extensions: string[]       // ['png']
  mime: string[]             // ['image/png']
  detect: string[]           // `file-type` ext values that resolve to this format: ['png']
  explain: string            // one paragraph, for the tile tooltip, written for non-experts
  lossy: 'never' | 'always' | 'optional'   // PNG never, JPEG always, WebP optional
  traits: Trait[]            // PNG: ['alpha', 'metadata']
}

export interface Warning {
  id: string                 // 'alpha-lost'
  text: string               // 'Transparency will be flattened to white.'
}

// What one engine can do. This is the only authored statement of what converts to what.
export interface Capability {
  engine: string             // Engine.id
  tier: Tier
  reads: string[]            // Format.id
  writes: WriteSpec[]
  priority: number           // lower is tried first when several engines cover the same pair
}

export interface WriteSpec {
  format: string             // Format.id
  lossy: boolean             // true if the default options lose data
  defaultOptions?: Record<string, unknown>
}

// A pair that needs saying something the reads/writes lists can't.
export interface EdgeOverride {
  from: string
  to: string
  engine?: string            // omit to apply to every engine
  block?: string             // a reason; the pair is not offered
  warnings?: Warning[]       // added to the derived ones
}

// Everything below is derived. Nobody writes one of these by hand.
export interface Candidate {
  engine: string
  tier: Tier
  lossy: boolean
  cost: number               // lossless = 1, lossy = 3, native = +5
  defaultOptions: Record<string, unknown>
}

export interface Edge {
  from: string
  to: string
  candidates: Candidate[]    // ordered by cost, then priority; never empty
  warnings: Warning[]        // trait losses + lossy-to-lossy + overrides
}

export interface Route {
  edges: Edge[]              // 1–3 hops
  tier: Tier                 // 'native' if any hop's first candidate is native
  lossy: boolean
  warnings: Warning[]        // union, deduplicated by id
  totalCost: number          // sum of each hop's first-candidate cost
}

export interface Registry {
  formats: Format[]
  capabilities: Capability[]
  overrides: EdgeOverride[]
  traitWarnings: Record<Trait, Warning>
}

export interface Router {
  targetsFor(fromIds: string[]): Array<{ format: Format; route: Route | null; reason?: string }>
  route(from: string, to: string): Route | null
}

export function createRouter(registry: Registry): Router
```

```ts
// packages/engines/src/types.ts
export type Runtime = 'browser' | 'node'

export interface EngineInfo {
  id: string                 // 'canvas' | 'vips'
  sizeBytes: number          // 0 for canvas; shown as "downloads 8 MB once"
  runtimes: Runtime[]        // canvas: ['browser']; vips: ['browser', 'node']
  maxPixels?: number         // raster engines: the largest decoded image it will accept
  license: string            // SPDX id of the shipped artifact
  sourceUrl: string          // where the exact source for that artifact lives
}

export interface ConvertInput {
  blob: Blob
  name: string               // original file name, for naming outputs
  from: Format
  to: Format
  options: Record<string, unknown>
  signal: AbortSignal
  onProgress: (fraction: number) => void   // 0..1, called at most ~10×/s
}

export interface ConvertOutput {
  name: string               // 'photo.webp'; presets that emit several files name each one
  format: string             // Format.id
  blob: Blob
}

export interface Engine extends EngineInfo {
  available(): Promise<boolean>   // cheap runtime probe; must not download the engine
  load(): Promise<void>           // idempotent; resolves immediately when cached
  convert(input: ConvertInput): Promise<ConvertOutput[]>
}
```

Engines have no `supports()`. What an engine converts is in its `Capability` and nowhere else. A registry test asserts that every `Capability.engine` has an implementation and every implementation has a capability.

**Deriving edges.** For each capability, every `reads` × `writes` pair where the formats differ yields a candidate, unless an override blocks it. Candidates for the same pair are merged into one `Edge`, ordered by cost and then priority. Warnings for an edge are: the `traitWarnings` entry for each trait the source has and the target lacks; a `lossy-to-lossy` warning when the source is `lossy: 'always'` and the first candidate is lossy; and any override warnings.

**Router behavior to test explicitly.** With the real registry: `targetsFor(['png'])` returns WebP with a 1-hop `browser` route whose candidates are `canvas` then `vips`; JPEG with `route: null` and the reason "No converter from PNG to JPEG yet"; PNG with `route: null` and "Already PNG". `targetsFor(['jpeg'])` returns every format with `route: null`. With a synthetic registry built inside the test: a 2-hop and a 3-hop route are found; a 4-hop path is rejected; a lossless route beats a lossy one of the same length; ties break by fewer hops, then `browser` over `native`; a blocked pair is not offered and carries the override's reason; with several inputs, a target is offered only if every input has a route to it.

**Running a route (`useConversionQueue`).** For each hop, take the candidates in order and skip any whose engine does not list the current runtime, whose `available()` resolves false, or whose `maxPixels` is below the image's pixel count. Run the first that remains. If it throws, try the next once; if none succeed, the file gets "This file couldn't be converted" with a Remove button. The engine that ran is recorded on the result (`data-engine` on the `ResultCard`). A `?engine=<id>` query parameter forces one engine, so the E2E suite can exercise each path deliberately.

**The canvas probe.** `canvas.available()` encodes a 1×1 `OffscreenCanvas` with `convertToBlob({ type: 'image/webp' })` and resolves true only if the returned blob's `type` is `image/webp`. Some browsers return a PNG instead of failing; treating that as success would hand the user a mislabeled file.

**Defaults.** Both engines write WebP at quality 80, declared in the capability's `defaultOptions`, so the output does not swing wildly by engine.

**Worker boundary (`apps/web` only).** `engine.worker.ts` exposes the engine table through Comlink. `convert` receives the `Blob` by structured clone and returns `ConvertOutput[]`; progress crosses via a `Comlink.proxy` callback. Abort via `signal` must terminate the worker if the engine can't cancel cooperatively.

## Web app spec (Phase 0)

**One screen, dark, three regions stacked vertically: Drop, Pick, Results.** Max content width 1100 px, centered, 24 px gutters on phones.

**Drop region**

- A large dashed-border zone, min-height 240 px, containing an `<input type="file" multiple>` visually hidden but focusable, a visible button "Choose files", and the line "or drop them here · nothing leaves your device". The input's `accept` is computed from the MIME types and extensions of every registered format; it is not written out.
- Accepts drag-and-drop and clipboard paste (`paste` event with image data).
- On drop: detect each file with `packages/detect`; render a `FileCard` per file (name, size in KB/MB, detected format badge, 64 px thumbnail). A file whose detected format has no registry entry gets a card with "Unsupported format" and a Remove button, not a toast. A registered format with no routes (JPEG in Phase 0) gets its real name and "No conversions for JPEG yet".
- Thumbnails are made in `thumbnail.worker.ts` with `createImageBitmap`, after the pixel guard below has passed, and transferred to the page. No file is decoded on the main thread.
- "Try a sample PNG" button loads the fixture PNG, copied from `fixtures/png/sample.png` into the build output at build time.

**Size and pixel guard**

- Before any decode, read the image's dimensions from its header. A small file can declare an enormous image, so byte size alone protects nothing.
- A file over 500 MB, or an image whose decoded size (width × height × 4 bytes, doubled for working space) exceeds 1.5 GB, is refused with a plain line on its card: "This image is too large to convert in a browser" and a Remove button. No decode is attempted.
- The `canvas` engine declares `maxPixels` of 16,777,216 (4096 × 4096), a size every target browser's canvas accepts; larger images go to `vips`.

**Pick region (`TargetPicker`)**

- Rendered as a `role="radiogroup"` with roving tabindex: the group is one Tab stop, arrow keys move between tiles, Enter/Space selects.
- Tiles (`TargetTile`) are large: min 140×110 px, extension in 28 px monospace, format name below, `TierBadge` top-right. Grouped under a heading for each `Category` that has at least one registered format.
- The picker shows exactly what the registry holds: in Phase 0, WebP, JPEG, and PNG under "Image". There are no placeholder tiles for unbuilt formats. A tile with no route is dimmed (`aria-disabled="true"`) with `aria-describedby` pointing to the router's reason. Dimmed tiles stay in the DOM and are reachable with the arrow keys.
- `TierBadge` text: "on your device" (browser) or "needs the desktop app" (native). Never color alone.
- When no file is dropped, the picker is visible but every tile is dimmed with reason "Drop a file first".

**Convert**

- One primary button, disabled until a file and a target are chosen. Shortcut `Ctrl/Cmd+Enter`.
- Per-file `UProgress`; overall percentage mirrored into `document.title` ("42% — Omsett").
- `usePoliteAnnouncer` (named apart from Nuxt's built-in `useAnnouncer`, which can also speak assertively) writes to a single `role="status"` (`aria-live="polite"`) region: at 25/50/75%, and on completion "1 file converted. Download ready." Nothing uses `assertive`; no part of a conversion is urgent.

**Results region**

- A `ResultCard` per output: the engine-supplied name, size, size delta vs. input ("−63%"), Download button (`<a download>` on an object URL, revoked after click or on unmount), and "Convert another".
- Phase 0: no ZIP, no preview slider. Leave `TODO(phase-1)` comments.

**Theme**

- `color-mode` preference `dark`; background `#0d0d0d`; one accent per `Category` defined once as CSS variables (`--cat-image`, …) so the picker reads as color-coded; body text at least 4.5:1 against the background; focus ring 2 px, offset 2 px, never removed.
- Respect `prefers-reduced-motion`: no progress animation beyond the bar itself.
- Nuxt UI components to use: `UButton`, `UCard`, `UBadge`, `UProgress`, `UTooltip`, `UKbd`. The picker tiles and drop zone are custom components built on plain elements with Tailwind, because no Nuxt UI primitive is a large radio-tile.
- Brand tokens, defined once in `app/assets/css/tokens.css` and nowhere else: `--bg #0d0d0d`, `--ink #f4f4f2`, `--muted #8a8a86`, `--rule #2a2a28`, `--accent #3b6cff` (Omsett blue: wordmark dot, focus rings, primary button, selected tile). Light mode inverts `--bg`/`--ink`; the accent stays. Category accents (`--cat-image` …) are secondary and never used for text.
- Type: Space Grotesk (display and UI labels; `@fontsource/space-grotesk`), JetBrains Mono (anything that is data: extensions, sizes, counts, paths; `@fontsource/jetbrains-mono`), Inter as the body fallback. Fonts are self-hosted under `public/fonts/` with `font-display: swap`; no Google Fonts requests, because the CSP blocks them and the privacy promise forbids them.
- Wordmark: the word `omsett` in Space Grotesk 700 with the trailing period in the accent color, as a text element, not an image. The meaning line — "omsett · Norwegian — to translate; to convert" — appears once, in the footer, in JetBrains Mono.
- Head: `<meta property="og:image" content="https://omsett.com/og.png">` with `og:image:width` 1200, `og:image:height` 630, `og:title` "Omsett — open-source file converter", `og:description` "Drop a file. Pick a format. Nothing leaves your device.", `twitter:card` `summary_large_image`, `theme-color` `#0d0d0d`. The favicon for Phase 0 is a 32 px blue dot on `#0d0d0d` as an SVG; the full pack arrives with the favicon preset in Phase 1.

**Footer:** three short lines — "Open source · Free · Accessible · MIT · GitHub", the meaning line, and the status line — plus a theme toggle. Nothing else. The status line reads "Conversions run on your device." When `useServerHealth` reports `reachable` it reads "Conversions run on your device. Server connected for the rest."; when `unreachable`, "Conversions run on your device. The server isn't answering."

**Insecure context.** If `window.isSecureContext` is false (a self-hosted copy opened over plain `http://` on a LAN address), show one calm line above the drop zone: "This copy of Omsett is being served without HTTPS, so some conversions are unavailable." Engines that need `SharedArrayBuffer` report `available() === false` there and the queue moves on.

## Server (none in Phase 0)

There is no server in Phase 0 and no DigitalOcean work. The only server-related code is `useServerHealth`, which targets this contract so that a Phase 4 self-hosted `omsettd` drops in without UI changes:

- `GET /config.json` → `{ "server": boolean }`. On Netlify this is the static file in `public/`, always `false`. In the Docker image Caddy answers it from the `OMSETT_SERVER` environment variable: `true` when set.
- `GET /api/health` → `200 { ok: true, version: string, engines: string[], maxBytes: number }`. Same origin, always: in the Docker image Caddy proxies `/api/*` to `OMSETT_SERVER`. `engines` lists the native binaries available (`ffmpeg`, `soffice`, `ebook-convert`, `gs`, `pandoc`); `maxBytes` is the per-file cap.
- Everything else is Phase 4 and out of scope. Do not scaffold Hono, PM2, `rebuild.sh`, or a server Dockerfile. `apps/server/README.md` states the contract above and the phase.

Why same-origin only: a page served over HTTPS cannot call an `http://` address on a LAN, and a page that can be pointed at an arbitrary server cannot honestly promise that nothing leaves the device. Putting the server behind the web image's own origin removes both problems, along with CORS.

## Hosting config

```toml
# netlify.toml — build settings only; headers are generated (see below)
[build]
  command = "pnpm --filter web generate && pnpm --filter web write-headers"
  publish = "apps/web/.output/public"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

**Every policy and header is defined once**, in `apps/web/security-headers.ts`, and written after `nuxt generate` by `scripts/write-headers.ts`. The two hosts can then never drift.

**There are two Content-Security-Policies, because a page and a worker are governed separately.** A worker is bound by the policy on its own script's response, not by the page's.

| Policy | Delivered as | Value |
| --- | --- | --- |
| Document | A `<meta http-equiv>` tag written into every built HTML file, directly after the charset declaration | `default-src 'self'; script-src 'self' <hashes>; worker-src 'self' blob:; connect-src 'self' blob:; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'` |
| Worker | A response header on worker scripts only: `/_nuxt/workers/*` and `/engines/*` | `default-src 'self'; script-src 'self' 'wasm-unsafe-eval' 'unsafe-eval'; worker-src 'self' blob:; connect-src 'self' blob:` |

- **Why the worker policy allows `'unsafe-eval'`.** `wasm-vips` builds its call wrappers with `new Function` (Emscripten's embind), which a browser treats as eval. The allowance is confined to the worker that runs libvips. The page itself allows no eval of any kind, not even `'wasm-unsafe-eval'`, because the page never instantiates WebAssembly.
- **Why the document policy is a `<meta>` tag.** A `Content-Security-Policy` header on `/*` would also reach worker scripts, and two policies on one response are both enforced, so the strict one would block libvips. In the HTML, the policy governs the page only, and it travels with the files to any host, including one that cannot set headers.
- **`connect-src 'self' blob:` is in both policies.** It is the directive the privacy promise rests on and is not negotiable. Neither the page nor a worker can send anything to another origin.
- **`<hashes>`** are SHA-256 hashes of the inline scripts in the built HTML (Nuxt's import map, its config script, and the color-mode script), computed by `write-headers.ts`. If hashing proves unworkable, stop and say so; do not fall back to `'unsafe-inline'` for scripts on your own.
- **Workers are emitted under `/_nuxt/workers/`** (`vite.worker.rollupOptions.output.entryFileNames` in `nuxt.config.ts`), so that one path rule covers them. `write-headers.ts` fails the build if a worker script lands anywhere else: a worker served without the header would run with no policy at all.
- **Never add a `Content-Security-Policy` header to `/*`.**

The response headers, written to `.output/public/_headers` for Netlify and to a snippet the `Caddyfile` imports:

| Path | Header | Value |
| --- | --- | --- |
| `/*` | `Cross-Origin-Opener-Policy` | `same-origin` |
| `/*` | `Cross-Origin-Embedder-Policy` | `require-corp` |
| `/*` | `X-Frame-Options` | `DENY` (a `<meta>` policy cannot carry `frame-ancestors`) |
| `/*` | `X-Content-Type-Options` | `nosniff` |
| `/*` | `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `/*` | `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` |
| `/_nuxt/workers/*`, `/engines/*` | `Content-Security-Policy` | the worker policy above |
| `/engines/*` | `Cache-Control` | `public, max-age=31536000, immutable` |
| `/engines/*` | `Cross-Origin-Resource-Policy` | `same-origin` |

COOP/COEP are required for `SharedArrayBuffer`, which multi-threaded `wasm-vips` needs. Verify that `crossOriginIsolated === true` on the deployed site and fail the E2E test if it isn't. All `.wasm` must be served from the same origin under `/engines/`; copy them there at build time with content hashes in the filename. Do not load engines from unpkg or jsDelivr.

`nuxt.config.ts` essentials: `ssr: false`; `nitro.preset: 'static'`; `app.head` with `<title>Omsett</title>`, `theme-color #0d0d0d`, a plain description; `vite.worker.format: 'es'`; `vite.optimizeDeps.exclude: ['wasm-vips']`.

**Docker image.** Caddy listens on `:8080` inside the container (a non-root user with all capabilities dropped cannot bind port 80). The root filesystem is read-only; Caddy's `/data` and `/config` are `tmpfs` mounts, and nothing else is written at runtime. There is no entrypoint script: `/config.json` and the `/api/*` proxy are driven by Caddyfile environment placeholders.

```yaml
# docker-compose.yml
services:
  web:
    image: ghcr.io/cschweda/omsett-web:latest
    build: { context: ., dockerfile: apps/web/Dockerfile }
    ports: ["8080:8080"]
    environment:
      OMSETT_SITE_ADDRESS: ":8080"   # a hostname here makes Caddy serve HTTPS
      # OMSETT_SERVER: http://omsettd:4310   # Phase 4
    read_only: true
    cap_drop: [ALL]
    tmpfs: ["/data", "/config"]
  # omsettd:                          # Phase 4
  #   image: ghcr.io/cschweda/omsettd:latest
```

## Security requirements

- **Untrusted input everywhere.** Every dropped file is hostile until decoded. Dimensions are checked from the header before decoding; decoding happens in a worker, so a crash kills the worker, not the page; catch and surface it as "This file couldn't be read" with a Remove button.
- **Nothing leaves the origin.** Enforced by both policies and by the E2E test (assert that after load there is no request to another origin and no request with a body, that the page's policy contains no eval allowance, and that every worker script arrived with `connect-src 'self' blob:`). There is no code path in `apps/web` that sends a `Blob` anywhere. `useServerHealth` sends only same-origin `GET`s with no body.
- **Object URLs are revoked** after download or on component unmount; no leaked blobs across sessions.
- **No user-supplied URLs.** The app never fetches an address a user typed.
- **Dependencies:** pin exact versions in `package.json` for engines (`wasm-vips`, `file-type`); run `pnpm audit --prod` in CI and fail on `high`. Verify `.wasm` integrity by comparing a build-time SHA-256 before instantiation.
- **Licenses:** every engine record carries `license` and `sourceUrl`; `THIRD-PARTY-NOTICES.md` lists each shipped engine and library with its license, version, and source link. Do not copy code, data files, or schemas from VERT (AGPL-3.0) into this MIT repo; Filee (MIT) may be ported with attribution.
- **Docker image:** non-root user, read-only filesystem, `cap_drop: [ALL]`, `HEALTHCHECK` against `/`, no secrets baked in.
- **Secrets:** none in Phase 0. If one appears, it lives in Netlify environment variables, read by name, never committed.
- **Supply chain for engines later:** `engines.json` (Phase 3) pins URLs and SHA-256 for every native binary the desktop app may download, Filee-style. Not built now; design the registry so an engine record can carry it.

## Environment variables

| Name | Where | Default | Purpose |
| --- | --- | --- | --- |
| `NUXT_PUBLIC_SITE_URL` | Netlify | `https://omsett.com` | Canonical URL for meta tags |
| `NUXT_PUBLIC_COMMIT` | Netlify (from `COMMIT_REF`) | `dev` | Shown in the footer tooltip |
| `OMSETT_SITE_ADDRESS` | Docker `web` container | `:8080` | Caddy's site address. A hostname turns on HTTPS, which any address other than `localhost` needs |
| `OMSETT_SERVER` | Docker `web` container | empty | Upstream omsettd for the `/api/*` proxy; empty means no server, which is the normal state |

No `.env` files are committed. Provide `.env.example` in `apps/web` listing these with comments.

## Definition of done

Phase 0 is complete only when every box in the first two lists is checked. Run them yourself before saying it's done; paste the results. The third list is Chris's: hand it to him, unchecked.

**Automated (CI must be green)**

- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass from a clean clone with `--frozen-lockfile`.
- [ ] `fixtures/fixtures.test.ts`: `sample.png` → WebP through `vips` in Node produces a WebP with identical width and height and a smaller byte size.
- [ ] `e2e/fixtures.spec.ts`: the same fixture converts in Chromium, Firefox, and WebKit with the default engine, and in Chromium with `?engine=vips`. Each output's bytes start with `RIFF…WEBP` and its dimensions match the input. The test logs which engine ran in each browser.
- [ ] Registry tests: the real-registry and synthetic-registry router cases listed under "Router behavior to test explicitly"; every capability has an engine and every engine a capability; every engine has `license` and `sourceUrl`.
- [ ] Detection tests: a JPEG renamed `.png` is detected as JPEG; an empty file and a 10-byte garbage file return `unknown` without throwing; a small PNG whose header declares 30000 × 30000 is refused by the pixel guard with no decode attempted.
- [ ] `useServerHealth` tests: `server: false` → `absent` with no further fetch; `server: true` with `/api/health` unreachable → `unreachable` after the timeout with no thrown error; a mocked `/api/health` → `reachable` with parsed `engines` and `maxBytes`.
- [ ] Playwright `gate.spec.ts` against the built static site: drop fixture → focus the picker with Tab → reach WebP with arrow keys → select → `Ctrl+Enter` → download link appears → downloaded bytes start with `RIFF…WEBP`. After load: no request to another origin, no request with a body, no CSP violation in the console, `crossOriginIsolated === true`; the page's policy allows no eval; every worker script response carries the worker policy.
- [ ] Keyboard order in Playwright: Tab reaches, in order, Choose files, the picker (one stop), Convert, Download, the footer controls; arrow keys reach every tile, dimmed ones included; the focused element always has a visible outline.
- [ ] axe-core on the loaded page and after conversion, in dark and in light mode: zero `serious` or `critical` violations.
- [ ] At a 375 px viewport: `document.documentElement.scrollWidth` does not exceed the viewport width.
- [ ] `pnpm audit --prod` reports no `high` or `critical`.

**Run locally by you, results pasted**

- [ ] `docker compose build && docker compose up -d`: `http://localhost:8080` serves the app with `crossOriginIsolated === true` and PNG → WebP works; `docker inspect` shows a non-root user and a read-only root filesystem.
- [ ] The PR's Deploy Preview URL passes `gate.spec.ts` when the suite is pointed at it.

**For Chris (you cannot do these; do not mark them)**

- [ ] VoiceOver or NVDA announces: file added with its format; the selected target; progress at 25/50/75; completion with count.
- [ ] A real phone: tiles wrap, the drop zone is tappable, a photo converts.
- [ ] A 50 MB PNG converts without the tab dying.
- [ ] Safari on a Mac: the conversion yields a real WebP (the result card shows which engine ran).
- [ ] Merge the PR into `staging` when satisfied; release `staging` to `main` separately, when ready to spend a production build.

**Documentation**

- [ ] `README.md`, extended in place with the og:image still first: how to run it locally in three commands, how to add a format (points at registry + fixture), how to deploy.
- [ ] `AGENTS.md`: the Architecture rules and Working agreements from this prompt, condensed, so the next Claude Code session inherits them.
- [ ] `THIRD-PARTY-NOTICES.md`: wasm-vips (and the libvips libraries inside it), file-type, Comlink, Nuxt UI, the fonts, each with license, version, and source link; and a line crediting Filee (MIT) for the routing and preset-availability design.
- [ ] `CHANGELOG.md` with a `0.1.0` entry: "Phase 0: PNG → WebP in the browser."

## Working agreements

- **Start by restating the plan** in ten lines or fewer, then build. Don't ask permission to begin.
- **Decide small things; ask about big ones.** Component names, file layout inside a package, test structure: decide and move. Anything that changes the public shape (the contracts above, the registry schema, the tier names, the URL structure, the CSP, a dependency not in the pinned list): stop and ask with a recommendation.
- **Work on a `phase-0` branch and open one pull request into `staging`** (`gh pr create --base staging`). Push the branch as you go; the PR's Deploy Preview is where the work is checked. Never push to `main`, never open or merge a PR into `main`, and never merge into `staging` without being told to. A production build costs Netlify credits and happens only when Chris says so, as one merge-commit PR from `staging` into `main`.
- **Commit in small, labeled steps:** `feat(registry): …`, `feat(web): …`, `chore(ci): …`. Each commit builds and passes tests. No `Co-Authored-By` line and no other AI attribution trailer on any commit.
- **Never weaken a test to make it pass.** If a test is wrong, say so and propose the fix; if the code is wrong, fix the code.
- **Never report a check you did not run.** If you cannot run something (a screen reader, a physical phone), say so and leave it on Chris's list.
- **No placeholder content in the UI.** No lorem ipsum, no tiles for formats that aren't registered, no sample conversions that aren't real.
- **Explain the format** field is real copy: write the `explain` paragraph for PNG, WebP, and JPEG as a thoughtful editor would for a non-technical writer, not as a spec.
- **When something pinned won't work**, stop, state the problem in two sentences, offer one alternative with its trade-off, and wait.
- **Report at the end** with: the PR and Deploy Preview URLs, the Definition-of-done checklist with results, Chris's list, anything deferred with a `TODO(phase-1)` reference, and the three things you'd want Chris to look at first.
- **Tone:** plain, short, no cheerleading. Chris has an MFA; he'll notice.
