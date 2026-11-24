#!/usr/bin/env python3
"""Writes Kindle books, record by record: the older form (MOBI) and the newer (AZW3).

    python3 fixtures/_tools/kindle.py        writes fixtures/mobi and fixtures/azw3

Standard library only, and the same bytes every time. The books are a few short pages written
for the tests, with a picture, a stylesheet, links from one page to a place on another, and a
list of contents. Nobody's book is in the repository.

A Kindle book is a list of numbered records. The first says how the book is stored, the next
hold its text, and after them come its pictures. The newer form adds tables: which stretch of
the text is which page, which pieces go into each page and where, and the list of contents.
This writes all of them, so that each can be made wrong in one way for the traps
(make-traps.py).
"""
import os
import struct
import zlib

FIXTURES = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NONE = 0xFFFFFFFF


def png(width=8, height=8):
    """A small picture: a blue square."""
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)
    rows = b"".join(b"\0" + bytes([0x3B, 0x6C, 0xFF]) * width for _ in range(height))
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(rows, 9)) + chunk(b"IEND", b"")


def forward(value):
    """A number seven bits to a byte, the last byte marked."""
    out = [value & 0x7F | 0x80]
    value >>= 7
    while value:
        out.insert(0, value & 0x7F)
        value >>= 7
    return bytes(out)


def base32(value, width=4):
    digits = "0123456789ABCDEFGHIJKLMNOPQRSTUV"
    out = ""
    while value:
        out = digits[value % 32] + out
        value //= 32
    return out.rjust(width, "0")


def database(records, name=b"Omsett_sample"):
    """The outer file: a header, a list of where each record starts, and the records."""
    start = 78 + 8 * len(records) + 2
    head = name.ljust(32, b"\0") + struct.pack(">HHIIIIII", 0, 0, 0, 0, 0, 0, 0, 0) + b"BOOKMOBI" + struct.pack(">IIH", 2 * len(records) - 1, 0, len(records))
    listing, at = b"", start
    for i, record in enumerate(records):
        listing += struct.pack(">II", at, 2 * i)
        at += len(record)
    return head + listing + b"\0\0" + b"".join(records)


def facts(entries):
    """What the book says of itself: numbered facts, each a kind, a length and some bytes."""
    body = b"".join(struct.pack(">II", kind, 8 + len(data)) + data for kind, data in entries)
    made = b"EXTH" + struct.pack(">II", 12 + len(body), len(entries)) + body
    return made + b"\0" * (-len(made) % 4)


def first_record(text_length, text_records, version, title, entries, packing=1, locked=0, first_picture=NONE, encoding=65001, huff=(0, 0), places=None, trailers=0):
    """The record that says how the book is stored."""
    places = places or {}
    head = bytearray(264)
    head[0:4] = b"MOBI"
    struct.pack_into(">IIIII", head, 4, 264, 2, encoding, 0x4F6D7374, version)
    for at in range(24, 64, 4):
        struct.pack_into(">I", head, at, NONE)
    struct.pack_into(">I", head, 64, text_records + 1)
    extra = facts(entries)
    struct.pack_into(">II", head, 68, 16 + 264 + len(extra), len(title))
    struct.pack_into(">I", head, 76, 9)
    struct.pack_into(">I", head, 92, first_picture)
    struct.pack_into(">II", head, 96, huff[0], huff[1])
    struct.pack_into(">I", head, 112, 0x40)
    for at in (176, 180, 228, 232, 236, 240, 244):
        struct.pack_into(">I", head, at, NONE)
    struct.pack_into(">H", head, 226, trailers)
    # Places only the newer form uses: the table of flows, of pieces, of pages, of contents.
    struct.pack_into(">II", head, 176, places.get("flows", NONE), places.get("flow_count", 0))
    struct.pack_into(">I", head, 228, places.get("contents", NONE))
    struct.pack_into(">I", head, 232, places.get("pieces", NONE))
    struct.pack_into(">I", head, 236, places.get("pages", NONE))
    palm = struct.pack(">HHIHHHH", packing, 0, text_length, text_records, 4096, locked, 0)
    return palm + bytes(head) + extra + title + b"\0" * (4 - len(title) % 4)


def text_records(text, pack=None):
    """The text cut into records of 4,096 bytes, each packed if a way of packing is given."""
    return [(pack or (lambda piece: piece))(text[at : at + 4096]) for at in range(0, len(text), 4096)] or [b""]


