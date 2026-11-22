# AGENTS.md

Rules for anyone, human or agent, working in this repository. They are condensed from
[`docs/01-kickoff-prompt-phase-0.md`](docs/01-kickoff-prompt-phase-0.md); the design is in
[`docs/00-high-level-design.md`](docs/00-high-level-design.md).

Omsett is an open-source file converter. Every conversion that can run in the browser runs
there, so files never leave the device.

## Commands

```
pnpm install         # also copies engine binaries, fonts, and the sample file into apps/web
pnpm dev             # the app at http://localhost:3000
pnpm test            # Vitest: registry, router, detection, fixtures through Node engines
pnpm build           # static site + generated headers and policies → apps/web/.output/public
pnpm e2e             # Playwright against the built site, in Chromium, Firefox, WebKit
pnpm lint && pnpm typecheck
docker compose up --build   # the self-host image at http://localhost:8080
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
9. **One screen.** `pages/index.vue` is the whole app.
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
- **Trap files** (`fixtures/_traps/`, listed in `manifest.json`) run in both test suites. A new
  failure mode gets a trap; add it in `fixtures/_tools/make-traps.py`.
- **libvips forgives damaged files unless told not to.** The engine loads with
  `fail_on: 'error'`. Do not remove it.
- **A canvas has a size limit**; `maxPixels` on the engine sends larger images to libvips.

## Working agreements

- **Branches and deploys.** Work on a feature branch and open a pull request into `staging`
  (`gh pr create --base staging`). Never push to `main`, never open or merge a PR into `main`,
  and never merge into `staging` without being told to. A production build costs Netlify credits
  and happens only on Chris's word, as one merge-commit PR from `staging` into `main`.
- **Changelog.** Every change goes into `CHANGELOG.md` under "Unreleased", in the same pull
  request that makes it: added, changed, fixed, or known. A release renames that section.
- **Commits** are small and labeled (`feat(registry): …`, `fix(web): …`, `chore(ci): …`), and
  each builds and passes tests. No `Co-Authored-By` line and no other AI attribution trailer.
- **Decide small things; ask about big ones.** Anything that changes the public shape (the
  contracts in `packages/*/src/types.ts`, the registry schema, tier names, URL structure, the
  security policies, a new dependency): stop and ask, with a recommendation.
- **Never weaken a test to make it pass**, and never report a check you did not run.
- **No placeholder content in the UI.** No tiles for formats that are not registered.
- **`explain` is real copy**, written for a non-technical reader.
- **README:** the og:image is the first thing in the file, with any badges directly under it.
- **Tone:** plain, short, no cheerleading.
