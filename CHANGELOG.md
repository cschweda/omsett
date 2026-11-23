# Changelog

Every change to Omsett is recorded here, newest first, in the same pull request that makes it.
Changes not yet given a version number go under a heading named "Unreleased" at the top.

The paragraph that opens a version is its teaser: the home page shows its first three sentences
in the "What's new" banner, so keep it to two or three sentences on what a visitor will notice.
A line beginning "Released" gives the date.

## 0.30.0

Released 23 November 2026.

Three things left open by this morning's audit are dealt with. A HEIC photo converted to JPEG
now carries the warning that it is being compressed a second time, and a drawing made of
patterns inside patterns is refused instead of being left to run.

### Added

- **Your own words in the names of converted files.** In Settings, under File names: words
  to put before the name, after it, or both, so that "report.docx" can be saved as
  "omsett-report-converted.html". Kept on your device only.
- **Settings now says exactly what counting visits means**: what is sent, what is never sent,
  that there are no cookies, what happens to your address, and that none of Plausible's code
  runs here.
- **Check accessibility on a converted file too.** A Word document or a workbook that Omsett
  has just made has the same "Check accessibility" control as a file you added, asked the
  same way: nothing is sent until you say so.
- **What's new explains what a "trap file" is**, for anyone meeting the term for the first time.

### Changed

- The README describes Omsett as it is, with pictures; its list of formats is written from
  the code and checked on every change.
- Setting a copy of Omsett up to count visits or to check accessibility is now two lines in
  its settings and a deploy. The server rules are written by the build.
- **In a file's details, "removed when converted" and "kept" line up in a column of their own**,
  so the list can be read at a glance.
- New releases of the software Omsett is built from are left three days before they can be
  used, and a release of Omsett is published only from a commit whose checks all passed.

### Fixed

- **"Markdown" no longer loses its last letter** on a narrow format tile. A format's name is
  now sized to the tile it is in.
- **A HEIC photo converted to JPEG now carries the warning** that it is being compressed a
  second time. The warning was lost because the conversion goes by way of PNG.
- A drawing made of patterns filled with patterns, many levels deep, is refused instead of
  being left to run.

## 0.29.0

Released 23 November 2026.

You can now check a PDF, Word, PowerPoint or Excel file's accessibility before you convert it.
This is the one thing in Omsett that sends a file to a server, so it never happens by itself:
you are shown where the file would go, and nothing is sent unless you say so.

### Added

- **Check accessibility**, beside Details on a PDF, Word, PowerPoint or Excel file. It gives a
  score out of 100 and a grade, with a link to the full report, which opens in a new window.
- **You are asked first, every time.** Pressing the button sends nothing. It says that the
  file would go to audit.icjia.app, that the checker does not keep the file, that it asks
  another server for part of the audit, and that it keeps the report at a private link for a
  year. Then there are two buttons: send it, or do not. The checker is the work of the same
  author as Omsett, Christopher Schweda, and the panel says so.
- **The Status page says whether the checker is up.** Converting does not depend on it.
- A copy of Omsett you host yourself has no checker unless you set one up.

## 0.28.0

Released 23 November 2026.

There is a new page, "Can I trust this?", in the navigation as Trust. It says what Omsett does
with your files, what stops it doing anything else, and how to check each of those yourself.

### Added

- **Trust.** Where your files go and how to see that for yourself; what a hostile file can
  and cannot do; how Omsett is tested; who has audited it and what is still open; what it
  learns about you; and what you are still relying on when you use it.
- **Every figure on it is counted when the site is built**: the tests, the trap files (files
  made on purpose to be broken or hostile, to test against), the
  audits and their findings. The number of tests comes from a real run, and a change cannot
  be merged if the figure on the page is not the true one.
- **About now explains visit counting** and how to turn it off.

## 0.27.0

Released 23 November 2026.

Omsett was audited again, by three reviewers told to break it and to prove what they claimed.
They found no way to run code and no way for a file to leave your device. They did find text
you had hidden in a Word or PowerPoint file being carried into the converted copy, and that is
fixed, along with twenty-three other things.

### Fixed

- **Hidden text stays hidden.** Text hidden by its style in a Word document, the stored
  result of a field that shows nothing, and table rows deleted or marked hidden are no longer
  carried across. Nor are slides hidden with the word "false", or shapes hidden in the editor.
