# Changelog

Every change to Omsett is recorded here, newest first, in the same pull request that makes it.
Changes not yet given a version number go under a heading named "Unreleased" at the top.

The paragraph that opens a version is its teaser: the home page shows its first three sentences
in the "What's new" banner, so keep it to two or three sentences on what a visitor will notice.
A line beginning "Released" gives the date.

## 0.16.0

Released 23 November 2026.

Omsett now converts address books and calendars. Turn the contacts exported from a phone
(vCard) into a spreadsheet, or a spreadsheet of names and emails into contacts a phone can
import. The same goes for calendar files (iCalendar) and tables of events.

### Added

- **vCard, read and written.** Each contact becomes a row with plain columns: name, given
  name, family name, organization, title, email, phone, address, url, birthday, note. All
  three generations of the format are read, the oldest with its own way of writing accents.
- **iCalendar, read and written.** Each event becomes a row: summary, start, end, whether it
  is all day, time zone, location, description, organizer, attendees, and the rule it repeats
  by.
- **Both convert to and from every data format**: CSV, TSV, JSON, JSON Lines, YAML, TOML, XML.
- **Columns are found under the names people and programs use.** "First Name", "E-mail 1 -
  Value" and "Mobile Phone", as Google and Outlook export them, are recognised.
- **Dates are never guessed.** A date such as 11/12/2026 means one day in the United States
  and another in Europe, so it is refused, with the form to use: 2026-11-23 or 2026-11-23 14:30.
- **Nothing in a cell can start a new contact or event.** Line breaks, commas and semicolons
  in a value are escaped on the way out. A table written to break out of its row produces one
  contact, with an odd name.
- 27 trap files: contacts and events opened and never closed, one inside another a thousand
  deep, a contact with five thousand email addresses, a note folded over two hundred thousand
  lines, an event that repeats every second forever, a calendar that fetches from another
  site, and tables written to inject records.

### Fixed

- **A table whose first row has a line break inside a cell was not recognised** unless it was
  named `.csv`. Rows are now counted by where their quotes close, not by lines.

### Known

- Photos in contacts are left out, as are details beyond the usual ones.
- A contact's address is kept as one line. Written back to vCard it goes in the street field.
- Reminders and time-zone rules are not carried. A time zone is kept by name.
- A repeating event is one row with its rule as text ("FREQ=WEEKLY;BYDAY=MO"); its dates are
  not written out one by one.
- An address book cannot become a calendar, or the reverse.

## 0.15.0

Released 23 November 2026.

Omsett now converts fonts: TTF, OTF, WOFF and WOFF2. Turn a font into the small WOFF2 a website
needs, or unwrap a web font back into a file a computer can install. The letters themselves are
never touched, so nothing about how the font looks can change.

### Added

- **Four font formats: TTF, OTF, WOFF, WOFF2.** A font is a set of tables, and these are four
  ways of wrapping them. Converting moves the tables from one wrapping to another, exactly.
  A TTF wrapped as WOFF and unwrapped again is the same file, byte for byte.
- **TTF, OTF and WOFF need nothing downloaded**: the code is Omsett's own. WOFF2 uses Google's
  own packer, about 1 MB, fetched the first time a conversion needs it.
- **Fonts are checked before they are believed.** Every table must lie inside the file and
  match the checksum the font gives for it, and nothing is unpacked past the size it stated. A
  font with a single byte changed is refused, and told apart from one that is simply not a
  font.
- **The picker says what matters**: check that the font's licence allows web use; and a web
  font unwraps to TTF or to OTF depending on how its letters are drawn, so if one is refused,
  choose the other.
- 31 trap files for fonts: a table packed from 64 MB into 60 KB that claims to be a few hundred
  bytes, a table said to be four gigabytes, a table list that points outside the file and one
  that points at itself, the same table listed twice, a script added after the font, a font
  with every checksum right and no letters, and fonts of one kind named as another.

### Changed

