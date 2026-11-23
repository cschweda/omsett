#!/usr/bin/env python3
"""Writes the sample fonts: one small typeface of Omsett's own, in four containers.

    python3 -m venv /tmp/fonts && /tmp/fonts/bin/pip install fonttools brotli
    /tmp/fonts/bin/python fixtures/_tools/make-fonts.py

The typeface is six glyphs drawn here (the letters of "omset" as plain blocks, and a space), so
nobody else's font, or its licence, is in the repository. It is written with TrueType outlines
(sample.ttf, sample.woff, sample.woff2) and with PostScript outlines (sample.otf, and
postscript.woff and postscript.woff2, web fonts that unwrap to OTF and not to TTF).

Unlike make-traps.py this needs fontTools. Its output is committed; run it only to change it.
"""
import os

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.t2CharStringPen import T2CharStringPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont

HERE = os.path.dirname(os.path.abspath(__file__))
FIXTURES = os.path.dirname(HERE)

# Each glyph is a list of rectangles (x0, y0, x1, y1) on a 1000-unit em.
SHAPES = {
    ".notdef": [(100, 0, 500, 700)],
    "space": [],
    "o": [(80, 0, 520, 80), (80, 420, 520, 500), (80, 0, 160, 500), (440, 0, 520, 500)],
    "m": [(80, 0, 160, 500), (80, 420, 720, 500), (360, 0, 440, 500), (640, 0, 720, 500)],
    "s": [(80, 420, 520, 500), (80, 210, 520, 290), (80, 0, 520, 80), (80, 210, 160, 500), (440, 0, 520, 290)],
    "e": [(80, 0, 520, 80), (80, 210, 520, 290), (80, 420, 520, 500), (80, 0, 160, 500), (440, 210, 520, 500)],
    "t": [(240, 0, 320, 640), (80, 420, 480, 500), (240, 0, 480, 80)],
}
ADVANCE = {".notdef": 600, "space": 300, "o": 600, "m": 800, "s": 600, "e": 600, "t": 560}
ORDER = list(SHAPES)
CMAP = {ord(name): name for name in ORDER if len(name) == 1} | {0x20: "space"}
NAMES = {"familyName": "Omsett Sample", "styleName": "Regular"}


def draw(pen, name):
    for x0, y0, x1, y1 in SHAPES[name]:
        pen.moveTo((x0, y0))
        pen.lineTo((x0, y1))
        pen.lineTo((x1, y1))
        pen.lineTo((x1, y0))
        pen.closePath()


def build(postscript: bool) -> FontBuilder:
    fb = FontBuilder(1000, isTTF=not postscript)
    fb.setupGlyphOrder(ORDER)
    fb.setupCharacterMap(CMAP)
    if postscript:
        strings = {}
        for name in ORDER:
            pen = T2CharStringPen(ADVANCE[name], None)
            draw(pen, name)
            strings[name] = pen.getCharString()
        fb.setupCFF("OmsettSample-Regular", {"FullName": "Omsett Sample"}, strings, {})
        bearings = {name: min((s[0] for s in SHAPES[name]), default=0) for name in ORDER}
    else:
        glyphs = {}
        for name in ORDER:
            pen = TTGlyphPen(None)
            draw(pen, name)
            glyphs[name] = pen.glyph()
        fb.setupGlyf(glyphs)
        bearings = {name: glyphs[name].xMin if SHAPES[name] else 0 for name in ORDER}
    fb.setupHorizontalMetrics({name: (ADVANCE[name], bearings[name]) for name in ORDER})
    fb.setupHorizontalHeader(ascent=800, descent=-200)
    fb.setupNameTable(NAMES)
    fb.setupOS2(sTypoAscender=800, sTypoDescender=-200, usWinAscent=800, usWinDescent=200)
    fb.setupPost()
    # A fixed date, so running this twice writes the same bytes.
    fb.font["head"].created = fb.font["head"].modified = 3_800_000_000
    return fb


def save(font: TTFont, path: str, flavor=None):
    font.flavor = flavor
    full = os.path.join(FIXTURES, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    font.save(full, reorderTables=True)
    print(f"{path}: {os.path.getsize(full)} bytes")


os.environ["SOURCE_DATE_EPOCH"] = "1700000000"
truetype = build(False).font
save(truetype, "ttf/sample.ttf")
save(truetype, "woff/sample.woff", "woff")
save(truetype, "woff2/sample.woff2", "woff2")
postscript = build(True).font
save(postscript, "otf/sample.otf")
save(postscript, "woff/postscript.woff", "woff")
save(postscript, "woff2/postscript.woff2", "woff2")
