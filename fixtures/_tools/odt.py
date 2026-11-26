#!/usr/bin/env python3
"""Writes OpenDocument text documents (ODT).

    python3 fixtures/_tools/odt.py        writes fixtures/odt/sample.odt

Standard library only, and the same bytes every time. sample.odt is laid out as LibreOffice
lays one out: headings as headings with their levels, bold and slanted words by the styles
their runs are given, a link, a list of bullets inside a list, a numbered list, a table whose
first row is a row of headings, a picture with its description, and text in other scripts.

It also holds what must not come out: words deleted with changes tracked (kept apart from the
text, in a list of changes), a comment, a footnote, hidden words, a hidden paragraph, a hidden
section and the author's name. One made by another program is beside it, for that
(from-macos.odt, written by macOS's textutil).

It is also how the traps for this format are made (make-traps.py).
"""
import io
import os
import zipfile

FIXTURES = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEXT = "application/vnd.oasis.opendocument.text"
NS = (
    'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" '
    'xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" '
    'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" '
    'xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" '
    'xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" '
    'xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" '
    'xmlns:xlink="http://www.w3.org/1999/xlink" '
    'xmlns:dc="http://purl.org/dc/elements/1.1/" '
    'xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0" '
    'xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" '
    'office:version="1.3"'
)

AUTOMATIC = (
    '<style:style style:name="T1" style:family="text"><style:text-properties fo:font-weight="bold"/></style:style>'
    '<style:style style:name="T2" style:family="text"><style:text-properties fo:font-style="italic"/></style:style>'
    '<style:style style:name="T3" style:family="text" style:parent-style-name="Strong"><style:text-properties fo:font-style="italic"/></style:style>'
    '<style:style style:name="T4" style:family="text"><style:text-properties text:display="none"/></style:style>'
    '<style:style style:name="P1" style:family="paragraph" style:parent-style-name="Standard"><style:text-properties text:display="none"/></style:style>'
    '<style:style style:name="Sect1" style:family="section"/>'
    '<text:list-style style:name="L1">'
    '<text:list-level-style-bullet text:level="1" text:bullet-char="•"/>'
    '<text:list-level-style-bullet text:level="2" text:bullet-char="◦"/>'
    '</text:list-style>'
    '<text:list-style style:name="L2"><text:list-level-style-number text:level="1" style:num-format="1"/></text:list-style>'
)
STYLES = (
    '<office:styles>'
    '<style:default-style style:family="paragraph"><style:text-properties fo:language="en" fo:country="GB"/></style:default-style>'
    '<style:style style:name="Standard" style:family="paragraph"/>'
    '<style:style style:name="Heading_20_1" style:display-name="Heading 1" style:family="paragraph" style:default-outline-level="1"><style:text-properties fo:font-weight="bold"/></style:style>'
    '<style:style style:name="Strong" style:family="text"><style:text-properties fo:font-weight="bold"/></style:style>'
    '</office:styles>'
)


def p(inner, style="Standard"):
    return '<text:p text:style-name="%s">%s</text:p>' % (style, inner)


def h(inner, level):
    return '<text:h text:style-name="Heading_20_1" text:outline-level="%d">%s</text:h>' % (level, inner)


def span(inner, style):
    return '<text:span text:style-name="%s">%s</text:span>' % (style, inner)


def link(inner, address):
    return '<text:a xlink:type="simple" xlink:href="%s">%s</text:a>' % (address, inner)


def items(*entries, style=None):
    """A list. An entry is words, or (words, a list inside it)."""
    out = ""
    for entry in entries:
        words, inner = entry if isinstance(entry, tuple) else (entry, "")
        out += "<text:list-item>%s%s</text:list-item>" % (p(words), inner)
    return '<text:list%s>%s</text:list>' % (' text:style-name="%s"' % style if style else "", out)


def table(rows, headed=True):
    def row(cells):
        return "<table:table-row>%s</table:table-row>" % "".join("<table:table-cell>%s</table:table-cell>" % p(c) for c in cells)
    head = "<table:table-header-rows>%s</table:table-header-rows>" % row(rows[0]) if headed else row(rows[0])
    return '<table:table table:name="Table1"><table:table-column table:number-columns-repeated="%d"/>%s%s</table:table>' % (
        len(rows[0]), head, "".join(row(r) for r in rows[1:]))


def picture(path, description):
    return ('<draw:frame draw:name="Mark" text:anchor-type="as-char" svg:width="1in" svg:height="0.5in">'
            '<draw:image xlink:href="%s" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/>'
            '<svg:title>Mark</svg:title><svg:desc>%s</svg:desc></draw:frame>' % (path, description))


