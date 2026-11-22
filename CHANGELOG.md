# Changelog

Every change to Omsett is recorded here, newest first, in the same pull request that makes it.
Changes not yet given a version number go under a heading named "Unreleased" at the top.

The paragraph that opens a version is its teaser: the home page shows its first three sentences
in the "What's new" banner, so keep it to two or three sentences on what a visitor will notice.
A line beginning "Released" gives the date.

## 0.7.0

Released 22 November 2026.

Omsett now reads Photoshop files, Windows icons, JPEG 2000, BMP and QOI, and writes BMP and QOI.
A Photoshop file comes out as the finished picture with its layers merged; an icon comes out at
its largest size.

### Added

- **PSD, ICO, JPEG 2000, BMP and QOI as sources; BMP and QOI as targets.** They are read by
  ImageMagick, compiled for the browser. It is large (15.5 MB, about 5.5 MB as sent), so it is
  fetched only when one of these formats is involved, and the picker says so first.
- ImageMagick is always told which format it is reading, from the file's contents, and is never
  left to guess.
- Nine trap files: each of the five formats cut off halfway, an icon that points outside its own
  file, and a BMP, a QOI and a Photoshop file that state an impossible size.

### Known

- ICO, PSD and JPEG 2000 are read but not written.
- A file with altered pixel data but a whole structure converts, as an altered picture: these
  formats carry no checksum.

## 0.6.0

Released 22 November 2026.

Omsett now reads SVG and draws it as a PNG, JPEG, WebP or any other format it writes. Text in
the file is drawn in Inter, and nothing the file links to is fetched.

### Added

- **SVG, as a source.** resvg draws the file to a PNG and any other format follows in a second
  step. The engine is 2.5 MB, fetched only when an SVG is dropped. No script in the file runs,
  no link is followed, and what each conversion leaves out is said in the picker.
- **SVG is recognised by its contents**: it is text, with no signature, so the root element is
  read. A web page named `.svg` is not taken for one.
- Six trap files for SVG: an unfinished file, a stated size of forty thousand megapixels, shapes
  that multiply themselves a hundred million times, a shape that draws itself, a web page named
  as an SVG, and three older traps now read as the SVGs they are.

### Known

- **Text in an SVG is always drawn in Inter**, in Latin letters only. A browser tab has no
  fonts to lend, so the font the file names is not used, and other scripts are not drawn.
- An SVG sized in millimetres or inches converts, but its size is not shown before converting.
- SVGZ, the compressed form, is not read yet.

## 0.5.0

Released 22 November 2026.

Omsett now reads HEIC, the format an iPhone saves photographs as, and turns it into any of the
other seven. The decoder is downloaded only when a HEIC file is dropped.

### Added

- **HEIC, as a source.** libheif decodes the picture, Omsett writes it as a PNG, and any other
  format follows from there in a second step. The engine is 1.5 MB, fetched and checked against
  its recorded hash only when needed. HEIC is not offered as a target.
- **An off switch for a format**, in `packages/registry/src/switches.ts`. One line removes a
  format from the picker, the file chooser, the lists on the information pages and the engines;
  a file of that format is then named and told why. HEIC has one, because HEVC is patented.
- A trap file: a HEIC cut off halfway through. It is refused.

### Known

- **A HEIC whose compressed data is altered, but whose structure is whole, is not always
  refused.** HEVC carries no checksum, so the decoder cannot tell and returns a damaged picture.
  A file cut short is refused.
- HEIC has been tested with a small generated sample, not yet with photographs from a phone.

## 0.4.0

Released 22 November 2026.

Omsett now reads and writes AVIF and JPEG XL, which makes seven image formats and forty-two
conversions. The comparison can be zoomed with the mouse wheel and dragged around, and the
quality slider beside it changes the picture as it moves. The extra download each new format
needs is fetched only by someone who asks for it.

### Added

- **AVIF and JPEG XL**, as sources and as targets. Each is read by libvips with an optional
  module (3.8 MB for AVIF, 2.2 MB for JPEG XL), fetched and checked against its recorded hash
  only when a conversion needs it. Converting between the two goes through a lossless step.
- Four trap files: a truncated and a corrupted file for each new format. Both are refused.
- `docs/format-roadmap.md`: every format Omsett means to handle, where it will run (the
  browser, the desktop app, or not at all), and where it stands.
- A format can be marked read-only in the registry, with the reason shown in the picker.
- **The comparison can be zoomed and panned.** Scroll over it to zoom toward the pointer, up to
  eight times; drag to move around once zoomed; or use the buttons above it. Past twice life
  size the pixels are shown as they are.
