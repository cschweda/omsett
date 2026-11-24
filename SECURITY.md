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
<summary><strong>23 November 2026: Follow-up: four findings left open that morning</strong> (4 findings: 2 medium, 2 low; 2 fixed, 1 open, 1 accepted)</summary>

The audit of 23 November left four findings open and one fixed with a gap. This pass dealt with the gap in the drawing limits, the supply-chain settings, one of the two missing warnings, and the live site's missing header, which closed when the deploy script began reloading the server itself. One finding remains the owner's to close on the repository.

**Scope**

- OMS-121: patterns nested in patterns, which no stated limit stopped.
- OMS-132: the waiting period for new dependency releases, and releases published without their checks.
- OMS-133: the warning lost when a conversion takes two steps.
- OMS-130: the live site's missing header, and the forwarding rules that were accepted and did not work.

**Method**

- Each change was made with a test where a test can show it, and the whole suite run again.

**What held**

- OMS-131 (the main branch not protected by its checks) is unchanged and still open: it is a setting on the repository, and the owner's to make.

**Findings**

| ID | Severity | Finding | Status |
| --- | --- | --- | --- |
| OMS-121 | Medium | A drawing of 275 bytes could ask for work that never finishes | Fixed |
| OMS-132 | Low | Supply-chain settings looser than the rest of the project | Accepted |
| OMS-133 | Low | Two warnings the picker does not give | Open |
| OMS-130 | Medium | The live site was not sending a security header added a day earlier | Fixed |

#### OMS-121: A drawing of 275 bytes could ask for work that never finishes

**Severity:** Medium · **Status:** Fixed · **Area:** Availability

**Identification**

Left over from the audit earlier the same day: patterns filled with patterns were stopped in a browser only by the conversion clock, and by nothing outside one. Each level multiplies the work of the level above it; twelve levels of eight shapes each did not finish in 200 seconds.

**Mitigation**

Patterns are followed from one to the next before a drawing is drawn. More than four deep, or one that leads back to itself, is refused.

**Verification:** fixtures/audit-2026-11-23.test.ts (OMS-121): twelve deep and a pattern filled with itself are refused in under two seconds; three deep is drawn.

#### OMS-132: Supply-chain settings looser than the rest of the project

**Severity:** Low · **Status:** Accepted · **Area:** Supply chain

**Identification**

Three settings were left open: no waiting period on new releases of dependencies, a release that could be published from a tag whose checks had not run, and the self-host example pulling its image by tag.

**Mitigation**

A dependency release is now left three days before it can be chosen when dependencies are resolved, and a week before an update is proposed. The release job first asks whether "All checks" passed on the tagged commit, and publishes nothing if it did not.

The self-host example still names the image by its tag. That is accepted: the example is for a person who wants the current release, the image is built only from a commit whose checks passed, and anyone who wants an exact image can name its digest.

**Verification:** The settings are in pnpm-workspace.yaml, .github/dependabot.yml and .github/workflows/release.yml. The install was run with the waiting period in force. The release check will first run on the next tagged release.

#### OMS-133: Two warnings the picker does not give

**Severity:** Low · **Status:** Open · **Area:** Honest description

**Identification**

Of the two missing warnings, one is closed here: a HEIC photo converted to JPEG goes by way of PNG, and the warning about converting one lossy format to another was lost on the way, because it was worked out for each step and neither step is such a conversion by itself.

The other stays open: an animated PNG becomes its first frame with no warning that the rest are dropped. Saying so properly means registering animated PNG as a format of its own, which changes the registry's shape.

**Mitigation**

The warning is now given for a route as a whole: from a format that always loses detail to a last step that loses detail, by whatever road.

Animated PNG is not changed here.

**Verification:** packages/registry/src/router.test.ts: HEIC to JPEG carries the warning once, and HEIC to PNG does not. The animated PNG warning keeps this finding open.

#### OMS-130: The live site was not sending a security header added a day earlier

**Severity:** Medium · **Status:** Fixed · **Area:** Deployment

**Identification**

Left open that morning: the live site was not sending Strict-Transport-Security, because nginx reads its header file when it starts and nothing reloaded it after a deploy changed the file.

