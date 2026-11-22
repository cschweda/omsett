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
   wins over the extension.
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
  `tokens.css`, rules instead of boxes, square corners, no shadows, no second typeface. Blue is
  the accent; red means something went wrong or cannot be done; green means ready, or new. Tokens live in `tokens.css` only.
- **Tone:** plain, short, no cheerleading.
