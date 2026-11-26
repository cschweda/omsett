#!/usr/bin/env python3
"""Writes OpenDocument spreadsheets (ODS).

    python3 fixtures/_tools/ods.py        writes fixtures/ods/sample.ods

Standard library only, and the same bytes every time. sample.ods holds what xlsx/sample.xlsx and
xls/sample.xls hold, cell for cell, so that the three readers can be held to the same answer:
a hidden sheet in front of two shown ones, numbers, money and a percentage as numbers, dates
and a moment as dates, text in two paragraphs, text that looks like a number, truths, formulas
beside the values they last showed, an error, and text with a guide to its pronunciation.

It is laid out as LibreOffice lays one out, empty cells and rows repeated to the edge of the
sheet, and it holds what must not come out: a comment on a cell, and the hidden sheet.

It is also how the traps for this format are made (make-traps.py).
"""
import io
import os
import zipfile

FIXTURES = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHEET = "application/vnd.oasis.opendocument.spreadsheet"
NS = (
    'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" '
    'xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" '
    'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" '
    'xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" '
    'xmlns:dc="http://purl.org/dc/elements/1.1/" '
    'xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0" '
    'xmlns:of="urn:oasis:names:tc:opendocument:xmlns:of:1.2" '
    'xmlns:calcext="urn:org:documentfoundation:names:experimental:calc:xmlns:calcext:1.0" '
    'office:version="1.3"'
)
STYLES = ('<style:style style:name="ta1" style:family="table"><style:table-properties table:display="true"/></style:style>'
          '<style:style style:name="ta2" style:family="table"><style:table-properties table:display="false"/></style:style>')


def esc(text):
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def text(*lines):
    """A cell of text: a paragraph to each line, each line given as XML."""
    return '<table:table-cell office:value-type="string" calcext:value-type="string">%s</table:table-cell>' % "".join("<text:p>%s</text:p>" % line for line in lines)


def number(value, kind="float", formula=None):
    return '<table:table-cell%s office:value-type="%s"%s office:value="%s" calcext:value-type="%s"><text:p>%s</text:p></table:table-cell>' % (
        ' table:formula="%s"' % formula if formula else "", kind, ' office:currency="GBP"' if kind == "currency" else "", value, kind, value)


def date(value):
    return '<table:table-cell office:value-type="date" office:date-value="%s" calcext:value-type="date"><text:p>%s</text:p></table:table-cell>' % (value, value)


def truth(value):
    return '<table:table-cell office:value-type="boolean" office:boolean-value="%s" calcext:value-type="boolean"><text:p>%s</text:p></table:table-cell>' % (
        "true" if value else "false", "TRUE" if value else "FALSE")


def error(shown, formula):
    """A formula that failed, as LibreOffice writes one: a number it does not mean, and the error it shows."""
    return '<table:table-cell table:formula="%s" office:value-type="float" office:value="0" calcext:value-type="error"><text:p>%s</text:p></table:table-cell>' % (formula, shown)


EMPTY = "<table:table-cell/>"


def row(*cells, repeat_after=None):
    """A row of cells, and the empty cells LibreOffice repeats after them to the edge of the sheet."""
    after = '<table:table-cell table:number-columns-repeated="%d"/>' % repeat_after if repeat_after else ""
    return "<table:table-row>%s%s</table:table-row>" % ("".join(cells), after)


def sheet(name, rows, hidden=False, columns=8):
    return '<table:table table:name="%s" table:style-name="%s"><table:table-column table:number-columns-repeated="%d"/>%s</table:table>' % (
        esc(name), "ta2" if hidden else "ta1", columns, "".join(rows))