def document(body, title="About Omsett", author="SECRET-AUTHOR", pictures=None, changes="", mimetype=TEXT, encrypted=False, extra=None, prolog="", automatic=AUTOMATIC):
    """A document from its body. `changes` is the list of tracked changes, kept before the text; `prolog` goes before the root."""
    content = ('<?xml version="1.0" encoding="UTF-8"?>' + prolog + '<office:document-content %s><office:automatic-styles>%s</office:automatic-styles>'
               '<office:body><office:text>%s%s</office:text></office:body></office:document-content>' % (NS, automatic, changes, body))
    styles = '<?xml version="1.0" encoding="UTF-8"?><office:document-styles %s>%s</office:document-styles>' % (NS, STYLES)
    meta = ('<?xml version="1.0" encoding="UTF-8"?><office:document-meta %s><office:meta><dc:title>%s</dc:title>'
            '<meta:initial-creator>%s</meta:initial-creator><dc:creator>%s</dc:creator><meta:generator>fixtures/_tools/odt.py</meta:generator>'
            '</office:meta></office:document-meta>' % (NS, title, author, author))
    pictures = pictures or {}
    entries = "".join('<manifest:file-entry manifest:full-path="%s" manifest:media-type="image/png"/>' % name for name in pictures)
    secret = '<manifest:encryption-data manifest:checksum-type="SHA1/1K" manifest:checksum="x"/>' if encrypted else ""
    manifest = ('<?xml version="1.0" encoding="UTF-8"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3">'
                '<manifest:file-entry manifest:full-path="/" manifest:media-type="%s"/>'
                '<manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml">%s</manifest:file-entry>'
                '<manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>'
                '<manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/>%s</manifest:manifest>' % (mimetype, secret, entries))
    parts = [("mimetype", mimetype.encode()), ("content.xml", content.encode()), ("styles.xml", styles.encode()),
             ("meta.xml", meta.encode()), ("META-INF/manifest.xml", manifest.encode())]
    parts += [(name, data) for name, data in pictures.items()]
    parts += list((extra or {}).items())
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w") as z:
        for name, data in parts:
            info = zipfile.ZipInfo(name, (2026, 11, 26, 12, 0, 0))
            # The type comes first and is stored as it is, so that it can be read without unpacking.
            info.compress_type = zipfile.ZIP_STORED if name == "mimetype" else zipfile.ZIP_DEFLATED
            z.writestr(info, data)
    return out.getvalue()


CHANGES = ('<text:tracked-changes><text:changed-region text:id="ct1"><text:deletion>'
           '<office:change-info><dc:creator>SECRET-AUTHOR</dc:creator><dc:date>2026-11-26T12:00:00</dc:date></office:change-info>'
           '<text:p>SECRET-DELETED words that were taken out.</text:p></text:deletion></text:changed-region></text:tracked-changes>')


def sample():
    with open(os.path.join(FIXTURES, "png", "sample.png"), "rb") as f:
        png = f.read()
    body = "".join([
        h("What it does", 1),
        p(span("Nothing leaves your device.", "T1") + " It is " + span("free", "T2") + " and " + span("open", "T3") + " source; see " + link("omsett.com", "https://omsett.com") + "."),
        p('Files are converted<text:change text:change-id="ct1"/> in the tab.' + span(" SECRET-HIDDEN-WORDS", "T4")
          + '<office:annotation><dc:creator>SECRET-AUTHOR</dc:creator><text:p>SECRET-COMMENT</text:p></office:annotation>'
          + '<text:note text:id="n1" text:note-class="footnote"><text:note-citation>1</text:note-citation><text:note-body><text:p>SECRET-FOOTNOTE</text:p></text:note-body></text:note>'),
        p("SECRET-HIDDEN-PARAGRAPH", "P1"),
        '<text:section text:style-name="Sect1" text:name="Draft" text:display="none">%s</text:section>' % p("SECRET-HIDDEN-SECTION"),
        h("What it converts", 2),
        items("Pictures", ("Data", items("JSON and CSV", "Workbooks")), "Subtitles", style="L1"),
        items("Drop a file", "Pick a format", style="L2"),
        table([["Format", "Kind"], ["PNG", "Picture"], ["CSV", "Data"]]),
        p(picture("Pictures/mark.png", "The Omsett mark: a word in white with a blue square")),
        p("Café 字幕, and a line<text:line-break/>broken in two."),
    ])
    return document(body, pictures={"Pictures/mark.png": png}, changes=CHANGES)


if __name__ == "__main__":
    full = os.path.join(FIXTURES, "odt", "sample.odt")
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "wb") as out:
        out.write(sample())
    print(f"odt/sample.odt: {os.path.getsize(full)} bytes")
