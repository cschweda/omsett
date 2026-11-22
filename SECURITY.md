# Security

<!-- Generated from security/audits.json by `pnpm security:docs`. Do not edit by hand. -->

Omsett converts files on the visitor’s own device and is built so that it cannot send them anywhere. This file records every security audit of it: what was looked for, what was found, and what was done. The same record is on the site at <https://omsett.com/security>.

## Reporting a problem

Please report a vulnerability privately, through the **Security** tab of the [GitHub repository](https://github.com/cschweda/omsett/security) (“Report a vulnerability”), not in a public issue. Say what you did, what happened, and what you expected.

## Severity

| Level | Meaning |
| --- | --- |
| Critical | A visitor’s files or device can be compromised with no unusual action on their part. |
| High | The app gives a wrong result as if it were right, or the site is unavailable. |
| Medium | Something private can leak, or the app can be made unusable, under conditions an attacker can arrange. |
| Low | A weakness that needs unusual circumstances, or whose effect is small. |
| Info | Not a weakness in itself. Recorded so the reasoning is on file. |

A finding is **Fixed** when a test shows it, **Open** when it is not yet dealt with, and **Accepted** when it has been judged tolerable and the reasons are written down.

## Audits

Newest first. The latest is expanded; earlier ones open when clicked.

<details open>
<summary><strong>22 November 2026: Red/blue audit of the converter and its hosting</strong> (10 findings: 3 medium, 5 low, 2 info; 6 fixed, 3 open, 1 accepted)</summary>

An attacker's pass over the whole of Omsett as deployed: what a hostile file, a hostile file name, a crafted link, or a network in the middle can make it do. Followed by the defender's pass that fixed what was found.

**Scope**

- The web app as served at omsett.com: the page, its two background workers, and both conversion engines.
- The response headers and security policies the build generates, and the nginx configuration that serves them.
- The build and deploy path: dependencies, the container image, and the deploy script.
- Not in scope: the server's operating system and the other sites it hosts.

**Method**

- Probes written for the purpose and run against a local production build and the live site: crafted PNGs carrying payloads in their metadata, images sized just under every limit, file names built to mislead, and links carrying settings.
- Twenty-three new trap files, each reproducing the shape of a known attack on image readers, added to the permanent test suite and run in Chromium, Firefox, and WebKit.
- Review of the generated policies and of the live site's response headers.

**What held**

- A 169-megapixel image, the largest the size guard allows, converted in under five seconds without exhausting the tab. An image declaring a billion pixels in one row, or a size with the sign bit set, is refused from its header.
- No trap file, and no file name, could run script, open a dialog, or make the page request anything from another site. That includes an XML entity bomb, markup that references a remote script, and a file that is a GIF and a script at once.
- Files that probe for out-of-bounds reads (a palette index outside its palette, more image data than the header declares, a chunk claiming four gigabytes) are refused or converted correctly, and the engine works afterwards.
- The repository's .git directory, its release folders, and its configuration are not reachable from the web. Development-only settings are absent from the production bundle. The page cannot be framed.

**Findings**

| ID | Severity | Finding | Status |
| --- | --- | --- | --- |
| OMS-007 | Medium | Metadata was copied into the output by one engine and not the other | Fixed |
| OMS-008 | Medium | Nothing limited how long a conversion could run | Fixed |
| OMS-009 | Low | The site did not tell browsers to insist on HTTPS | Fixed |
| OMS-010 | Low | A link could make every conversion fail | Fixed |
| OMS-011 | Low | Download names were taken from the dropped file unchanged | Fixed |
| OMS-012 | Low | No limit on how many files could be dropped at once | Fixed |
| OMS-005 | Medium | Some browsers' own decoders turn a damaged file into a partial picture | Open |
| OMS-013 | Low | Container base images and the nvm installer are referenced by tag, not by digest | Open |
| OMS-014 | Info | The conversion worker is allowed to evaluate code from strings | Accepted |
| OMS-015 | Info | The host's template sends a deprecated protection header | Open |

#### OMS-007: Metadata was copied into the output by one engine and not the other

**Severity:** Medium · **Status:** Fixed · **Area:** Privacy

**Identification**

Omsett has two engines for PNG to WebP. The browser's own encoder writes no metadata. libvips, used when the browser cannot encode WebP (Safari) or the picture is too large for a canvas, copied the source's EXIF and XMP blocks into the output.

A probe PNG carrying a marked author name in XMP and a marked description in EXIF was converted by each engine. The libvips output contained both markers; the canvas output contained neither. A PNG text comment was not copied by either.

The consequence is that what leaks depended on the visitor's browser. A Safari user converting a photograph to share would have published its embedded details, including a location if present, while a Chrome user converting the same file would not, and neither was told. The exposure grows as soon as JPEG input, where location data is common, is supported.

**Mitigation**

libvips is now told to keep no metadata (keep: 'none') when it writes. Both engines therefore produce output with no EXIF, XMP, or comments.

The registry gained a way for an engine to declare what it deliberately leaves out (drops), and both engines declare metadata. The picker derives its warning from that, so the tile now says, before converting: "Author, location and other metadata are removed."

A trap file, script-in-metadata.png, carries a marked payload in its comment, XMP, and EXIF. The tests convert it in Node and in all three browsers and fail if the marker appears anywhere in the output.

**Verification:** The probe's output from libvips shrank from 770 to 230 bytes and contains neither marker. The trap passes in Chromium, Firefox, and WebKit.

#### OMS-008: Nothing limited how long a conversion could run

**Severity:** Medium · **Status:** Fixed · **Area:** Availability

**Identification**

The test suite had time limits; the app had none. A conversion was awaited for as long as it took. A file that made an engine loop, or decode without end, would leave its row showing "converting" and the Convert button disabled until the page was reloaded, taking any other files in the batch with it.

No file in the test set triggers this today, which is why it had not been seen. It was found by reading the code path, not by a crash: the only way to stop an engine that is stuck inside a file is to terminate its worker, and nothing ever did.

**Mitigation**

Every conversion step now has a time budget: 30 seconds, plus 3 seconds per megapixel of the picture, and never more than 10 minutes. The largest image the size guard allows converts in about 5 seconds, so a conversion that reaches its budget is stuck, not slow.

When the budget runs out the worker is terminated, which stops the engine whatever it is doing. The file is marked "Stopped: this file took too long to convert", the next engine for that conversion is tried if there is one, and the rest of the batch continues on a fresh worker.

Decoding a picture for its preview has its own 20-second limit, after which the preview is abandoned and the file can still be converted.

**Verification:** A test shortens the budget to one millisecond and checks that the file is reported as stopped, that nothing is offered for download, and that the page is usable afterwards. The timing logic is unit-tested with a task that never finishes.

#### OMS-009: The site did not tell browsers to insist on HTTPS

**Severity:** Low · **Status:** Fixed · **Area:** Transport

**Identification**

omsett.com redirects plain HTTP to HTTPS, but sent no Strict-Transport-Security header. Without it, a browser will still try plain HTTP whenever a visitor types the address or follows an old link, and a network in the middle (a hostile Wi-Fi access point) can answer that first request itself and keep the visitor on an imitation.

For Omsett the damage would be an imitation site that uploads files the real one never would, which is exactly the promise the real site makes.

**Mitigation**

The build's header set now includes Strict-Transport-Security with a one-year lifetime. A browser that has seen it once refuses plain HTTP to the site for that year.

Subdomains are deliberately not included: they are not this project's to bind. The header is ignored by browsers on http://localhost, so self-hosted copies on a local machine are unaffected.

**Verification:** The header is present in the generated nginx, Caddy, and Netlify configurations and is checked in the test server's responses. On the live site it takes effect when nginx reloads its configuration after the deploy.

#### OMS-010: A link could make every conversion fail

**Severity:** Low · **Status:** Fixed · **Area:** Integrity of the app

**Identification**

The app read an engine name from the address bar (?engine=vips) so the tests could exercise each engine on purpose. It was honored everywhere, and any value was accepted. A link to omsett.com/?engine=anything loaded a page that looked normal and failed every conversion with "This file couldn't be converted".

Nothing is stolen this way. It is a way to make the site look broken to whoever is sent the link, and to push them toward another converter.

**Mitigation**

Settings in the address bar are now honored only when the app is served from the visitor's own machine (localhost), which is where the tests run. On any public address they are ignored.

An engine name that is not an engine is ignored even on localhost. The new ?timeout setting, added for the fix to OMS-008, follows the same rule.

**Verification:** A unit test checks that the setting is read on localhost and ignored on omsett.com and on a look-alike host name. A browser test opens the app with a nonexistent engine and converts successfully.

#### OMS-011: Download names were taken from the dropped file unchanged

**Severity:** Low · **Status:** Fixed · **Area:** Output handling

**Identification**

The name offered for a converted file was the dropped file's name with its extension replaced. Three kinds of hostile name passed straight through: one containing folders (../../etc/passwd.png), one 3,000 characters long, and one containing U+202E, the invisible character that reverses the direction of the text after it, so that "invoice[U+202E]gnp.exe" is displayed as "invoiceexe.png".

Browsers strip folders from a download name themselves, so no file could be written outside the download folder. The direction override is the real issue: it makes a name read as something it is not, in the result row and in the file manager, and Omsett was passing it along.

**Mitigation**

Output names are now cleaned: only the last part of a path is kept; control characters and direction-changing characters are removed; characters a file system refuses are replaced; leading dots are dropped so the file is not hidden; and the name is capped at 120 characters, counted so that no character is cut in half. A name with nothing left becomes "converted".

**Verification:** Unit tests cover each case. Browser tests drop files with six hostile names and check both the download name and the name shown in the result.

#### OMS-012: No limit on how many files could be dropped at once

**Severity:** Low · **Status:** Fixed · **Area:** Availability

**Identification**

Each dropped file is identified and has a preview decoded. Nothing bounded the number, so dropping a folder of tens of thousands of files, by accident or on purpose, queued that much work and that many rows, and the tab became unresponsive.

**Mitigation**

At most 100 files are taken in a session. Any beyond that are left out, and the page says so: "Only the first 100 files were added."

**Verification:** A browser test drops 105 files and checks that 100 are listed and the notice is shown.

#### OMS-005: Some browsers' own decoders turn a damaged file into a partial picture

**Severity:** Medium · **Status:** Open · **Area:** Integrity of output

**Identification**

Carried over from the earlier review and still open. When the browser's own encoder does the conversion, the browser's own PNG decoder reads the file, and some decoders forgive damage: Firefox, and WebKit on Linux, return the part of a truncated or corrupted picture they managed to read. Omsett then converts that part and reports success.

This audit added more damaged files and confirmed the pattern. It affects five kinds of damage; Chromium refuses all five, and so does Safari on a Mac, which converts with libvips.

**Mitigation**

Not yet fixed. libvips, where it is used, already treats damage as an error (OMS-001).

The planned fix is for Omsett to check a file's structure itself, in the worker, before handing it to the browser: for PNG, walking the chunks and verifying their checksums and the declared amount of image data. It is one check per format, so it is scheduled with the work that adds more formats.

Until then, the tests still verify that whatever a forgiving browser produces is a real WebP of the size the file declared.

**Verification:** Tracked by five trap files marked browser-dependent in the test manifest.

#### OMS-013: Container base images and the nvm installer are referenced by tag, not by digest

**Severity:** Low · **Status:** Open · **Area:** Supply chain

**Identification**

The self-host image is built from node:24-alpine and caddy:2-alpine, and the deployment guide installs nvm from a version tag. A tag can be moved to different contents by whoever controls the upstream repository; a digest cannot.

The GitHub Actions the project uses, and the nginx image CI tests against, are already pinned to digests. JavaScript dependencies are locked by the lockfile, and the libvips binary is checked against a hash recorded at build time before it is run.

**Mitigation**

Not yet done. The base images should be pinned by digest with an automated job to propose updates, since a pinned image that is never updated trades one risk for another.

This does not affect omsett.com, which is not served from the container image.

**Verification:** None yet.

#### OMS-014: The conversion worker is allowed to evaluate code from strings

**Severity:** Info · **Status:** Accepted · **Area:** Policy

**Identification**

libvips's JavaScript bindings build their function wrappers with new Function, which a browser treats as eval. The worker's security policy therefore allows it. A policy that allows eval is weaker than one that does not, because a flaw that lets an attacker supply a string becomes a flaw that lets them run it.

**Mitigation**

Accepted, with the allowance confined. The page itself, where the document and the visitor's input live, is governed by a separate policy that allows no eval of any kind. Only worker scripts carry the weaker policy.

The worker cannot reach the network (its policy forbids connecting to any other address), runs no third-party script, and holds nothing but the file being converted. The build fails if a worker script would be served from a path that does not carry the policy.

**Verification:** Tests assert that the page's policy contains no eval allowance and that every worker script arrives with its own policy.

#### OMS-015: The host's template sends a deprecated protection header

**Severity:** Info · **Status:** Open · **Area:** Server configuration

**Identification**

The server's site template adds X-XSS-Protection: 1; mode=block. The filter it switches on was removed from browsers years ago after it was shown that it could itself be used to break pages, and current guidance is to send 0 or nothing.

**Mitigation**

No effect on current browsers, so this is informational. The line should be removed from the site's nginx configuration, which is edited by the operator, not generated by the build.

**Verification:** None needed.

</details>

<details>
<summary><strong>22 November 2026: Review with deliberately broken files, and a deployment incident</strong> (6 findings: 2 high, 3 medium, 1 low; 5 fixed, 1 open, 0 accepted)</summary>

The first set of thirty trap files (images that are damaged, hostile, or not what they claim) was written and run against both engines. Writing them exposed four faults in how failures were handled, all fixed the same day, and one that remains open. The same day's first deployments also took the site down for several minutes; that is recorded here because availability is part of security.

**Scope**

- How the app identifies files, guards against oversized ones, and reports failure.
- Both conversion engines, in Node and in three browsers.
- The script that publishes a build on the server.

**Method**

- Thirty files built byte by byte, each wrong in exactly one way, with the required outcome for each written down before running it.
- Every file run through identification, the size guard, and each engine; then dropped into the app in Chromium, Firefox, and WebKit, followed by a normal file to confirm the app still worked.

**What held**

- A real decompression bomb, a valid file of 49 KB that decodes to 400 megapixels, was refused from its header without being decoded.
- Files with a false name were identified by their contents. Text, noise, and markup carrying a script were reported as unsupported and never interpreted.
- No file crashed the page. After every one, an ordinary file still converted.

**Findings**

| ID | Severity | Finding | Status |
| --- | --- | --- | --- |
| OMS-001 | High | libvips returned a partial picture from a damaged file and reported success | Fixed |
| OMS-002 | Medium | Some engine failures could not be reported at all | Fixed |
| OMS-003 | Medium | Chrome shrank an oversized picture and reported success | Fixed |
| OMS-004 | Low | The PNG size reader did not check that it was reading a header | Fixed |
| OMS-005 | Medium | Some browsers' own decoders turn a damaged file into a partial picture | Open |
| OMS-006 | High | A deployment took the live site down | Fixed |

#### OMS-001: libvips returned a partial picture from a damaged file and reported success

**Severity:** High · **Status:** Fixed · **Area:** Integrity of output

**Identification**

libvips forgives damage by default: it returns whatever it managed to read. Five damaged files (cut short, missing rows, corrupted compressed data, a wrong checksum, an invalid row filter) converted "successfully" into a WebP showing only part of the picture, with nothing to tell the user anything was wrong.

For a converter this is the worst kind of failure: a wrong result presented as a right one. Someone converting a batch would have no reason to check each output.

**Mitigation**

libvips now loads every file with fail_on: 'error', which makes truncation and damage fatal. The five files are refused with "This file couldn't be converted".

The trap tests require that an engine either converts a file properly or refuses it cleanly, and that any output has the dimensions the file declared.

**Verification:** All five files fail in Node and wherever libvips runs in a browser.

#### OMS-002: Some engine failures could not be reported at all

**Severity:** Medium · **Status:** Fixed · **Area:** Error handling

**Identification**

For several kinds of bad input, libvips did not throw an ordinary error but a raw WebAssembly exception object. That object cannot be passed from a worker to the page, so the failure could not be shown to the user in the usual way.

**Mitigation**

The engine now catches anything that is not an ordinary error and replaces it with one, keeping the original as its cause. Every failure leaves the engine in a form that can cross to the page and be shown.

**Verification:** The trap tests assert that every failure is an ordinary error, and that the engine still converts a good file afterwards.

#### OMS-003: Chrome shrank an oversized picture and reported success

**Severity:** Medium · **Status:** Fixed · **Area:** Integrity of output

**Identification**

WebP cannot hold a picture wider or taller than 16,383 pixels. Asked to write one 20,000 pixels wide, Chrome's encoder did not fail: it returned a WebP 16,383 pixels wide, and the app offered it as the converted file.

As with OMS-001, the user received a different picture from the one they asked for, with no indication.

**Mitigation**

A format can now declare the largest side it holds. Before any work starts, the app compares the picture's size, read from its header, with the target's limit and refuses with the reason: "Too large for WebP, which holds 16383 pixels a side at most".

The canvas engine makes the same check on the decoded picture, in case the header was wrong.

**Verification:** Two trap files, one too wide and one too tall, are refused with that message in every browser.

#### OMS-004: The PNG size reader did not check that it was reading a header

**Severity:** Low · **Status:** Fixed · **Area:** Input handling

**Identification**

The size guard reads a PNG's width and height from fixed positions in the file. It did not first check that the chunk at that position was the header. In a file whose first chunk was something else, unrelated bytes were read as a size.

The result happened to be safe (the bytes read as an enormous size, so the file was refused), but the guard was deciding on data that meant nothing.

**Mitigation**

The reader now confirms the first chunk is the header before reading a size from it. Otherwise it reports the size as unknown and the file goes on to an engine, which refuses it.

**Verification:** A trap file with its header out of place is now refused by the engine for the right reason.

#### OMS-005: Some browsers' own decoders turn a damaged file into a partial picture

**Severity:** Medium · **Status:** Open · **Area:** Integrity of output

**Identification**

The same failure as OMS-001, in the other engine. When the browser's own encoder converts, the browser's own decoder reads the file, and Firefox's returns the readable part of a damaged picture. Omsett has no way to tell from the outside.

First recorded here; see the later audit for its current state.

**Mitigation**

Open. The fix is for Omsett to check a file's structure itself before handing it to the browser.

**Verification:** Tracked in the test manifest.

#### OMS-006: A deployment took the live site down

**Severity:** High · **Status:** Fixed · **Area:** Availability

**Identification**

The script that publishes a build switches a link named live from the previous build to the new one, then deletes all but the three newest builds. The switch used a plain move, which on Linux does not replace a link to a folder: it moves the new link inside the old build. So from the second deployment onward the site never moved to a newer build, and nothing reported it.

On the fourth deployment the clean-up deleted the first build, the one the site was still pointing at, and every page returned 404 for several minutes until the fix was deployed. The script had been tested only once, on macOS, where the same command behaves differently.

**Mitigation**

The switch now uses an atomic rename that replaces the link. After switching, the script checks that live points at the new build and that its index page exists; if not, it stops with an error and deletes nothing. The clean-up never removes the build that is live.

CI now publishes five times in a row on Linux on every change and checks that the site points at the newest build and that three builds remain.

**Verification:** Reproduced in a Linux container, including recovery from the exact broken state the server was in. The site returned within a minute of the fix being deployed.

</details>
