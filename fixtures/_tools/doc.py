#!/usr/bin/env python3
"""Writes old Word documents (DOC), table by table, in the container xls.py makes.

    python3 fixtures/_tools/doc.py        writes fixtures/doc/sample.doc

Standard library only, and the same bytes every time. A document here is a list of
paragraphs, each a list of runs of text with how they are set, and what kind of paragraph it
is. What is written is what a reader needs to find its way: the text, the list of which
stretches of the file hold it, and the pages that say where each paragraph and each run of
letters ends and how it is set. It is not a file Word would open: the styles, fonts and page
setup Word insists on are left out. One made by another program is beside it, for that.

It is also how the traps for this format are made (make-traps.py).
"""
import os
import struct

import xls as X

FIXTURES = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BOLD, ITALIC, HIDDEN, STRUCK = 0x0835, 0x0836, 0x083C, 0x0800


def run(text, *settings):
    """Letters, and the settings that are on for them: BOLD, ITALIC, HIDDEN, STRUCK (deleted, with changes tracked)."""
    return (text, b"".join(struct.pack("<HB", setting, 1) for setting in settings))


def para(*runs, style=0, list=None, cell=False, row_end=False, header=False, outline=None, end=None):
    """A paragraph. style 1 to 9 is a heading; list is (which list, how deep); cell and row_end are for tables."""
    settings = b""
    if list:
        settings += struct.pack("<HBHH", 0x260A, list[1], 0x460B, list[0])
    if cell or row_end:
        settings += struct.pack("<HB", 0x2416, 1)
    if row_end:
        settings += struct.pack("<HB", 0x2417, 1)
    if header:
        settings += struct.pack("<HB", 0x3404, 1)
    if outline is not None:
        settings += struct.pack("<HB", 0x2640, outline)
    runs = [item if isinstance(item, tuple) else run(item) for item in runs]
    return (runs, struct.pack("<H", style) + settings, end or ("\x07" if cell or row_end else "\r"))


def row(*cells, header=False):
    """A row of a table: a paragraph for each cell, then the mark that ends the row."""
    return [para(text, cell=True) for text in cells] + [para(row_end=True, header=header)]


def link(text, address):
    """A link, as Word keeps one: an instruction, then what it last showed."""
    return "\x13 HYPERLINK \"%s\" \x14%s\x15" % (address, text)