The first deploy to rely on a reload showed a second fault of the same kind. The rules that pass a visit count and an accessibility check on to their servers were accepted by nginx and refused every request, because the certificate of the far server was checked one step short of its full chain. A configuration can be valid and still not work.

**Mitigation**

The publish script reloads nginx whenever the header file changes; on the next deploy it did, and the header has been sent since. The forwarding rules now follow the whole certificate chain.

The tests no longer stop at asking nginx whether it accepts the rules. They start nginx with them and send a real question through, which must come back answered.

**Verification:** scripts/check-live-headers.sh https://omsett.com reported every header present on 23 November 2026, after the deploy. In CI, the "Served by nginx" job asks the checker's health through the generated rules and requires an answer, and requires a GET to the counting rule to be refused. On the live site the same day, an accessibility check of the sample document returned a score and a report, and the visit report was accepted.

</details>

<details>
<summary><strong>23 November 2026: Red and blue: every reader, every engine, the page and its deployment</strong> (29 findings: 4 high, 14 medium, 11 low; 24 fixed, 4 open, 1 accepted)</summary>

Three independent reviewers were each given one part of Omsett and told to break it, without being shown the project's own reasoning: the file readers and writers; identification, routing and the picture engines; and the page, its security policy, the build and the deployment. They were required to prove what they claimed by running it. They found no way to run code and no way for a file to leave the device. They did find hidden text carried out of Word and PowerPoint files, small files that cost gigabytes or never finished, pictures that came out wrong, and one design of the project's own, made the same day, that would have put another party's code in the page.

**Scope**

- Every reader and writer that is Omsett's own code: archives, data and spreadsheets, subtitles, Markdown and HTML, Word and PowerPoint, PDF, screenplays, fonts, and file details.
- Identification by content, the size guard, routing, and how the five picture engines are driven.
- The page: its security policy, everything that puts file-derived text on screen, the worker boundary and time limits, the test-only settings, visit counting and Settings.
- The build, the server configuration, the publish script, the self-host image, CI and dependencies.

**Method**

- Each reviewer read the code and the existing 426 traps, then wrote and ran a proof for every claim: a file built in memory and the time, memory, or output it produced. Claims that could not be run are marked as such.
- Every finding was reproduced again before it was believed, then fixed, then given a test that fails without the fix and a trap file where a file can show it. Two of the fixes were themselves wrong on the first attempt and were caught by the new traps.
- The live site was asked, with plain requests, which security headers it sends.

**What held**

- No file made code run, in any format, in any engine. No hidden data in a picture survived a conversion to any of the image formats.
- Nothing a file contains is put on the page as markup; names, details, notes and errors are all text.
- Workers cannot reach another origin, and a missing worker script is a 404, not the app.
- Paths that climb out of an archive, in every spelling tried, are refused; ZIP and TAR size and count limits hold.
- HTML is cleaned on the way in and the way out: every script, handler and dangerous address tried was removed.
- No blocked conversion can be reached by another route, and no file can be converted to a format of another kind.
- The test-only settings in the address bar cannot be reached from any address that is not this machine.
- CI actions are pinned, run with read-only permissions, and take no untrusted text into a command; the lockfile has an integrity hash for every package.

**Findings**

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

#### OMS-102: Text hidden in a Word document was carried across unless it was hidden the plainest way

**Severity:** High · **Status:** Fixed · **Area:** Privacy of what was converted

**Identification**

The reader left out text marked hidden on the run itself, and nothing else. Text hidden by the character style it was given, by a style based on such a style, or by its paragraph's style came out in the page. So did the stored result of a field that shows nothing (SET, ASK), and table rows that were deleted with changes tracked or marked hidden.

The project's own rule is that what a document's author deleted or hid is never carried across. The existing trap covered only the two spellings the reader already knew.

**Mitigation**

Hiding is now worked out the way Word does: the run's own setting, then its style and the styles that one is based on, then the paragraph's style, then the document's default. A run can also turn hiding off, and that is honoured too.

Fields are followed from start to end. The instruction is never text, and the result of a field that displays nothing is left out. Rows and cells deleted with changes tracked, and rows marked hidden, are left out of tables.