- **Photographs come out the right way up.** A portrait taken on a phone was coming out on
  its side.
- **A Photoshop file becomes its finished picture**, never one of its layers. A HEIC file
  becomes the picture it names as the one to show.
- **Small files that asked for enormous work are refused, quickly, with the reason**: a
  workbook of empty rows, a drawing with a huge picture inside it or a filter that never
  finishes, an icon that understates its size, a font whose tables share their bytes, a table
  that would be millions of cells.
- **Tags cannot be smuggled through a subtitle** by writing one inside another.
- **A long web page is no longer refused as "nested too deeply"**, and Markdown with deeply
  nested HTML in it now is.
- **A table whose first column is "BMI" is a table.** Text that happened to begin with the
  letters of a picture format was being taken for a picture.
- **Old-style BMP files convert.** They were always turned away as too large.
- **Archives are refused if they hold names that would overwrite each other** on a Windows
  or Mac disk, or names Windows treats as devices.
- **"Convert another" during a conversion** no longer lets the abandoned files turn up in
  the new session. Opening a file's details no longer risks stopping a long conversion.
- Seven readers that slowed sharply on long, odd input now take one pass.

### Changed

- **Previews** are drawn one at a time, and only for pictures up to 40 megapixels that state
  their size. Larger ones convert as before, without a preview.
- 31 new trap files, 457 in all. (A trap file is a file made on purpose to be broken,
  dishonest or hostile, which Omsett is tested against.) The record of the audit is on the
  Security page.

### Known

- The audit left four things open, all on the Security page: the live server needed
  restarting to send one security header; the main branch is not yet protected by its own
  checks; three supply-chain settings; and two warnings the picker does not yet give.

## 0.26.0

Released 23 November 2026.

Omsett is tested against "trap files": files made on purpose to be broken, hostile or
dishonest, to make sure each is refused or converted safely. Every one of them is now listed
on the site, and for each the page says what it is and what must happen to it.

### Added

- **Trap files**, a page reached from the foot of every page and from Technical details. All
  of them, by kind, each with what is wrong with it and what the tests require: refused,
  converted safely, or offered nothing. The page is read from the list the tests read.

### Changed

- **Counting visits loads no script at all.** A review found that serving Plausible's script
  from omsett.com would still have run another party's code in the page where the files are.
  Omsett's own code now makes the one small report itself. Counting had not yet been switched
  on, so no visit was ever counted the old way.

## 0.25.0

Released 23 November 2026.

There is now a Settings page. It holds the choice of light or dark, a way to make Omsett forget
what it remembers on your device, and one new thing: whether your visit is counted.

### Added

- **Settings**, in the navigation at the top of every page and again at the foot, marked with
  a small gear. Appearance (dark, light, or as your device is
  set), and "Forget my settings".
- **Counting visits, which you can turn off.** omsett.com counts how many people open it, with
  Plausible, which sets no cookie and keeps no record of a person. It learns that a page was
  opened. It never learns what was converted, and no file is any part of it.
- **It is off without your doing anything if your browser asks not to be tracked** (Do Not
  Track, or Global Privacy Control). Settings says which of the three it is: counted, turned
  off by you, or turned off by your browser.
- **No code of Plausible's runs in the page.** Omsett's own code makes one small report to
  omsett.com, which passes it on: that a page was opened, which page, and what linked to it.
  The page still asks no other site for anything, the security policy that stops it is
  unchanged, and the test that checks it still runs on every page.
- **A copy of Omsett you run yourself counts nothing** unless you set it up to. The Docker
  image has no counting in it, and Settings there says so.

### Known

- A change to whether visits are counted takes effect when the next page is opened.

## 0.24.0

Released 23 November 2026.

Every file you add now has a "Details" control beside "Remove". It shows what the file holds
besides what it shows: for a photograph, when and with what it was taken, and where; for a
document, who wrote it and what is still in it that its author may think is gone. Each line
says whether converting keeps it or removes it.

### Added

- **Details for a photograph**: the date it was taken, the camera and lens, the program that
  saved it, the photographer and copyright where they are recorded, and the place, as latitude
  and longitude, where the picture holds one. All of it is marked "removed when converted",
  because it is.
- **Details for a Word document, workbook or presentation**: title, author, who last changed
  it, when, and with what program; and what is inside that does not show: tracked changes,
  comments, hidden text, hidden sheets, speaker notes, macros.