- **A conversion that is ruled out is ruled out by any road.** TTF to OTF is not offered,
  because it means redrawing every letter; before this, the app would have found a way round
  through WOFF and produced a file with the wrong name.

### Known

- **TTF to OTF and OTF to TTF are not done.** The two draw letters differently, and changing
  one into the other is drawing, not converting.
- A font whose checksums are wrong is refused, even if a browser would have used it. Some old
  fonts are like this.
- Font collections (TTC) and EOT are not read.
- The extra description a few WOFF files carry (a block of XML about the font) is not copied.
  Everything in the font itself, its name and licence included, is.
- There is no preview of the letters yet.

## 0.14.0

Released 23 November 2026.

When you turn Markdown into a web page, you can now say what language it is written in. The
page is marked with it, so a screen reader reads it in the right voice. The choice starts at
your browser's own language.

### Added

- **A language choice for Markdown to HTML**, with 31 languages, each under its own name. It
  appears only for this conversion.
- **Languages written right to left are marked as such**: Arabic, Hebrew, Persian and Urdu
  pages get `dir="rtl"` as well.
- Changing the language after converting converts again, and the side-by-side view follows.

### Changed

- The page is no longer always marked as English. The language offered first is the browser's.

## 0.13.0

Released 23 November 2026.

While files convert, Omsett now shows that it is working. Each file's bar has a band of light
moving across it and a line saying what is happening, and a batch says which file it is on:
"Converting 2 of 5, 14 s".

### Added

- **A sign of life on every bar.** A band of light crosses the bar of the file being worked on,
  whether or not the bar itself has moved. Converters can only say how far they have got at a
  few points, and until now the bar stood still between them.
- **Each file says where it stands**: "Waiting", "Getting the converter (15 MB, once)", or
  "Converting", with a count of seconds once there are more than a couple.
- **A bar for the whole batch**, beside the Convert button, with the file it is on and the time
  so far.
- With motion turned down in the device's settings, the band stands still and the count of
  seconds is what moves.

### Changed

- The progress bar is Omsett's own, replacing the library's, so that it can show activity.

## 0.12.0

Released 23 November 2026.

Omsett now converts Markdown to HTML and HTML to Markdown. Drop a web page and get clean
Markdown for a content system, or drop Markdown and get a complete page a browser can open.
Headings, lists, tables, links, pictures and their descriptions are carried across.

### Added

- **Markdown to HTML.** A whole page: a title taken from the first heading, tables, task
  lists, footnotes that link both ways, and code blocks. HTML written inside the Markdown is
  kept where it is harmless.
- **HTML to Markdown.** The content of a page: headings, paragraphs, lists, tables, links,
  pictures and code. The page's head, styles, scripts and templates are left out, text and all.
- **Nothing that could run is written, in either direction.** Scripts, handlers such as
  `onclick`, frames, forms, and links that are code (`javascript:` and its spellings) are
  removed. The words they were attached to are kept.
- **What a picture is described as is kept**: `alt` text goes across both ways.
- **The side-by-side view covers both**, so the Markdown can be read beside the page it came
  from before it is downloaded.
- 25 trap files for the two formats: scripts and handlers in Markdown, six spellings of a link
  that is code, a heading that tries to close the page's title and start a script, a page that
  posts a password elsewhere, nine places a browser runs code from, nesting ten thousand deep
  in both formats, and floods of brackets, emphasis marks, attributes and unclosed comments.

### Changed

- **A web page is now recognised as HTML**, whatever it is named. Before, it showed as
  unsupported.
- **A file named `.md` or `.markdown` is Markdown.** Any text at all is Markdown, so nothing in
  a file can say that it is; the name is the only thing that can. A picture named `.md` is
  still a picture.

### Fixed

- A Markdown list nested a thousand levels deep took about 24 seconds to read. A trap file
  found it. Nesting that deep is now refused at once, with "This file is nested too deeply to
  convert".