def palm_packed(piece):
    """PalmDOC packing without the cleverness: plain letters as they are, and anything else behind a count."""
    out, at = bytearray(), 0
    while at < len(piece):
        byte = piece[at]
        # "The " then "the " again: said once, then as "go back four and copy four".
        if piece[at : at + 4] == b"the " and at >= 4 and piece[at - 4 : at] == b"the ":
            out += struct.pack(">H", 0x8000 | (4 << 3) | (4 - 3))
            at += 4
        elif byte == 0 or 9 <= byte <= 0x7F:
            out.append(byte)
            at += 1
        else:
            run = piece[at : at + 8]
            run = run[: next((i for i, value in enumerate(run) if i and (value == 0 or 9 <= value <= 0x7F)), len(run))]
            out.append(len(run))
            out += run
            at += len(run)
    return bytes(out)


def phrase_book(circle=False, chain=0):
    """
    Kindle's other packing: a code for each phrase in a dictionary. Here every code is one byte
    and stands for one byte, which is packing that saves nothing and reaches every part of a
    reader. `circle` makes one phrase the code for itself; `chain` makes that many phrases each
    the one before it twice over, which is how a few bytes are made to unpack to a great many.
    """
    table = b"".join(struct.pack(">I", (255 << 8) | 0x80 | 8) for _ in range(256))
    ranges = b"".join(struct.pack(">II", 0, (1 << length) - 1) for length in range(1, 33))
    huff = b"HUFF" + struct.pack(">III", 24, 24, 24 + 1024) + b"\0" * 8 + table + ranges
    phrases = [(bytes([255 - i]), True) for i in range(256)]
    if circle:
        # A phrase written as the code for itself.
        phrases[255 - ord("~")] = (b"~", False)
    # Codes 1 to `chain`, which no text uses: the first a thousand letters, each next the last one twice.
    for level in range(1, chain + 1):
        phrases[255 - level] = (b"a" * 1000, True) if level == 1 else (bytes([level - 1]) * 2, False)
    body, offsets = b"", []
    for data, plain in phrases:
        offsets.append(512 + len(body))
        body += struct.pack(">H", len(data) | (0x8000 if plain else 0)) + data
    cdic = b"CDIC" + struct.pack(">III", 16, 256, 8) + b"".join(struct.pack(">H", offset) for offset in offsets) + body
    return [huff, cdic]


# --- the newer form's tables ------------------------------------------------------------------------
def table(layout, entries, texts=b""):
    """A table: one record saying how an entry is laid out, one holding the entries, and one of text they point into."""
    layout_bytes = b"".join(bytes(tag) for tag in layout)
    tagx = b"TAGX" + struct.pack(">II", 12 + len(layout_bytes), 1) + layout_bytes
    head = bytearray(192)
    head[0:4] = b"INDX"
    struct.pack_into(">I", head, 4, 192)
    struct.pack_into(">I", head, 24, 1)
    struct.pack_into(">I", head, 52, 1 if texts else 0)
    body, offsets = b"", []
    for name, control, values in entries:
        offsets.append(192 + len(body))
        body += bytes([len(name)]) + name + bytes([control]) + b"".join(forward(value) for value in values)
    body += b"\0" * (-len(body) % 4)
    data = bytearray(192)
    data[0:4] = b"INDX"
    struct.pack_into(">I", data, 4, 192)
    struct.pack_into(">II", data, 20, 192 + len(body), len(entries))
    listing = b"IDXT" + b"".join(struct.pack(">H", offset) for offset in offsets)
    return [bytes(head) + tagx, bytes(data) + body + listing] + ([texts] if texts else [])


PAGES = [(1, 1, 3, 0), (6, 2, 12, 0), (0, 0, 0, 1)]
PIECES = [(2, 1, 1, 0), (3, 1, 2, 0), (4, 1, 4, 0), (6, 2, 8, 0), (0, 0, 0, 1)]
CONTENTS = [(1, 1, 1, 0), (2, 1, 2, 0), (3, 1, 4, 0), (4, 1, 8, 0), (6, 2, 16, 0), (0, 0, 0, 1)]

STYLE = b"h1 { font-size: 1.6em }\n.note { font-style: italic }\n"
CHAPTERS = [
    ("Sample book", '<h1 id="top">Sample book</h1><p>A short book written for the tests of <a href="https://omsett.com/">Omsett</a>.</p><p><img src="kindle:embed:0001?mime=image/png" alt="A blue square"/></p>'),
    ("The first chapter", '<h1>The first chapter</h1><p>It was a <b>plain</b> morning, and the the file was <i>small</i>. See <a href="kindle:pos:fid:0002:off:000000000E">the note at the end</a>.</p><p>Café, 字幕, and a second paragraph.</p>'),
    ("Notes", '<h1>Notes</h1><p class="note" id="note-one">The note: nothing in this book is real.</p>'),
]
FRAME = '<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>%s</title><link rel="stylesheet" type="text/css" href="kindle:flow:0001?mime=text/css"/></head><body></body></html>'