- **Details for a PDF**: title, author, the program it was written in and the one that made
  the PDF, dates, pages, language, and whether it is tagged, which decides how well it will
  convert.
- **Details for the rest**: a font's family, style, version, licence and how many letters it
  has; what an archive holds and how large it unpacks; how many subtitles and over what span;
  a script's title page and number of scenes; what is in a Drafter package beside the script.
- **Read in the worker, on your device, when you ask.** Nothing is read until "Details" is
  pressed, and nothing is sent anywhere.
- **Overflow fuzzing.** For every format that is bytes and not text, 34 of them, the sample
  is damaged about 340 ways: each size, count and offset in its header set to nothing, to the
  most its field holds, and to either side of where a signed number turns negative; the file
  cut short; stretches inverted. That is some 11,500 damaged files on every test run. Each must
  be refused or convert to a real file. A conversion that never comes back, a result that is
  not what it claims, or a damaged file that brings an engine down fails the run. On its first
  run there were none of the three.
- Asking for the details of every trap file is part of the trap tests: it never fails, whatever
  the file.
- **A full entry for the word "omsett" on the About page**: how it is said, its three
  meanings in Norwegian, its forms in Nynorsk and Bokmål, where it comes from, the words
  beside it, and why it is the name.

### Known

- Details are what Omsett reads, not everything a file can hold. XMP data in pictures, and the
  properties of audio and video, are not listed yet.
- The date "last changed on this device" is the one your computer keeps for the file. It is not
  inside the file.

## 0.23.0

Released 23 November 2026.

Omsett now reads PDFs: drop one and get a web page, Markdown or a Word document. Where a PDF is
tagged, its headings, lists and tables are read from the tags and not guessed; where it is not,
they are estimated from the layout, and the result says which happened.

### Added

- **PDF to HTML, Markdown and DOCX.** A PDF records where letters sit on a page. A tagged PDF
  also says what they are, and Omsett reads that: headings at their levels, paragraphs, lists,
  tables with their header cells, links, and the description of each picture.
- **Tags are believed only when they earn it.** Two things are checked: that the tags say what
  the text is (tags that mark each page as one block say nothing), and that they cover the
  text (a PDF tagged only for its pictures would otherwise come out with its pictures'
  descriptions and none of its words). Both cases were found in real reports.
- **An untagged PDF has its structure estimated**: larger type is a heading, a line that opens
  with a bullet or a number is a list item, close lines are one paragraph, a word hyphenated
  across two lines is rejoined, and a page number alone at the foot of a page is left out.
- **The result says how it was read**: from the PDF's own tags; estimated because there are no
  tags; or estimated although there are tags, because they do not describe the text.
- **A scan is recognised and refused**: "This PDF has no text in it. It may be a scan."
- **Nothing in a PDF is run.** Programs set to run on opening, links that start programs or
  whose address is a script, and files attached inside are never called, opened or carried.
- **A "code" trap for every format Omsett reads**, 35 in all: one adversarial payload (script
  tags, handlers, links that are code, template and shell injections, names that change every
  JavaScript object) planted wherever each format holds text.
- **A check after every trap, old and new, that nothing ran**: no mark set, no object changed,
  no file written, no dialog opened, no request to another site.
- **Every combination for the code traps**: each is converted to every format its kind can
  become, 654 conversions, and each result is either a clean refusal or a real file with no
  live script in it.
- 13 trap files for PDF: a program that runs on opening, links that start programs, a file
  attached inside, a password, a scan, a list of pages that holds itself, tags five thousand
  deep, and a PDF tagged only for its pictures.

### Changed

- **Anything shaped like a tag is removed from every subtitle's words**, whatever format they
  came from. Before, only SRT and WebVTT were treated this way, and a script tag in an ASS or
  SBV file was carried into the SRT made from it.
- The PDF reader is pdf.js, the one Firefox uses for every PDF on the web. It is about 1.8 MB
  and is fetched with the first PDF. New dependency (Apache-2.0).

### Known

- **Tables are found only in tagged PDFs.** From layout alone, a table comes out as lines.
- Pictures in a PDF are not carried, only their descriptions, where the PDF gives them.
- A scanned PDF cannot be read. Reading the words in a picture (OCR) is planned.
- In an untagged PDF, a heading set in bold at the size of the text around it is not found,
  and text in several columns is read in the order the PDF stores it, which is usually but not
  always the order it is read in.