- Nesting deeper than 256 levels is refused in both formats by a stated limit, the same in
  every browser. A first version left it to the browser to run out of room, and one browser
  on one operating system did not.

### Known

- **A page made from Markdown is marked as English** (`lang="en"`), because Markdown does not
  say what language it is in and a page must. A language choice arrived in 0.14.0.
- A page made from Markdown has no styling of its own: it looks the way a browser shows plain
  HTML.
- HTML to Markdown keeps everything in the page's body, navigation and footers included. It
  does not try to find "the article".
- Pictures are kept as links to where they were. They are not downloaded or embedded.
- Only Markdown and HTML so far. Plain text, reStructuredText and the rest are planned.

## 0.11.0

Released 23 November 2026.

After converting a data or subtitle file, you now see the start of the original and the start
of the converted file next to each other, so you can check what became of it before you
download. Pictures keep their before-and-after slider.

### Added

- **A side-by-side view for data and subtitles.** The first 200 lines of each file, with line
  numbers, in a fixed-width typeface so columns and indentation line up. On a narrow screen the
  two are stacked. Where a file goes on past what is shown, a line says so.
- **File contents are always shown as text.** A file full of HTML or script is displayed, never
  run, and characters that are invisible or that reverse the direction of a line are shown as a
  mark. Tested in three browsers with a file made for the purpose.
- **Bounded.** At most the first 64 KB of a file is read for the view and each line is cut at
  500 characters, so a file that is one line of several megabytes does not slow the page.

### Changed

- The design allowed one typeface. It now allows the device's own fixed-width typeface as well,
  for file contents in this view and nowhere else. Nothing is downloaded for it.

### Fixed

- **JSON written as a single line longer than 512 KB was not recognised** and showed as
  unsupported. Minified JSON is often like this. It is now identified from its start.
- TOML written by Omsett had two blank lines between sections where one was meant.

## 0.10.0

Released 23 November 2026.

Omsett now converts subtitles and lyrics: SRT, WebVTT, ASS, SSA, TTML, LRC, SBV, SAMI and
MicroDVD, each to any of the others. Drop the SRT that came with a film and get the WebVTT a web
page needs. The words and their times are carried across; fonts, colours and positions are not.

### Added

- **Nine subtitle formats, each read and written: SRT, WebVTT, ASS, SSA, TTML, LRC, SBV, SAMI,
  MicroDVD.** All 72 conversions between them are one step. The readers and writers are
  Omsett's own, apart from the XML parser TTML is read with, which the data formats already
  use. Nothing extra is downloaded.
- **The picker says what each conversion costs.** Only the words and their times are kept.
  LRC says when a line starts and not when it ends, so each line lasts until the next. MicroDVD
  counts video frames, so a frame rate has to be assumed: 23.976 a second unless the file
  states its own.
- **Specific reasons when a subtitle file is refused**: "This file is not valid SRT", "A
  subtitle in this file ends before it starts", "This file has no subtitles in it", "This file
  holds more subtitles than Omsett will convert".
- **A warning on every conversion to CSV or TSV**: cells are written exactly as they are, and a
  spreadsheet program may treat one that starts with =, +, - or @ as a formula.
- 66 trap files for subtitles, several for every format. Among them: a lyrics file of 120 KB
  that asks to become 40 MB, a subtitle nested ten thousand tags deep, two hundred thousand
  braces that never close, the "billion laughs" as a subtitle, a TTML file that asks for a file
  from the computer, scripts hidden in SRT and SAMI, a script tag escaped twice and one split
  in two, times with twenty digits, subtitles that end before they start, and files of one
  format named as another.

### Changed

- **Subtitles are identified by how they begin**, whatever the file is called: a time with an
  arrow, frame numbers in braces, a time in square brackets, the headings ASS and SSA open
  with. A TTML file is XML, and is recognised as subtitles first.
- A file is offered only formats of its own kind, so a subtitle file lists subtitle formats.

### Known