**Verification:** Seven ways of hiding and three of showing are tested in packages/engines/src/audit-2026-11-23.test.ts (OMS-102). The trap hidden-every-other-way.docx carries all of them at once and runs in both suites, in three browsers.

#### OMS-103: A slide hidden with the word "false", and shapes hidden in the editor, were published from a presentation

**Severity:** High · **Status:** Fixed · **Area:** Privacy of what was converted

**Identification**

A slide was treated as hidden only when its file said show="0". The format allows "false" as well, and that spelling was read as shown. A text box or picture hidden in PowerPoint's selection pane was read like any other.

**Mitigation**

Anything that is not a yes is a no. A shape, picture, table or group marked hidden is skipped.

**Verification:** Tested for five spellings of no and two of yes, and for hidden shapes (packages/engines/src/audit-2026-11-23.test.ts, OMS-103). Trap: hidden-spelled-another-way.pptx.

#### OMS-101: A workbook of 88 KB made the reader hold three gigabytes

**Severity:** High · **Status:** Fixed · **Area:** Availability

**Identification**

An office file is a ZIP of XML, and the XML was parsed whole before anything in it was counted. Ten million empty rows are 60 MB of text and 88 KB once zipped; the parser built an object for each. Rows and cells with no value were never counted toward the cell limit at all. The same was true of Word documents and presentations.

A header row of sixteen thousand identical names took 3.6 seconds, because each new name was counted up from the start.

**Mitigation**

The tags in each part are counted in the text, in one pass, before any is parsed, and a part with more than 1.5 million is refused as too large. Repeated column names are numbered from where the last one stopped.

**Verification:** packages/engines/src/audit-2026-11-23.test.ts (OMS-101). Traps: ten-million-empty-rows.xlsx, two-million-empty-paragraphs.docx, and the older a-row-of-two-million-cells.xlsx, which is now turned away earlier.

#### OMS-116: Counting visits as first built would have run another party's code in the page

**Severity:** High · **Status:** Fixed · **Area:** Privacy boundary

**Identification**

Visit counting was built, and merged for a few hours, so that Plausible's script was served through the site's own address. That satisfied the security policy to the letter and defeated its purpose: the script would have run on the page where the files are, with a route out through the site's own server, and whoever controls that script, or the connection it is fetched over, could have read a file. The check that the script's address was on the site's own origin could also be passed with a tab character.

It had not been switched on. No visit was ever counted that way.

**Mitigation**

No script is loaded for counting, from anywhere. Omsett's own code makes one small report to its own origin (that a page was opened, which, and what linked to it) and the server passes it on. The setting is now the site's name, held to letters, digits, dots and hyphens. The documented server rule accepts only a small POST and checks the certificate of the server it forwards to.

Written into the project's rules: an analytics script is never proxied or vendored to satisfy the policy.

**Verification:** apps/web/app/utils/visits.test.ts and e2e/settings.spec.ts: the report's exact contents, that every script the page ran is the app's own, that nothing is asked of another origin, and that a setting which is not a plain site name counts nothing.

#### OMS-104: Tags could be smuggled through the subtitle cleaner by nesting them

**Severity:** Medium · **Status:** Fixed · **Area:** Integrity of output

**Identification**

Tags were removed from subtitle text in one pass. "<<b>img …>" loses its inner tag and becomes a whole one. Escapes undone afterwards, and position codes removed between passes, rebuilt tags the same way; text continued after a blank line in SRT skipped the second pass altogether. The result was written as it stood into SRT, SBV and ASS. A player that puts subtitle text into a page would run it.

**Mitigation**

Tags are removed until none is left. Text still producing tags after four passes loses its angle brackets. Continued text goes through the same cleaning and the same limits.

**Verification:** Nine constructions, across six formats, in packages/engines/src/audit-2026-11-23.test.ts (OMS-104). Traps: tag-left-behind.srt, tag-spelled-in-entities.vtt.

#### OMS-120: A drawing was held to the size it stated, not to the pictures inside it

**Severity:** Medium · **Status:** Fixed · **Area:** Availability

**Identification**

An SVG of 100 by 100 pixels carrying a picture of 20,000 by 20,000 passed the size guard and was decoded in full: 65 KB of file, 2.4 GB of memory. The time allowed was worked out from the stated size, so it was the minimum.