def newer(chapters=None, style=STYLE, pack=None, title=b"Sample book", author=b"Omsett", change=None, locked=0, pictures=None, huff=False, stated=None, book=None, **more):
    """An AZW3. `change` is given the parts (text, tables, records) before they are joined, to damage one."""
    chapters = CHAPTERS if chapters is None else chapters
    pages, pieces, flow = [], [], b""
    for number, (heading, body) in enumerate(chapters):
        frame = (FRAME % heading).encode()
        body = body.encode()
        into = len(flow) + frame.index(b"</body>")
        pages.append((b"SKEL%010d" % number, 0x05, [1, len(flow), len(frame)]))
        pieces.append((b"%010d" % into, 0x0F, [0, number, number, 0, len(body)]))
        flow += frame + body
    labels, listed, at = b"", [], 0
    for number, (heading, _) in enumerate(chapters):
        label = heading.encode()
        listed.append((b"%02d" % number, 0x1F, [0, 0, len(labels), 0, number, 0]))
        labels += forward(len(label)) + label
    parts = {"text": flow + style, "flow": len(flow), "pages": table(PAGES, pages), "pieces": table(PIECES, pieces, b"\0"), "contents": table(CONTENTS, listed, labels), "pictures": [png()] if pictures is None else pictures}
    if change:
        change(parts)
    text = parts["text"]
    packed = phrase_book(**(book or {})) if huff else []
    records = text_records(text, pack)
    count = len(records)
    places, at = {}, 1 + count
    extras = []
    for key in ("pieces", "pages", "contents"):
        places[key] = at
        extras += parts[key]
        at += len(parts[key])
    places["flows"], places["flow_count"] = at, 2
    extras.append(b"FDST" + struct.pack(">II", 12, 2) + struct.pack(">IIII", 0, parts["flow"], parts["flow"], len(text)))
    at += 1
    huff_at = (at, len(packed)) if packed else (0, 0)
    extras += packed
    at += len(packed)
    entries = [(100, author), (524, b"en"), (503, title), (201, struct.pack(">I", 0))]
    head = first_record(parts["flow"] if stated is None else stated, count, 8, title, entries, packing=17480 if huff else (2 if pack else 1), locked=locked, first_picture=at, huff=huff_at, places=places, **more)
    return database([head] + records + extras + parts["pictures"] + [b"\xe9\x8e\r\n"])


def older(pack=palm_packed, title=b"Sample book", author=b"Omsett", locked=0, change=None, **more):
    """A MOBI: one long page, marks where a new page starts, and links that give a place as a count of bytes."""
    one = b'<html><head><guide></guide></head><body><h1>Sample book</h1><p>A short book written for the tests of <a href="https://omsett.com/">Omsett</a>.</p><p><img recindex="00001" alt="A blue square"></p><mbp:pagebreak/>'
    two = b"<h1>The first chapter</h1><p>It was a <b>plain</b> morning, and the the file was <i>small</i>. See <a filepos=%010d>the note at the end</a>.</p><p>Caf\xc3\xa9, \xe5\xad\x97\xe5\xb9\x95, and a second paragraph.<p>A paragraph nobody closed<mbp:pagebreak/>"
    three = b'<h1>Notes</h1><p>The note: nothing in this book is real.</p></body></html>'
    note = len(one) + len(two % 0) + three.index(b"<p>")
    parts = {"text": one + two % note + three}
    if change:
        change(parts)
    text = parts["text"]
    records = text_records(text, pack)
    entries = [(100, author), (524, b"en"), (503, title), (201, struct.pack(">I", 0))]
    head = first_record(len(text), len(records), 6, title, entries, packing=2 if pack else 1, locked=locked, first_picture=1 + len(records), **more)
    return database([head] + records + [png(), b"\xe9\x8e\r\n"])


SAMPLES = {
    "azw3/sample.azw3": lambda: newer(),
    # The same book with its text in Kindle's own packing, as books from the Kindle store are.
    "azw3/packed.azw3": lambda: newer(huff=True),
    "mobi/sample.mobi": lambda: older(),
    "mobi/unpacked.mobi": lambda: older(pack=None),
}

if __name__ == "__main__":
    for path, make in SAMPLES.items():
        full = os.path.join(FIXTURES, path)
        os.makedirs(os.path.dirname(full), exist_ok=True)
        with open(full, "wb") as out:
            out.write(make())
        print(f"{path}: {os.path.getsize(full)} bytes")
