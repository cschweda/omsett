#!/usr/bin/env python3
"""Writes the sample EPUBs, file by file, the way a publisher's tools write one.

    python3 fixtures/_tools/epub.py

Standard library only, and the same bytes every time. The sample uses what real books use:
pages in one folder and pictures in another, so that every link is a path to be worked out; a
note linked from one page to a mark on another; tags written closed (<a id="x"/>), as XML
allows and a web page does not; a cover named in the book's list; a list of contents in the
newer form and in the older. `older.epub` is the same book as EPUB 2 wrote it: the older list
of contents alone, a document type on every file, and a cover that is a drawing.
"""
import io
import os
import sys
import zipfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kindle import png  # noqa: E402

FIXTURES = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
XHTML = "http://www.w3.org/1999/xhtml"
OPS = "http://www.idpf.org/2007/ops"
STYLE = "body { font-family: serif; }\nh1 { text-align: center; }\n.note { font-size: 0.9em; }\n"

CONTAINER = '<?xml version="1.0"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="%s" media-type="application/oebps-package+xml"/></rootfiles></container>\n'

ONE = (
    '<h1 id="start">Sample book</h1><a id="page-1"/>'
    '<p>A short book written for the tests of <a href="https://omsett.com/">Omsett</a>.</p>'
    '<p><img src="../images/square.png" alt="A blue square"/></p>'
)
TWO = (
    '<h1>The first chapter</h1><span class="pagebreak" id="page-2"/>'
    '<p>It was a <b>plain</b> morning, and the file was <i>small</i>. See <a href="notes.xhtml#note-1">the note at the end</a>.</p>'
    "<p>Caf\u00e9, \u5b57\u5e55, and a second paragraph.</p>"
    '<h2 id="kinds">What it holds</h2>'
    "<ul><li>Pages</li><li>Pictures<ul><li>A blue square</li></ul></li></ul>"
    "<table><thead><tr><th>Format</th><th>Kind</th></tr></thead><tbody><tr><td>EPUB</td><td>Book</td></tr></tbody></table>"
)
NOTES = '<h1>Notes</h1><p class="note" id="note-1">The note: nothing in this book is real. <a href="chapter%201.xhtml#kinds">Back</a>.</p>'
PAGES = [("title.xhtml", "Sample book", ONE), ("chapter 1.xhtml", "The first chapter", TWO), ("notes.xhtml", "Notes", NOTES)]


def page(title, body, head="", doctype="<!DOCTYPE html>"):
    return f'<?xml version="1.0" encoding="utf-8"?>\n{doctype}\n<html xmlns="{XHTML}" xmlns:epub="{OPS}" xml:lang="en" lang="en"><head><title>{title}</title><link rel="stylesheet" type="text/css" href="../styles/book.css"/>{head}</head><body>{body}</body></html>\n'


def packed(files):
    """The files as a ZIP, the same bytes every time. What kind of file it is comes first and is stored as it is."""
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w") as z:
        for name, data in [("mimetype", b"application/epub+zip")] + [item for item in files if item[0] != "mimetype"]:
            info = zipfile.ZipInfo(name, (2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_STORED if name == "mimetype" else zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            z.writestr(info, data.encode() if isinstance(data, str) else data)
    return out.getvalue()


def book(pages=None, title="Sample book", author="Omsett", older=False, extra=None, change=None, list_head="", style=STYLE, contents=True):
    """
    pages    (file name, title, body) for each page, in reading order
    older    write the book as EPUB 2 did
    extra    files to add, as (path, data)
    change   called with the dict of parts before they are packed, to break something
    """
    pages = PAGES if pages is None else pages
    from xml.sax.saxutils import escape, quoteattr
    href = lambda name: name.replace(" ", "%20")  # noqa: E731
    items = "".join(f'<item id="p{i}" href={quoteattr("text/" + href(name))} media-type="application/xhtml+xml"/>' for i, (name, _, _) in enumerate(pages))
    spine = "".join(f'<itemref idref="p{i}"/>' for i in range(len(pages)))
    points = "".join(f'<navPoint id="n{i}" playOrder="{i + 1}"><navLabel><text>{escape(label)}</text></navLabel><content src={quoteattr("text/" + href(name))}/></navPoint>' for i, (name, label, _) in enumerate(pages))
    ncx = ('<?xml version="1.0" encoding="utf-8"?>\n' + ('<!DOCTYPE ncx PUBLIC "-//NISO//DTD ncx 2005-1//EN" "http://www.daisy.org/z3986/2005/ncx-2005-1.dtd">\n' if older else "")
           + f'<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head><meta name="dtb:uid" content="urn:uuid:0"/></head><docTitle><text>{escape(title)}</text></docTitle><navMap>{points}</navMap></ncx>\n')
    nav = page("Contents", '<nav epub:type="toc"><h1>Contents</h1><ol>' + "".join(
        f'<li><a href={quoteattr("text/" + href(name))}>{escape(label)}</a>' + ('<ol><li><a href="text/chapter%201.xhtml#kinds">What it holds</a></li></ol>' if name == "chapter 1.xhtml" else "") + "</li>" for name, label, _ in pages) + "</ol></nav>").replace("../styles/", "styles/")
    cover_role = "" if older else ' properties="cover-image"'
    nav_item = "" if older or not contents else '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>'
    opf = (
        f'<?xml version="1.0" encoding="utf-8"?>\n<package xmlns="http://www.idpf.org/2007/opf" version="{"2.0" if older else "3.0"}" unique-identifier="id">{list_head}'
        f'<metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">urn:uuid:0</dc:identifier><dc:title>{escape(title)}</dc:title><dc:creator>{escape(author)}</dc:creator>'
        f'<dc:language>en</dc:language><dc:publisher>Omsett</dc:publisher><meta name="cover" content="cover"/></metadata>'
        f'<manifest>{items}<item id="css" href="styles/book.css" media-type="text/css"/><item id="cover" href="images/square.png" media-type="image/png"{cover_role}/>'
        f'<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>{nav_item}</manifest>'
        f'<spine toc="ncx">{spine}</spine></package>\n'
    )
    doctype = '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">' if older else "<!DOCTYPE html>"
    parts = {"META-INF/container.xml": CONTAINER % "OEBPS/content.opf", "OEBPS/content.opf": opf, "OEBPS/toc.ncx": ncx, "OEBPS/styles/book.css": style, "OEBPS/images/square.png": png()}
    if not older and contents:
        parts["OEBPS/nav.xhtml"] = nav
    for name, label, body in pages:
        parts["OEBPS/text/" + name] = page(label, body, doctype=doctype)
    if older:
        # The cover as EPUB 2 books have it: a drawing with the picture in it, on a page of its own.
        cover = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 8 8"><image width="8" height="8" xlink:href="../images/square.png"/></svg>'
        parts["OEBPS/text/" + pages[0][0]] = page(pages[0][1], cover + pages[0][2].replace('<p><img src="../images/square.png" alt="A blue square"/></p>', ""), doctype=doctype)
    for path, data in extra or []:
        parts[path] = data
    if change:
        change(parts)
    return packed(list(parts.items()))


SAMPLES = {"epub/sample.epub": lambda: book(), "epub/older.epub": lambda: book(older=True)}

if __name__ == "__main__":
    for path, make in SAMPLES.items():
        full = os.path.join(FIXTURES, path)
        os.makedirs(os.path.dirname(full), exist_ok=True)
        with open(full, "wb") as out:
            out.write(make())
        print(f"{path}: {os.path.getsize(full)} bytes")