**Mitigation**

Before a drawing is drawn, every picture carried inside it is found and its real size read from its first bytes. Their sum is held to the same limit as any picture, and one that does not state its size is refused.

**Verification:** fixtures/audit-2026-11-23.test.ts (OMS-120). Trap: picture-inside-is-huge.svg.

#### OMS-121: A drawing of 275 bytes could ask for work that never finishes

**Severity:** Medium · **Status:** Fixed · **Area:** Availability

**Identification**

A filter asking for a hundred million layers of noise, one spreading every pixel hundreds of pixels, one weighing each pixel against tens of thousands, and a line of millions of letters each cost far more than any limit. In a browser the clock stopped them; outside one, nothing did.

**Mitigation**

A drawing is read before it is drawn, and refused if it asks for more than 16 layers of noise, a spread of more than 64 pixels, a grid wider than 9, or more than 50,000 characters of text.

**Verification:** fixtures/audit-2026-11-23.test.ts (OMS-121). Traps: noise-a-hundred-million-deep.svg, three-million-letters.svg. Not yet covered: patterns nested inside patterns, which the browser's clock stops but no stated limit does.

#### OMS-122: One drawing left the SVG engine unfit for every file after it

**Severity:** Medium · **Status:** Fixed · **Area:** Availability

**Identification**

A drawing holding a drawing holding a drawing, twenty-five deep, ran the renderer out of room. Outside a browser the same copy of the renderer was kept, and refused every sound drawing afterwards.

**Mitigation**

Drawings nested more than three deep are refused by a stated limit. A failure inside the renderer itself now discards that copy, and the next conversion starts a new one.

**Verification:** fixtures/audit-2026-11-23.test.ts (OMS-122): the nested drawing is refused, and a sound drawing converts straight after. Trap: drawing-in-a-drawing-25-deep.svg.

#### OMS-123: ImageMagick checked a picture's size after decoding it, and read any number of pictures

**Severity:** Medium · **Status:** Fixed · **Area:** Availability

**Identification**

An icon's list can say at most 256 by 256, but the picture behind an entry can be any size; a 48 KB icon cost eight seconds and a 437 KB one six gigabytes. A file of two hundred thousand one-pixel pictures, 1.6 MB, took 4.4 GB. In each case the engine's own size check ran after everything had been read.

**Mitigation**

ImageMagick is given its limits before every read: the longest side, the most pixels in one picture, at most 256 pictures in a file, a ceiling on memory, and no disk. It refuses at the first picture too large or the list too long, before making room.

**Verification:** fixtures/audit-2026-11-23.test.ts (OMS-123): each is refused in under three seconds, and sound files of all nine kinds the engine reads still convert. Traps: picture-inside-is-huge.ico, twenty-thousand-pictures.pbm. An icon of three hundred entries that all point at one large picture is now refused by the memory ceiling, which still means gigabytes are asked for first.

#### OMS-124: The size guard and the engine read a file's size from different places

**Severity:** Medium · **Status:** Fixed · **Area:** Availability

**Identification**

For four formats a file could show the guard a size of 1 by 1 and the engine a size of its choosing: a Netpbm comment ended with an old Macintosh line break; a PAM giving its width twice; an EXR with the size's name inside an earlier text field; a JPEG 2000 with it inside the list of compatible kinds. A bitmap with the oldest kind of header was the reverse: always refused as too large, because its size was read from the wrong place.

**Mitigation**

Netpbm comments end at either line break, and the last size a PAM gives is the one read. The old bitmap header is read as what it is. For all four, the engine's own limits (OMS-123) now refuse an oversized picture before it is decoded, whatever the guard was shown.

**Verification:** fixtures/audit-2026-11-23.test.ts (OMS-124). Traps: comment-ends-the-old-way.pbm, two-widths.pam, old-header.bmp. The guard's readers for EXR and JPEG 2000 still search for a name where they should walk the file's structure; the engine's limit is what stops those two.

#### OMS-125: A Photoshop file was converted to its largest layer, hidden or not

**Severity:** Medium · **Status:** Fixed · **Area:** Integrity of output

**Identification**

