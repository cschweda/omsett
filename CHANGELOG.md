# Changelog

Every change to Omsett is recorded here, newest first, in the same pull request that makes it.

## Unreleased

### Added

- **A new look.** The interface is redrawn in the Swiss manner: one typeface, a twelve-column grid
  with a label column, rules instead of boxes, and the format picker set as large type. Three
  numbered bands follow the three moves: files, format, result.
- **About, Technical details, What's new, and Status pages**, reachable from a navigation at the
  top and bottom of every page, along with the GitHub repository, the changelog, and a
  light/dark switch.
- **Technical details describes the build it is part of.** Its figures (formats, conversions,
  engines, trap files, samples) and its tables are read from the registry and the repository at
  build time, and it draws three diagrams of how a conversion works.
- **What's new is this changelog**, parsed at build time, so the two cannot differ.
- **Status reports on the visitor's own browser**: whether it is secure and isolated, which
  engines it can run, and which conversions work. The navigation shows the result at a glance.
- Badges in the README, including the deployment status.
- **Compare slider.** After a picture is converted, the result shows the original and the
  converted file one over the other, with a divider to drag between them.
- **Quality setting.** Targets whose encoder has one (WebP) show a quality slider, defaulting to
  80. Moving it after a conversion converts again, so the comparison and the file size follow.
- **Sample images** in 28 formats, and a set of sound edge-case files, under `fixtures/`.
- **Trap files.** 30 images that are broken, hostile, or lying, each in one deliberate way, with a
  manifest of what must happen to each. They run in the Node tests and in all three browsers.
- **Size limits per format.** A format can declare the largest picture it holds; a picture too
  large for its target is refused with the reason before any work is done.

### Changed

- **Typeface.** Helvetica Neue where a device has it and self-hosted Inter where it does not,
  replacing Space Grotesk and JetBrains Mono. Figures line up through tabular numerals.
- **Dark is the default on every page**, charts and tables included; light is one click away
  and is remembered.
- **The og:image** is redrawn in the new typeface. The tagline is unchanged.
- Errors are shown in a signal red; information is not.
- Each page is published as its own HTML file, each carrying the security policy.
- **Hosting moves to the DigitalOcean droplet, behind nginx.** The build now also writes its
  headers as an nginx snippet, `scripts/publish-static.sh` builds and switches to the new build
  in one step, and `docs/deploy-digitalocean.md` has the setup. CI runs the conversion tests
  through the reference nginx config.
- `scripts/publish-static.sh` switches to the Node version in `.nvmrc` when nvm is installed,
  for that deploy only, and reports which Node it built with.
- The deployment guide explains pinning nvm's default to the system Node, so other sites on the
  server are not moved to a new Node by an Omsett deploy.
- The deployment guide now covers Forge's "Zero downtime deployments" setting (leave it off) and
  where the web directory is set.
- **No staging branch.** Deploys on the droplet cost nothing, so changes go to `main`.
- Accessibility audits, the axe gate, and screen reader testing move to a final phase. Their
  tests are parked, not deleted.
- The Content-Security-Policy is now two policies: a strict one in the page, and one on worker
  scripts that permits the eval libvips needs. Both forbid sending anything to another origin.
- GitHub Actions are pinned to commit SHAs.

### Fixed

- A browser that could not start the conversion worker showed an error overlay. It now reports
  plainly that conversions are unavailable there.
- **A deploy took the live site down.** On Linux, `scripts/publish-static.sh` did not switch to
  the new build on any publish after the first; the site stayed on the first build until pruning
  deleted it, and then every page was a 404. The switch now uses an atomic rename, the script
  refuses to report success or prune unless the site really points at the new build, and pruning
  never removes the live one. CI now publishes five times in a row and checks the result.
- Workers were refused by the browser under `pnpm dev`, so nothing converted in development.
- libvips converted damaged files into partial pictures without saying so. Damage is now an error.
- Some libvips failures were thrown as raw WebAssembly exceptions and could not be reported.
- Chrome returned a shrunken WebP for a picture wider than WebP allows, and reported success.
- A PNG whose first chunk is not a header had other bytes read as its size.
- The release workflow could not have built its arm64 image: emulation was not set up.

### Known

- Under `pnpm dev`, Nuxt's own restart (after editing its config or installing a package) drops
  the isolation headers, and nothing converts until the dev server is restarted by hand.
- In Firefox, and in WebKit on Linux, some damaged PNGs still convert to a partial picture,
  because the browser's own decoder forgives them. See `fixtures/README.md`.
- In Safari under `pnpm dev` only, thumbnails and the comparison do not appear. The built site is
  not affected.

## 0.1.0

Phase 0: PNG → WebP in the browser.

- One screen: drop a PNG, choose WebP, convert, download. Keyboard-operable throughout, with
  each step announced to screen readers.
- A format registry in which each engine declares what it reads and writes; conversion routes
  and fidelity warnings are derived from that.
- Two engines behind one interface: the browser's own canvas encoder, and libvips
  (`wasm-vips`) where the browser cannot encode WebP itself.
- Files are identified by their contents, not their names, and an image too large to decode
  safely is refused from its header alone.
- Nothing leaves the origin: enforced by a Content-Security-Policy on the page and on every
  worker, and checked in the browser tests.
- A self-host image (`omsett-web`, Caddy) and `docker-compose.yml`.
- Tests: the PNG fixture through libvips in Node, and through each browser's own engine in
  Chromium, Firefox, and WebKit.