- Some PDFs in Chinese, Japanese and Korean need tables of characters that are not shipped yet,
  and may come out with characters missing.
- PDF is read, not written. Writing PDF, tagged, is planned.
- The accessibility of the result is not yet measured against the original's.

## 0.22.0

Released 23 November 2026.

Omsett now converts screenplays: Fountain, Final Draft (FDX) and the Drafter package, each to
the others. Take a script written in plain text into Final Draft, bring a Final Draft script
back to plain text, or pack either as a Drafter package.

### Added

- **Fountain to and from Final Draft.** Scene headings and their numbers, action, characters,
  parentheticals, dialogue, two characters speaking at once, transitions, centred lines,
  lyrics, page breaks, bold, italics and underline, and the title page.
- **The Drafter package (`.drafter`), read and written**, to the published specification. From
  a package, the script inside is taken exactly as it was written. Into a package, a Fountain
  script goes in exactly as it was written, with a manifest that names it and records its
  checksum.
- **What is not the script is not carried across.** From Fountain: notes to self (`[[ ]]`),
  scenes set aside (`/* */`), and the headings and summaries of an outline. From Final Draft:
  notes attached to lines and revision marks. From a Drafter package: earlier drafts, cut
  material, the workbook and voice notes, which are the writer's own papers.
- **Nothing typed in a script can become a tag** in the Final Draft file it is written to.
- **A side-by-side view** of the script before and after, since all three are text inside.
- 26 trap files: a script that types the tags of the file it will become, eighty thousand
  marks that open nothing, the "billion laughs" as a line of action, a package whose manifest
  says the script is a file outside it, a manifest of two megabytes, a package of prose, and a
  package whose script is 300 MB of spaces.
- No new dependency.

### Changed

- **A file named `.fountain` is a screenplay.** Fountain is plain text with no mark of its own,
  so, as with Markdown, only its name can say what it is.

### Known

- Line breaks inside a block of action or a speech become separate paragraphs in Final Draft,
  which has no other way to hold them.
- A Final Draft "Shot" becomes action in Fountain, which has no such element.
- From a Final Draft title page, the title and the writer's name are read. Other lines on it
  are not.
- A Drafter package that holds prose (a novel or a Markdown document) is recognised and not
  converted here: its text is the Markdown file inside it.
- Page and scene numbering, revision colours, locked pages and production reports are not
  carried.
- A script to PDF, laid out to the industry's rules, comes with the PDF work.

## 0.21.0

Released 23 November 2026.

Omsett now reads PowerPoint presentations. Drop a PPTX and get a web page or Markdown, with
each slide as a section under its own title. Bullets keep their levels, tables stay tables,
and each picture keeps its description.

### Added

- **PPTX to HTML and to Markdown.** One heading for the presentation, then one for every slide,
  in the order the slides are shown. A slide with no title is headed "Slide 4", so every
  section can still be reached by its heading.
- **Bullets at their levels**, bold and italics, links, tables with their header rows, and
  pictures carried inside the page with the descriptions their authors gave them.
- **What the audience was not shown is not carried across.** Hidden slides and speaker notes
  are not read, nor is the author's name.
- **Nothing is fetched and nothing is run.** A picture kept on another site is not loaded. A
  link that is a script, or that starts a program when clicked during the show, keeps its
  words and loses its address.
- The caution shown on every document conversion applies here too: check headings, picture
  descriptions and table headers before publishing.
- 16 trap files: the "billion laughs" as a slide title, a list that names one slide two
  thousand times, a slide of 300 MB of spaces, a link
  that starts a program, a picture said to be a file elsewhere on the computer, shapes grouped
  two hundred deep, and a presentation with every slide hidden.
- No new dependency.

### Changed

- **The tooltip on a format is easier to see and to read.** It sits above the format, or below
  where there is no room above, on a ground a step lighter than the page with a line round it
  and a small pointer. It is narrower, so a long explanation is several short lines.

### Known

- **PPTX is read, not written.** Making slides from a page means deciding what goes on each
  slide, which is design, not conversion.
- Layout, animations, transitions, charts, SmartArt, and sound or video on a slide are not
  carried. What is carried is the words, their structure, and the pictures.
- Speaker notes are left out. A choice to include them is planned, for handouts.
- The older PPT is recognised and not converted.

## 0.20.0

Released 23 November 2026.