ImageMagick returns the finished picture and then each layer, and the engine kept whichever was largest. A layer may be larger than the picture and may be hidden. The output was then that layer, not the picture, at a size the guard never saw.

**Mitigation**

For a format that has layers, the finished picture is the one converted.

**Verification:** fixtures/audit-2026-11-23.test.ts (OMS-125): a white picture of 8 by 8 with a hidden red layer of 64 by 64 comes out white, 8 by 8.

#### OMS-126: Photographs taken upright came out on their side

**Severity:** Medium · **Status:** Fixed · **Area:** Integrity of output

**Identification**

A camera held upright stores the picture sideways with a note saying which way is up. The note is metadata and was removed with the rest; the picture was never turned.

**Mitigation**

The picture is turned first, then the note is removed with everything else.

**Verification:** fixtures/audit-2026-11-23.test.ts (OMS-126), to four formats: the output is 168 by 320 and carries no EXIF.

#### OMS-106: A table could be written thousands of times larger than what it was made from

**Severity:** Medium · **Status:** Fixed · **Area:** Availability

**Identification**

A table is as wide as every column any of its rows has. Eight thousand rows that each name a column of their own are sixty-four million cells, from 95 KB; a 12 KB CSV became 16 MB.

**Mitigation**

A table of more than five million cells is refused before any of it is built, in CSV, TSV, XLSX and when reshaping.

**Verification:** packages/engines/src/audit-2026-11-23.test.ts (OMS-106).

#### OMS-105: A font whose tables share bytes was written out hundreds of times larger

**Severity:** Medium · **Status:** Fixed · **Area:** Availability

**Identification**

A font file may point every table at the same bytes. Read, it is small; written, each table gets its own copy. 1 MB became 268 MB.

**Mitigation**

Tables may not overlap. A font where they do is refused.

**Verification:** packages/engines/src/audit-2026-11-23.test.ts (OMS-105). Trap: tables-that-share-their-bytes.ttf.

#### OMS-107: Archive names that mean something else on Windows and Macs were carried into the new archive

**Severity:** Medium · **Status:** Fixed · **Area:** Integrity of output

**Identification**

Two names differing only in capitals, or in how an accent is written, are one file on most Windows and Mac disks, where the second replaces the first. Also carried: device names (NUL.txt), names ending in a dot or a space, names with a colon (a hidden second stream of another file), and a name that was both a file and a folder.

**Mitigation**

Each of these is refused, with the reason. A download is never named for a device. A separate automated review of the fix found that "NUL .txt" and CONIN$ were still let through; both are now caught.

**Verification:** packages/engines/src/audit-2026-11-23.test.ts (OMS-107). Traps: names-differ-only-in-capitals.zip, names-differ-only-in-accents.zip, named-for-a-device.zip, a-second-stream.tar, a-file-that-is-also-a-folder.zip.

#### OMS-119: Previews handed any picture to the browser to draw, with no limit on how many or how large

**Severity:** Low · **Status:** Fixed · **Area:** Availability

**Identification**

Every dropped picture was sent to the browser's decoder for its preview at once: a hundred at a time, each up to the full size limit, and files that did not state a size at all.

**Mitigation**

A preview is drawn only for a picture that states its size, and only up to 40 megapixels; previews are drawn one at a time. The rule that a browser's decoder never converts an unverified file is unchanged and is now worded to say that previews, which are only looked at, are the one exception.

**Verification:** e2e/audit-2026-11-23.spec.ts (OMS-119): a JPEG whose size is out of sight gets no preview and still converts.

#### OMS-117: A batch left behind by "Convert another" converted discarded files into the new session

**Severity:** Low · **Status:** Fixed · **Area:** Integrity of output

**Identification**

Starting again stopped the worker but not the loop that was feeding it. The loop carried on with a new worker, put results for files the person had discarded into the new session, and could run alongside a new batch.

**Mitigation**

Each session is numbered. A batch checks after every wait whether its session is over, and writes nothing if it is.

**Verification:** e2e/audit-2026-11-23.spec.ts (OMS-117).

#### OMS-118: Asking for a file's details could stop another file's conversion

**Severity:** Low · **Status:** Fixed · **Area:** Availability

**Identification**