- **Quality can be changed beside the comparison**, and the picture follows as the slider moves.
- The "What's new" label in the banner is a link to the list.

### Known

- Writing AVIF is slow next to WebP: several seconds for a large photograph.

## 0.3.0

Released 22 November 2026.

Omsett now converts between five image formats: PNG, JPEG, WebP, GIF and TIFF, twenty
conversions in all. Drop a file and it shows what that file can become, with the likeliest
choices set large and what each one costs written beneath it. A damaged file is now refused in
every browser, where some used to return half a picture.

### Added

- **JPEG, GIF, and TIFF**, as sources and as targets, alongside PNG and WebP. Every pair
  converts, in every browser.
- **A picker that follows the file.** Before a file is dropped it lists what Omsett handles.
  After, the first four formats the file can become are set large, and the rest are listed
  beneath, with a field to filter them once the list is long.
- **What each conversion loses is derived for every pair**: transparency flattened to white,
  colours reduced to 256, animation and extra pages dropped, and metadata always removed.
- **A structural check for PNG**, run before a browser is allowed to decode the file.
- Dependabot, to keep pinned images, actions, and dependencies current.

### Changed

- **Only PNG is decoded by the browser itself**, and only after Omsett has verified the file.
  JPEG, WebP, GIF, and TIFF are read by libvips, which costs a 5 MB download once and treats a
  damaged file as an error.
- A transparent picture converted to a format without transparency gets a white ground.
- An engine checks a picture's real size as soon as it knows it, in case the header lied.
- A preview that cannot be drawn (a browser cannot display a TIFF) is no longer reported as a
  problem with the file.
- The "What's new" banner marks its label with a green underline in place of a full-width rule.
- The comparison's divider is now plainly a control: a blue line with a round, arrowed handle,
  which slides a little each way once when the comparison first appears.
- Diagrams on the Technical details page are centered.
- The readiness mark in the navigation is green when the browser can convert and red when it
  cannot.
- The self-host image's base images are pinned by digest, and the deployment guide checks nvm's
  installer against a hash before running it.

### Fixed

- **Some browsers turned a damaged PNG into a partial picture** (Firefox, and WebKit on Linux).
  Open since the first review as OMS-005; now closed. All 53 trap files have one required
  outcome in every browser.

## 0.2.0

Released 22 November 2026.

Omsett has a new look, set in one typeface on a strict grid, and is live at omsett.com. You can
now compare a picture before and after converting and choose its quality, and metadata such as
author and location is always removed. New pages explain how it works and record every
security audit.

### Added

- **A "What's new" banner** at the top of the converter: two or three sentences on the latest
  version, leading to the full list. It can be dismissed, and returns with the next version.
- **The version number in the footer**, linked to that version's entry in What's new.
- **A Security page**, and `SECURITY.md`, recording every audit: what was looked for, what was
  found, each finding's severity, how it was identified, and how it was dealt with. Newest
  first, the latest open and the rest collapsed. The page, the file, and the README's Security
  section are all generated from one record, `security/audits.json`.
- **Time limits.** A conversion that runs past its budget (30 seconds, plus 3 per megapixel, at
  most 10 minutes) has its worker stopped and is reported as having taken too long. Previews
  have a 20-second limit.
- **23 more trap files**, adversarial ones: an XML entity bomb, a file that is a GIF and a
  script at once, payloads hidden in metadata, sizes that overflow, palette indexes outside
  their palette, a colour profile that expands to 64 MB. 53 traps now run in every test.
- A limit of 100 files per session, with a notice when more are dropped.
- `pnpm dev:lan` and `pnpm dev:lan:https` serve the development build to other devices on the
  network.
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

- **Metadata is always removed from converted files**, whichever engine does the work, and the
  picker says so before converting.
- Download names are cleaned: no folders, no invisible direction-changing characters, no
  control characters, at most 120 characters.
- The site now sends `Strict-Transport-Security`, so browsers insist on HTTPS.
- Settings read from the address bar (`?engine`, `?timeout`) are honored on localhost only.
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

- **libvips copied EXIF and XMP metadata into its output; the browser's encoder did not.** What
  leaked depended on the visitor's browser. Found in the red/blue audit of 22 November 2026.
- Nothing limited how long a conversion could run, so a file that hung an engine hung the page.
- A link with `?engine=anything` made every conversion fail for whoever opened it.
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
- In Firefox, and in WebKit on Linux, some damaged PNGs still converted to a partial picture,
  because the browser's own decoder forgave them. Fixed in 0.3.0.
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