Every format a file can become now has its own Convert button, so one file can be converted to
several formats, one press each. The main Convert button stays at the foot of the window once a
format is picked. And a spreadsheet or CSV offers two choices: whether its first row holds the
column names, and what shape the result should take.

### Added

- **A Convert button on every available format**: under the text of each large tile, and at
  the right of each line in the list. One press converts to that format with its usual
  settings; there is no need to choose it first.
- **One file, several formats.** Converting to a second format adds its result beside the
  first. Converting to the same format again replaces that result only. "Download all as a
  ZIP" takes every result.
- **Why a format is not available**, on hover with a mouse and on a press with a finger, as
  well as in the text beside it.

- **"The first row holds the column names"**, for XLSX, CSV and TSV. It is on by default.
  Turned off, the first row is data like the rest and the columns are called column_A, column_B
  and so on. Before, a sheet with no row of names had its first row taken as the names and
  left out of the data.
- **A choice of shape** when a table becomes JSON or YAML: records (each row names its columns,
  which is what most programs expect), rows (the names once, then plain lists of values), or
  columns (each column's values together).
- Changing either choice after converting converts again, and the view of the result follows.
- **A view of the result when the original is not text.** A workbook or Word document turned
  into JSON, CSV, Markdown or HTML now shows the start of what was made. Before, the view
  appeared only when both sides were text.

### Changed

- **The Convert button is pinned to the foot of the window** once there is a file and a format,
  with a line beside it naming them: "report.xlsx → JSON", or "3 files → JSON". Before, it sat
  below the whole list of formats and had to be looked for.
- The button says where it is going: "Convert to JSON".

## 0.19.0

Released 23 November 2026.

Omsett now converts Word documents. Drop a DOCX and get Markdown or a web page; drop Markdown
or a web page and get a Word document. Headings stay headings, lists stay lists, tables keep
their header rows, and each picture keeps its description.

### Added

- **DOCX to HTML and to Markdown.** Headings (found by what the style is, in whatever language
  Word named it), bold, italics, links, lists inside lists, tables, quotations, and pictures.
  The page takes the document's own language and title.
- **HTML and Markdown to DOCX.** Headings are written in Word's heading styles, so Word's
  navigation and a screen reader can list them. Lists are real lists. The first row of a table
  is marked as its headers. The document states its language and its title.
- **Picture descriptions are carried both ways.** A picture in a Word document comes out with
  the description its author gave it, and a picture with `alt` text goes into Word with that
  as its description.
- **What a document does not say is not carried across.** Text deleted with changes tracked,
  text formatted as hidden, comments, and the author's name stay out. Many people believe
  these are gone from a document they send; they are not, and a converter that copied them
  would publish them.
- **Nothing is fetched and nothing is run.** A picture or template that a document loads from
  another site when opened is not loaded. Macros and embedded web pages are never read. A link
  whose address is a script keeps its words and loses its address.
- **A caution on every document conversion**: the result may have more accessibility problems
  than the original, and what to check before publishing it.
- 17 trap files: the "billion laughs" as a paragraph, a document that asks for a file from the
  computer, one that fetches its template and a macro from elsewhere, a web page smuggled
  inside, a link that is a script, deleted and hidden words, and tables two hundred deep.
- No new dependency.

### Changed

- A picture carried inside a web page (as a `data:` address) is now kept when the page becomes
  Markdown. Before, it became an empty link.

### Known

- **Fonts, colours, page layout, headers, footers, footnotes, columns and text boxes are not
  carried.** What is carried is the structure and the words.
- Superscript and subscript survive to HTML and to Word, not to Markdown, which has neither.
- A picture kept on a website is not fetched into a Word document: its description is written
  in its place, linked to where the picture is.
- Pictures inside a document are carried inside the Markdown as long `data:` addresses. Saving
  them as separate files is planned.
- A Word document made from Markdown is marked as English unless it goes by way of a web page
  with another language chosen.
- The older DOC, and DOCX locked with a password, are recognised and not converted.
- The accessibility of converted documents is not yet measured automatically. The caution is
  shown in every case.

## 0.18.0

Released 23 November 2026.

Omsett now converts Excel workbooks. Drop an XLSX and get a CSV or JSON, or drop a CSV and get
a workbook that Excel, Numbers and Google Sheets open. Dates come out as dates, and a formula
comes out as the value it last showed.

### Added

- **XLSX, read and written**, to and from CSV, TSV, JSON, JSON Lines, YAML, TOML and XML, and
  on to contacts (vCard) and calendars (iCalendar).
- **Reading keeps what each cell is.** Numbers are numbers, text that looks like a number
  (a postcode such as 01234) stays text, true and false stay so, and a number shown as a date
  is read as the date: `2026-11-23`, or `2026-11-23T14:30:00` where it has a time.
- **Nothing in a workbook is run.** A formula is not worked out; the value it last showed is
  stored beside it and that is what is read. Macros, links to other files and embedded objects
  are never opened.
- **Hidden sheets are not read.** The first sheet that is shown and has rows is the one
  converted.
- **Writing never makes a formula.** Text is written as text, so a cell that reads `=1+1` is
  those four characters in Excel too.
- 19 trap files: the "billion laughs" inside a sheet, a sheet of two thousand cells that
  lays out as thirty-two million, a sheet that is 300 MB of spaces, a
  workbook that asks for a file from the computer, formulas that start programs and send cells
  elsewhere, a sheet said to be a file outside the workbook, a row of two million cells, and
  dates that are no day there has been.
- No new dependency. A workbook is a ZIP of XML, and Omsett already reads both itself.

### Known

- **Only the first sheet is converted.** A way to choose the sheet is planned.
- Formatting, column widths, charts, comments and merged cells are not carried over.
- The workbook Omsett writes has one plain sheet, with the column names in bold.
- A workbook locked with a password, the older XLS, and the macro-enabled XLSM are recognised
  and not converted.
- A date before 1900 has no number in Excel, so workbooks hold such dates as text, and they
  are read as text.

## 0.17.0

Released 23 November 2026.

Omsett now converts archives: ZIP, TAR and TAR.GZ, each to the others. When you convert several
files at once, one button downloads them all as a single ZIP. And a file dropped anywhere on the
page is now picked up, not only one dropped on the box.

### Added

- **Three archive formats: ZIP, TAR, TAR.GZ.** An archive is unpacked into its files and
  folders in the tab's memory and packed again as the other kind. Names, contents, dates and
  which files are programs are kept. Nothing is written to your disk and no file inside is
  opened or run.
- **"Download all as a ZIP"** when a batch gives more than one result. Two results with the
  same name are told apart: `sample.json` and `sample (2).json`.
- **Archives are treated as hostile.** An archive that unpacks to more than 256 MB, or holds
  more than 10,000 files, is refused from the sizes it states, before anything is unpacked. A
  file that unpacks to more than it said is stopped at the size it gave. A file named to land
  outside the folder (`../../etc/…`, an absolute path, a Windows drive letter) means the whole
  archive is refused. Links, devices and pipes are left out. Files that overlap, the same name
  twice, and a list of contents that disagrees with the contents are all refused.
- **Who owned the files is not carried over.** A TAR records the user name of whoever made it;
  the one Omsett writes does not.
- 46 trap files for archives: three kinds of bomb, eight ways of climbing out of the folder
  (one with an invisible mark between the dots, which a first version let through), a
  thousand files that are all the same hundred bytes, a file with two names, a name written
  backwards with an invisible mark, links to the rest of the computer, and a ZIP inside a ZIP
  six deep.
- No new dependency: the reader and writer are Omsett's own, on the compression every browser
  has built in.

### Changed

- **A file dropped anywhere on the page is taken.** Before, a drop that missed the box made the
  browser leave the page and open the file.
- **Step 2 no longer says "Drop a file"**, which read as if step 2 were where to drop it. It
  says "Add a file above to see what it can become."
- **A file Omsett recognises but does not convert says so by name**: "XLSX is not supported
  yet", in place of "Unsupported format". "Unsupported format" is kept for files Omsett cannot
  identify at all.
- No empty picture square beside a file that is not a picture.
- `notes.tar.gz` converted to ZIP is named `notes.zip`, not `notes.tar.zip`.

### Known

- 7Z, RAR, TAR.BZ2, TAR.XZ and plain GZ are not read yet.
- Archives over 256 MB, password-protected ZIPs, and ZIPs in the ZIP64 form are refused.
- There is no way yet to take single files out of an archive, or to see a list of what is in
  one.
- XLSX, DOCX and other office files are ZIPs inside, but are recognised as what they are and
  not offered as archives.

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