Details were read by the same worker that converts. Asked for during a long conversion, the request waited, ran out of time after twenty seconds, and stopped the worker with the conversion in it. Packing results into a ZIP had no time limit at all.

**Mitigation**

Details and the ZIP have a worker of their own. Stopping any worker now settles everything that was waiting on it, and the ZIP has a limit.

**Verification:** e2e/audit-2026-11-23.spec.ts (OMS-118): the details are read in a second worker while a conversion is under way, and the conversion finishes.

#### OMS-108: Seven readers and writers went round once for everything already read

**Severity:** Low · **Status:** Fixed · **Area:** Availability

**Identification**

A TAR header length written as eighty thousand zeros; SRT text continued after blank lines; a Fountain title of many lines, brackets never closed, and long runs of spaces; writing Final Draft from many lines of action; a vCard note continued the old way; and Markdown with no top heading. Each took time growing with the square of its size: seconds from tens of kilobytes. The conversion clock stops all of them in a browser.

**Mitigation**

Each now takes one pass over its input: pieces are gathered and joined once, a search is not started again from every character, and a length must read as a length.

**Verification:** packages/engines/src/audit-2026-11-23.test.ts (OMS-108 to OMS-112, OMS-113), on inputs sized to take half a minute or more before the fix. Traps: length-of-eighty-thousand-zeros.tar, words-after-eighty-thousand-blank-lines.srt, brackets-never-closed.fountain, soft-breaks-eighty-thousand-times.vcf.

#### OMS-113: A long page was refused as "nested too deeply"; deep HTML inside Markdown was not refused

**Severity:** Low · **Status:** Fixed · **Area:** Integrity of output

**Identification**

A page of 150,000 paragraphs, none inside another, was refused with the wrong reason: handing that many children to one call overflowed it, here and inside the HTML cleaner. And HTML written inside Markdown was nested a thousand deep in the output, because depth was checked before that HTML was read.

**Mitigation**

Children are handled one at a time, and tags the cleaner does not keep are opened before it sees them. Depth is checked again once the HTML inside Markdown has been read, and counted in the source before reading starts, so the refusal never depends on running out of room.

**Verification:** packages/engines/src/audit-2026-11-23.test.ts (OMS-113). Traps: long-and-flat.html, html-a-thousand-deep.md.

#### OMS-114: Names every JavaScript object answers to were read as values

**Severity:** Low · **Status:** Fixed · **Area:** Integrity of output

**Identification**

A row without a column called "constructor" answered with a function, which was written into a CSV as a cell that was never in the data and broke XLSX and YAML. A Final Draft paragraph of kind "constructor" was silently dropped, so a script could hold lines Omsett did not show. Nothing was polluted.

**Mitigation**

A row answers only for its own columns. Lookup tables hold only what was put in them.

**Verification:** packages/engines/src/audit-2026-11-23.test.ts (OMS-114). Trap: type-is-constructor.fdx.

#### OMS-115: Text that reads as structure was written unescaped into lyrics, contacts and calendars

**Severity:** Low · **Status:** Fixed · **Area:** Integrity of output

**Identification**

Lyrics beginning with a time in brackets became two lines when read back. Three Unicode line separators were kept in vCard and iCalendar values, where some readers end a line at them.

**Mitigation**

Lyrics that begin with a bracket are set off by a space. The three separators become spaces.

**Verification:** packages/engines/src/audit-2026-11-23.test.ts (OMS-115).

#### OMS-127: A HEIC file was converted to its first picture, not the one it names as the one to show

**Severity:** Low · **Status:** Fixed · **Area:** Integrity of output

**Identification**

A HEIC file can hold several pictures and names one as primary. The engine took the first.

**Mitigation**

The primary picture is taken, wherever it is.

**Verification:** fixtures/audit-2026-11-23.test.ts (OMS-127).

#### OMS-128: Ordinary text that begins with a signature's letters was taken for a picture

**Severity:** Low · **Status:** Fixed · **Area:** Correct identification

**Identification**

A table whose first column is "BMI" was a bitmap, and refused as too large. Notes beginning "P1" were a Netpbm picture. Nothing unsafe followed; real files were turned away with a baffling reason.

**Mitigation**