def page(kind, entries):
    """A page of 512 bytes saying how runs of the file are set: where each starts, and its settings."""
    out = bytearray(512)
    count = len(entries)
    for i, (start, _, _) in enumerate(entries):
        struct.pack_into("<I", out, i * 4, start)
    struct.pack_into("<I", out, count * 4, entries[-1][1])
    slot = 4 * (count + 1)
    top = 510
    for i, (_, _, settings) in enumerate(entries):
        if kind == "letters":
            data = bytes([len(settings)]) + settings if settings else b""
        else:
            data = bytes([(len(settings) + 1) // 2]) + settings if len(settings) % 2 else bytes([0, len(settings) // 2]) + settings
        place = 0
        if data:
            top -= len(data) + (len(data) % 2)
            out[top : top + len(data)] = data
            place = top // 2
        out[slot + i * (1 if kind == "letters" else 13)] = place
    assert top > slot + count * (1 if kind == "letters" else 13), "too much for one page"
    out[511] = count
    return bytes(out)


def pages(kind, entries, each=12):
    return [(group[0][0], group[-1][1], page(kind, group)) for group in (entries[i : i + each] for i in range(0, len(entries), each))]


def lists(kinds):
    """The lists a paragraph may name: for each, whether it counts (True) or has bullets."""
    made = struct.pack("<H", len(kinds))
    for i in range(len(kinds)):
        made += struct.pack("<ii", 1000 + i, 0) + b"\0" * 18 + bytes([0, 0])
    for numbered in kinds:
        for _ in range(9):
            made += struct.pack("<iB", 1, 0 if numbered else 23) + b"\0" * 23 + struct.pack("<H", 0)
    used = struct.pack("<I", len(kinds)) + b"".join(struct.pack("<i", 1000 + i) + b"\0" * 12 for i in range(len(kinds)))
    return made, used


def document(paragraphs, wide=None, language=0x0409, kinds=(False, True), split=None, version=0x00C1, locked=False, change=None, title=b"Test pattern", author=b"Omsett", extra=()):
    """
    A whole DOC. `wide` forces two bytes to a letter (it is chosen by the text otherwise);
    `split` cuts the text in two stretches at that character and stores the second first, as
    Word does after a quick save. `change` is given the parts before they are joined.
    """
    text = "".join("".join(piece for piece, _ in runs) + end for runs, _, end in paragraphs)
    wide = any(ord(letter) > 255 for letter in text) if wide is None else wide
    size = 2 if wide else 1
    encode = lambda piece: piece.encode("utf-16-le" if wide else "cp1252")
    start = 1536
    # Where each character is in the file. With `split`, the two halves change places.
    cut = split if split else len(text)
    first_at = start + (len(text) - cut) * size if split else start
    second_at = start
    where = lambda cp: (first_at + cp * size) if cp < cut else (second_at + (cp - cut) * size)
    body = encode(text[cut:]) + encode(text[:cut]) if split else encode(text)
    stretches = [(0, cut, first_at)] + ([(cut, len(text), second_at)] if split else [])

    letters, kinds_of, cp = [], [], 0
    for runs, settings, end in paragraphs:
        begin = cp
        for piece, how in runs:
            for a, b in spans(cp, cp + len(piece), cut):
                letters.append((where(a), where(b - 1) + size, how))
            cp += len(piece)
        cp += len(end)
        for a, b in spans(begin, cp, cut):
            kinds_of.append((where(a), where(b - 1) + size, settings))
    letters = sorted(entry for entry in letters if entry[1] > entry[0])
    kinds_of = sorted(kinds_of)

    stream = bytearray(start) + body
    stream += b"\0" * (-len(stream) % 512)
    def place(made):
        found = []
        for first, last, data in made:
            found.append((first, last, len(stream) // 512))
            stream.extend(data)
        return found
    letter_pages = place(pages("letters", letters or [(start, start + len(body), b"")]))
    kind_pages = place(pages("kinds", kinds_of))

    table = bytearray()
    places = {}
    def put(index, data):
        places[index] = (len(table), len(data))
        table.extend(data)
    listing = lambda found: b"".join(struct.pack("<I", first) for first, _, _ in found) + struct.pack("<I", found[-1][1]) + b"".join(struct.pack("<I", number) for _, _, number in found)
    put(12, listing(letter_pages))
    put(13, listing(kind_pages))
    pieces = b"".join(struct.pack("<I", a) for a, _, _ in stretches) + struct.pack("<I", len(text))
    pieces += b"".join(struct.pack("<HIH", 0, at if wide else (at * 2) | 0x40000000, 0) for _, _, at in stretches)
    put(33, b"\x02" + struct.pack("<I", len(pieces)) + pieces)
    made, used = lists(kinds)
    put(73, made)
    put(74, used)

    fib = bytearray(900)
    struct.pack_into("<HHHH", fib, 0, 0xA5EC, version, 0, language)
    struct.pack_into("<H", fib, 0x0A, 0x0200 | (0x0100 if locked else 0))
    struct.pack_into("<H", fib, 32, 14)
    struct.pack_into("<H", fib, 62, 22)
    struct.pack_into("<I", fib, 0x4C, len(text))
    struct.pack_into("<H", fib, 0x98, 93)
    for index, (at, length) in places.items():
        struct.pack_into("<II", fib, 0x9A + index * 8, at, length)
    stream[: len(fib)] = fib
    parts = {"word": stream, "table": table, "places": places}
    if change:
        change(parts)
    return X.container([("WordDocument", bytes(parts["word"])), ("1Table", bytes(parts["table"])), ("\x05SummaryInformation", X.about(title, author, b"fixtures/_tools/doc.py")), *extra], small=True)


def spans(a, b, cut):
    """A range of characters, in two parts where it straddles the place the text is split."""
    if a < cut < b:
        return [(a, cut), (cut, b)]
    return [(a, b)] if b > a else []


# One of everything a reader should carry across, and three things it should not.
SAMPLE = [
    para("Quarterly report", style=1),
    para("This is the ", run("first", BOLD), " paragraph, with ", run("slanted", ITALIC), " words and a ", link("link to the site", "https://omsett.com/"), "."),
    para("What was agreed", style=2),
    para("Ship the converter", list=(1, 0)),
    para("Test it in three browsers", list=(1, 0)),
    para("Chromium", list=(1, 1)),
    para("Firefox", list=(1, 1)),
    para("First, add the file", list=(2, 0)),
    para("Then choose a format", list=(2, 0)),
    para("Figures", style=2),
    *row("Quarter", "Sales", header=True),
    *row("First", "1,200"),
    *row("Second", "1,450"),
    para("The plan is ", run("not ", STRUCK), "final", run(" (do not publish this aside)", HIDDEN), "."),
    para("Café 字幕, and a line\x0bbroken in two."),
    para("A heading by its place in the outline", outline=2),
]

if __name__ == "__main__":
    full = os.path.join(FIXTURES, "doc", "sample.doc")
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "wb") as out:
        out.write(document(SAMPLE))
    print(f"doc/sample.doc: {os.path.getsize(full)} bytes")