def workbook(sheets, mimetype=SHEET, encrypted=False, prolog="", extra=None, styles=STYLES):
    content = ('<?xml version="1.0" encoding="UTF-8"?>%s<office:document-content %s><office:automatic-styles>%s</office:automatic-styles>'
               '<office:body><office:spreadsheet>%s</office:spreadsheet></office:body></office:document-content>' % (prolog, NS, styles, "".join(sheets)))
    meta = ('<?xml version="1.0" encoding="UTF-8"?><office:document-meta %s><office:meta><dc:title>Test pattern</dc:title>'
            '<meta:initial-creator>SECRET-AUTHOR</meta:initial-creator><meta:generator>fixtures/_tools/ods.py</meta:generator></office:meta></office:document-meta>' % NS)
    secret = '<manifest:encryption-data manifest:checksum-type="SHA1/1K" manifest:checksum="x"/>' if encrypted else ""
    manifest = ('<?xml version="1.0" encoding="UTF-8"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3">'
                '<manifest:file-entry manifest:full-path="/" manifest:media-type="%s"/>'
                '<manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml">%s</manifest:file-entry>'
                '<manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/></manifest:manifest>' % (mimetype, secret))
    parts = [("mimetype", mimetype.encode()), ("content.xml", content.encode()), ("meta.xml", meta.encode()), ("META-INF/manifest.xml", manifest.encode())]
    parts += list((extra or {}).items())
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w") as z:
        for name, data in parts:
            info = zipfile.ZipInfo(name, (2026, 11, 26, 12, 0, 0))
            # The type comes first and is stored as it is, so that it can be read without unpacking.
            info.compress_type = zipfile.ZIP_STORED if name == "mimetype" else zipfile.ZIP_DEFLATED
            z.writestr(info, data)
    return out.getvalue()


COMMENT = '<office:annotation><dc:creator>SECRET-AUTHOR</dc:creator><text:p>SECRET-COMMENT on a cell</text:p></office:annotation>'
PEOPLE = [
    row(*[text(name) for name in ["id", "name", "born", "joined", "salary", "note", "postcode", "active"]], repeat_after=1016),
    row(number(1), text("Ada Lovelace"), date("1815-12-10"), date("2026-11-23T00:00:00"), number(1234.5, "currency"),
        text(esc("Wrote the first program, & said so <plainly>"), "in two lines"), text("01234"), truth(True), repeat_after=1016),
    # A formula gives the value it last showed. Text in runs of differing style is joined; the
    # guide to its pronunciation is not text. A comment on a cell is not the cell.
    row(number(2, formula="of:=[.A2]+1"),
        '<table:table-cell office:value-type="string"><text:p><text:span>Grace </text:span><text:span>Hop</text:span>per'
        '<text:ruby><text:ruby-base></text:ruby-base><text:ruby-text>ホッパー</text:ruby-text></text:ruby></text:p>%s</table:table-cell>' % COMMENT,
        date("1906-12-06"), date("2026-11-23T14:30:00"), number(0.1, "percentage"), EMPTY, number(10001), truth(False), repeat_after=1016),
    row(number(3, formula="of:=[.A3]+1"), text("Café 字幕"), EMPTY, EMPTY, EMPTY, text("<text:span>a</text:span>b"), EMPTY, error("#DIV/0!", "of:=1/0"), repeat_after=1016),
    '<table:table-row table:number-rows-repeated="1048572"><table:table-cell table:number-columns-repeated="1024"/></table:table-row>',
]
TOTALS = [row(text("total")), row(number(3, formula="of:=COUNT([$People.A2:.A4])"))]
SECRET = [row(text("not shown")), row(text("SECRET-HIDDEN-SHEET"))]


def sample():
    return workbook([sheet("Secret", SECRET, hidden=True), sheet("People", PEOPLE), sheet("Totals", TOTALS, columns=1)])


def events():
    """What xlsx/events.xlsx holds: a table of events, for the conversions to a calendar."""
    return workbook([sheet("Events", [
        row(text("summary"), text("start"), text("end"), text("location")),
        row(text("Planning meeting, room 4"), date("2026-11-23T09:00:00"), date("2026-11-23T10:00:00"), text("Springfield")),
        row(text("Holiday"), date("2026-12-25"), date("2026-12-26")),
        row(text("Release"), date("2027-01-04")),
    ], columns=4)])


if __name__ == "__main__":
    os.makedirs(os.path.join(FIXTURES, "ods"), exist_ok=True)
    for name, make in [("sample.ods", sample), ("events.ods", events)]:
        full = os.path.join(FIXTURES, "ods", name)
        with open(full, "wb") as out:
            out.write(make())
        print(f"ods/{name}: {os.path.getsize(full)} bytes")