A file that is text from its first byte to its last is not believed to be a binary format, whatever its first letters spell. The picture formats that are written as text are held to more of their header.

**Verification:** fixtures/audit-2026-11-23.test.ts (OMS-128): ten such files are identified as the text they are, and the text-written pictures still as pictures. Traps: bmi.csv, p1-incidents.md, gif89a.csv.

#### OMS-130: The live site was not sending a security header added a day earlier

**Severity:** Medium · **Status:** Open · **Area:** Deployment

**Identification**

nginx reads its header file when it starts. A deploy that changed the file printed a note in a log and changed nothing; the site went on without Strict-Transport-Security, which the previous audit recorded as fixed. A tightened worker policy would have been missed the same way.

**Mitigation**

The publish script now reloads nginx when the header file changes and, where it cannot, prints a warning that is hard to miss. scripts/check-live-headers.sh asks a live site for each header its build calls for.

**Verification:** Run on 23 November 2026, the check reported Strict-Transport-Security missing from omsett.com on all three requests. This stays open until nginx has been reloaded on the server and the check passes.

#### OMS-131: Nothing stands between a push and the live site, and the site is built on its own server

**Severity:** Medium · **Status:** Open · **Area:** Deployment

**Identification**

The "All checks" job is not required by anything: the server rebuilds from the main branch on every push, whether the checks passed, failed or have not finished. The build, including every dependency's install step, runs on the production server.

**Mitigation**

Not changed in this audit. Requiring "All checks" on the main branch is a setting on the repository; building in CI and shipping the result is a larger change to how the site is deployed. Both are the owner's decisions.

**Verification:** Not applicable while open.

#### OMS-129: The security policy cannot stop a script in the page from sending a file elsewhere by navigating

**Severity:** Medium · **Status:** Accepted · **Area:** Privacy boundary

**Identification**

The policy stops every request a script can make and read. It does not stop a page being sent to another address with data in it, nor WebRTC; a policy has no directive for the first. A reviewer showed both in Chrome. Workers, where every file reader and engine runs, have no such way out.

**Mitigation**

Accepted as a limit of the platform, and the claim that the policy alone covers the page has been corrected where it was made. What it rests on instead is that only the project's own code and its pinned build dependencies run in the page: no third party's script is loaded, counting visits included (OMS-116).

**Verification:** e2e/settings.spec.ts asserts that every script the page runs is one of the app's own; e2e/gate.spec.ts asserts that no request goes to another origin.

#### OMS-132: Supply-chain settings looser than the rest of the project

**Severity:** Low · **Status:** Open · **Area:** Supply chain

**Identification**

pnpm was fetched by version with no hash; the libvips loader script was said to be checked against its recorded hash and was not; there is no waiting period on new releases of dependencies; a release can be published from a tag whose checks did not run; the self-host example pulls its image by tag.

**Mitigation**

pnpm is now pinned by hash, and the loader script is checked before it is imported. The other three are not changed in this audit.

**Verification:** The pinned pnpm was run through corepack. The remaining three items keep this open.

#### OMS-133: Two warnings the picker does not give

**Severity:** Low · **Status:** Open · **Area:** Honest description

**Identification**

An animated PNG becomes its first frame with no warning that the rest are dropped. A HEIC photo converted to JPEG goes by way of PNG, so the warning about converting one lossy format to another is lost on the way.

**Mitigation**

Not changed in this audit. Both are warnings to add in the registry: one for animated PNG, one that follows a route from its first format to its last.

**Verification:** Not applicable while open.

</details>

<details>
<summary><strong>22 November 2026: Follow-up: closing two open findings</strong> (3 findings: 1 medium, 1 low, 1 info; 2 fixed, 1 open, 0 accepted)</summary>

The red/blue audit left three findings open. This pass closed the two that were the project's to close: damaged files that some browsers converted into partial pictures, and build inputs referenced by a movable tag. The third is a line in the server's own configuration.

**Scope**

- OMS-005: damaged files decoded by a browser's own, forgiving decoder.
- OMS-013: container base images and an installer referenced by tag.
- The new formats added in the same change (JPEG, GIF, TIFF as sources and targets), checked against both findings so that neither was reopened.

**Method**