- **Styling is not carried over**, italics included. A subtitle that was yellow and at the top
  of the screen comes out plain.
- Subtitle files must be UTF-8. Older files in Windows-1252 or UTF-16 show as unsupported.
- In a SAMI file that holds several languages, only the first is read.
- In TTML, times set on a section and added to the times inside it are not added up; each
  line's own time is used.
- SCC (broadcast captions) is not read yet.
- There is no side-by-side view for data or subtitles in this version. It arrived in 0.11.0.

## 0.9.0

Released 22 November 2026.

Omsett now converts data as well as pictures: JSON, YAML, CSV, XML, TOML, JSON Lines and TSV,
each to any of the others. Drop a spreadsheet export and get JSON, or a settings file and get
YAML. As with pictures, it happens in the tab and nothing is uploaded.

### Added

- **Seven data formats, each read and written: JSON, YAML, CSV, XML, TOML, JSON Lines, TSV.**
  All 42 conversions between them are one step. The readers for YAML, TOML and XML are small
  open-source libraries; CSV, TSV and the XML writer are Omsett's own. Nothing extra is
  downloaded.
- **The picker says what each conversion costs.** A table holds one value per cell, so lists
  and groups inside a row become text. Comments are not carried over. TOML cannot hold an empty
  value. XML attributes come across as values whose names begin with `@`. In a CSV, a cell that
  is plainly a number becomes one, and everything else stays text, so a postcode like 01234
  keeps its zero.
- **A file is offered only formats of its own kind.** A data file is not shown a list of picture
  formats it can never become, and a picture is not shown data formats.
- **Specific reasons when a data file is refused**: "This file is not valid JSON", "A quoted
  value in this table is never closed", "The values in this file are nested too deeply".
- 21 trap files for data, among them the "billion laughs" in both YAML and XML, an XML file
  that asks for a file from the computer, a YAML file that asks to run code, JSON with names
  that mean something to JavaScript, a CSV full of spreadsheet formulas, and a picture named
  as a table.

### Changed

- **Text formats are identified by how they read.** JSON and XML are known from their first
  characters. YAML, TOML, CSV and TSV cannot always be told apart from each other, or from a
  note someone typed, so for those four the file's name is allowed to settle it. A name never
  decides whether a file is text: a picture named `.csv` is still a picture.
- A file with no preview (anything that is not a picture) no longer shows an empty square.

### Known

- Data files are read as UTF-8 only. A file in another encoding (UTF-16, Latin-1) is shown as
  unsupported, not guessed at.
- CSV cells that a spreadsheet program would run as formulas are carried across unchanged.
  Omsett does not run them; the program that opens the CSV might.
- A CSV is written without a byte-order mark, so older versions of Excel may show accented
  letters wrongly.
- There is no side-by-side view for data yet, as there is for pictures.
- Data files larger than 32 MB are refused.

## 0.8.0

Released 22 November 2026.

Omsett now reads 22 image formats. This release adds TGA, the Netpbm family, PCX, SGI, Sun
Raster, OpenEXR, Radiance HDR and compressed SVG, and writes TGA and Netpbm.

### Added

- **TGA and Netpbm (PPM, PGM, PBM, PAM), read and written; PCX, SGI, Sun Raster, OpenEXR and
  Radiance HDR, read**, all through ImageMagick. For the two high-range formats the picker says
  that brightness beyond what a screen shows is cut off.
- **SVGZ**, the compressed form of SVG. It is unpacked with a limit of 64 MB before it is drawn.
- **Detection for formats with no signature of their own.** TGA has none, so every field of its
  header must agree before a file is called one; a TGA is also told apart from an icon, which
  starts with the same bytes.
- Twelve trap files: each of the eight formats cut off halfway, a Netpbm and a TGA that state
  an impossible size, a compressed SVG that unpacks to a quarter of a gigabyte, and a
  compressed text file named as one.

### Known

- ICNS, the Mac icon format, is not read: this build of ImageMagick cannot decode it.

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
