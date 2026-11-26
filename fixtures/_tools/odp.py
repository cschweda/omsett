#!/usr/bin/env python3
"""Writes OpenDocument presentations (ODP).

    python3 fixtures/_tools/odp.py        writes fixtures/odp/sample.odp

Standard library only, and the same bytes every time. sample.odp holds what pptx/sample.pptx and
ppt/sample.ppt hold, slide for slide: a title slide, a slide of bullets at two levels with bold,
slanted and linked words and a box drawn by hand, a hidden slide, and a slide with a picture and
a table whose first row is headings. It is laid out as LibreOffice Impress lays one out.

It also holds what must not come out: speaker notes, a hidden slide, a shape that is not shown,
an empty placeholder with its prompt, the slide's number, and the author's name.

It is also how the traps for this format are made (make-traps.py).
"""
import io
import os
import zipfile

import odt as O

FIXTURES = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PRESENTATION = "application/vnd.oasis.opendocument.presentation"
NS = O.NS + ' xmlns:presentation="urn:oasis:names:tc:opendocument:xmlns:presentation:1.0"'
STYLES = (O.AUTOMATIC
          + '<style:style style:name="dp1" style:family="drawing-page"><style:drawing-page-properties presentation:visibility="visible"/></style:style>'
          + '<style:style style:name="dp2" style:family="drawing-page"><style:drawing-page-properties presentation:visibility="hidden"/></style:style>')
DEFAULTS = ('<office:styles><style:default-style style:family="graphic"><style:text-properties fo:language="en" fo:country="GB"/></style:default-style>'
            '<style:style style:name="Strong" style:family="text"><style:text-properties fo:font-weight="bold"/></style:style></office:styles>')


def box(inner, kind=None, placeholder=False, display=None):
    """A frame holding a box of text: a title, a subtitle, an outline, or one drawn by hand."""
    attributes = "".join([
        ' presentation:class="%s"' % kind if kind else "",
        ' presentation:placeholder="true"' if placeholder else "",
        ' draw:display="%s"' % display if display else "",
    ])
    return '<draw:frame svg:width="20cm" svg:height="3cm" svg:x="1cm" svg:y="1cm"%s><draw:text-box>%s</draw:text-box></draw:frame>' % (attributes, inner)


def page(name, shapes, hidden=False, notes=None):
    out = '<draw:page draw:name="%s" draw:style-name="%s" draw:master-page-name="Default">%s' % (name, "dp2" if hidden else "dp1", "".join(shapes))
    if notes:
        out += '<presentation:notes><draw:frame presentation:class="notes"><draw:text-box>%s</draw:text-box></draw:frame></presentation:notes>' % O.p(notes)
    return out + "</draw:page>"


def presentation(pages, title="About Omsett", author="SECRET-AUTHOR", pictures=None, mimetype=PRESENTATION, encrypted=False, prolog="", extra=None, styles=STYLES):
    content = ('<?xml version="1.0" encoding="UTF-8"?>%s<office:document-content %s><office:automatic-styles>%s</office:automatic-styles>'
               '<office:body><office:presentation>%s</office:presentation></office:body></office:document-content>' % (prolog, NS, styles, "".join(pages)))
    styled = '<?xml version="1.0" encoding="UTF-8"?><office:document-styles %s>%s</office:document-styles>' % (NS, DEFAULTS)
    meta = ('<?xml version="1.0" encoding="UTF-8"?><office:document-meta %s><office:meta><dc:title>%s</dc:title>'
            '<meta:initial-creator>%s</meta:initial-creator><meta:generator>fixtures/_tools/odp.py</meta:generator></office:meta></office:document-meta>' % (NS, title, author))
    pictures = pictures or {}
    secret = '<manifest:encryption-data manifest:checksum-type="SHA1/1K" manifest:checksum="x"/>' if encrypted else ""
    manifest = ('<?xml version="1.0" encoding="UTF-8"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3">'
                '<manifest:file-entry manifest:full-path="/" manifest:media-type="%s"/>'
                '<manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml">%s</manifest:file-entry>'
                '<manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>'
                '<manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/>%s</manifest:manifest>'
                % (mimetype, secret, "".join('<manifest:file-entry manifest:full-path="%s" manifest:media-type="image/png"/>' % n for n in pictures)))
    parts = [("mimetype", mimetype.encode()), ("content.xml", content.encode()), ("styles.xml", styled.encode()),
             ("meta.xml", meta.encode()), ("META-INF/manifest.xml", manifest.encode())]
    parts += list(pictures.items()) + list((extra or {}).items())
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w") as z:
        for name, data in parts:
            info = zipfile.ZipInfo(name, (2026, 11, 26, 12, 0, 0))
            info.compress_type = zipfile.ZIP_STORED if name == "mimetype" else zipfile.ZIP_DEFLATED
            z.writestr(info, data)
    return out.getvalue()


def sample():
    with open(os.path.join(FIXTURES, "png", "sample.png"), "rb") as f:
        png = f.read()
    bullets = ('<text:list text:style-name="L1">'
               '<text:list-item>%s</text:list-item>'
               '<text:list-item>%s<text:list><text:list-item>%s</text:list-item><text:list-item>%s</text:list-item></text:list></text:list-item>'
               '<text:list-item>%s</text:list-item></text:list>') % (
        O.p("Pictures"), O.p("Data, such as " + O.span("JSON", "T1") + " and " + O.span("CSV", "T2")),
        O.p("Workbooks"), O.p("Contacts"), O.p("See " + O.link("omsett.com", "https://omsett.com")))
    pages = [
        page("Title", [box(O.p("Omsett"), "title"), box(O.p("Drop a file. Pick a format."), "subtitle"), box(O.p("1"), "page-number")]),
        page("Converts", [
            box(O.p("What it converts"), "title"),
            box(bullets, "outline"),
            box(O.p("Nothing leaves your device.")),
            # Not shown, and a placeholder that was never filled in, showing its prompt.
            box(O.p("SECRET-HIDDEN-SHAPE"), display="none"),
            box(O.p("Click to add Text"), "outline", placeholder=True),
        ], notes="SECRET-SPEAKER-NOTES: not for the audience"),
        page("Hidden", [box(O.p("SECRET-HIDDEN-SLIDE"), "title")], hidden=True),
        page("Picture", [
            box(O.p("A picture and a table, café 字幕"), "title"),
            '<draw:frame svg:width="2cm" svg:height="1cm"><draw:image xlink:href="Pictures/mark.png" xlink:type="simple"/>'
            '<svg:title>Mark</svg:title><svg:desc>The Omsett mark: a word in white with a blue square</svg:desc></draw:frame>',
            '<draw:frame presentation:class="table">%s</draw:frame>' % O.table([["Format", "Kind"], ["PNG", "Picture"], ["XLSX", "Workbook"]]),
        ]),
    ]
    return presentation(pages, pictures={"Pictures/mark.png": png})


if __name__ == "__main__":
    full = os.path.join(FIXTURES, "odp", "sample.odp")
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "wb") as out:
        out.write(sample())
    print(f"odp/sample.odp: {os.path.getsize(full)} bytes")