- A structural checker for PNG was written and run against every PNG file in the test set: thirteen sound files, ten of them traps, had to pass, and eighteen damaged or dishonest ones had to be refused, each for the stated reason.
- The full trap set was then run in Chromium, Firefox, and WebKit with the browser-dependent allowance removed from the test manifest, so any browser that still returned a partial picture would fail the build.
- Every one of the twenty conversions was run in all three browsers from a real sample file.

**What held**

- All 53 trap files now have one required outcome in every browser, the same as in Node. None is marked browser-dependent.
- The new source formats did not reopen OMS-005: they are read by libvips only, which treats damage as an error.

**Findings**

| ID | Severity | Finding | Status |
| --- | --- | --- | --- |
| OMS-005 | Medium | Some browsers' own decoders turn a damaged file into a partial picture | Fixed |
| OMS-013 | Low | Container base images and the nvm installer are referenced by tag, not by digest | Fixed |
| OMS-015 | Info | The host's template sends a deprecated protection header | Open |

#### OMS-005: Some browsers' own decoders turn a damaged file into a partial picture

**Severity:** Medium · **Status:** Fixed · **Area:** Integrity of output

**Identification**

Open since the first review. When the browser's own encoder did a conversion, the browser's own decoder read the file. Firefox's, and WebKit's on Linux, forgive damage: given a PNG that was cut short, missing rows, corrupted, or carrying a wrong checksum, they returned the part they could read, and Omsett converted that part and reported success.

Adding formats would have widened it. Every browser decodes JPEG and GIF leniently too, and a truncated JPEG is the commonest damaged file there is: an interrupted download.

**Mitigation**

Omsett now verifies a PNG's structure itself, in the worker, before the browser is allowed to decode it. The check reads no pixels. It confirms the signature; that every chunk fits in the file and has a correct checksum; that the header comes first and describes a legal picture; that the palette is well-formed; that no essential chunk is unknown; and that the image data decompresses to exactly the number of bytes the header implies, with a legal filter on every row and no pixel pointing outside its palette.

A file that fails is not decoded by the browser. It is handed to libvips, which either converts it properly (a file missing only its end marker, for instance) or refuses it. Either way the browser's forgiving decoder never sees it.

For every other format the browser's decoder is not used at all. The canvas engine is registered to read PNG only, the one format the app can vouch for; JPEG, WebP, GIF, and TIFF are read by libvips, which treats damage as an error. A test fails if any other format is ever given to the canvas engine.

The cost is that converting from JPEG, WebP, GIF, or TIFF always needs libvips (a 5 MB download, once), where a browser could have done it with nothing. That was judged worth it: a converter must not return half a picture.

**Verification:** Eighteen damaged or dishonest PNG traps are each refused by the checker for the expected reason, and thirteen sound files pass. With the browser-dependent allowance removed, all 53 traps produce the required outcome in Chromium, Firefox, and WebKit, on macOS and on Linux.

#### OMS-013: Container base images and the nvm installer are referenced by tag, not by digest

**Severity:** Low · **Status:** Fixed · **Area:** Supply chain

**Identification**

The self-host image was built from node:24-alpine and caddy:2-alpine by tag, and the deployment guide piped nvm's installer from a version tag straight into a shell. A tag can be repointed by whoever controls the upstream repository, and a script piped into a shell runs whatever the server sends at that moment.

**Mitigation**

Both base images are now pinned by digest in the Dockerfile.

The deployment guide now fetches nvm's installer by commit, checks it against a recorded SHA-256, and runs it only if the hash matches.

Dependabot is configured to propose new image digests, new action versions, and dependency updates weekly, so the pins do not become a way of never patching.

**Verification:** CI builds the image from the pinned digests on every change. The recorded hash was computed from the installer at the pinned commit.

#### OMS-015: The host's template sends a deprecated protection header

**Severity:** Info · **Status:** Open · **Area:** Server configuration

**Identification**

Unchanged. The server's site template adds X-XSS-Protection: 1; mode=block, which current guidance says to drop.

**Mitigation**

Still open. It is one line in the site's nginx configuration, which is edited by the operator and not generated by the build.

**Verification:** None needed.

</details>

<details>
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
