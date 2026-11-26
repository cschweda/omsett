#!/usr/bin/env python3
"""Writes old PowerPoint presentations (PPT), record by record, in the container xls.py makes.

    python3 fixtures/_tools/ppt.py        writes fixtures/ppt/sample.ppt

Standard library only, and the same bytes every time. sample.ppt holds what sample.pptx holds,
slide for slide: a title slide, a slide of bullets at two levels with bold, slanted and linked
words and a box drawn by hand, a hidden slide, and a slide with a picture and a table. It also
holds what must not come out: speaker notes, a shape hidden in the editor, and the text of an
earlier save that a later one replaced.

It is laid out as PowerPoint lays one out. The text of a slide's title and body is kept in a
list beside the slides, and the shapes on the slide refer to it by number; the text of a box
drawn by hand is kept in the shape. Which record is which slide is said by a directory at the
end, one for each time the file was saved. What is left out is what a reader does not need:
the master slide, fonts, colours, the size of the page. One made by another program is beside
it, for that (from-poi.ppt, made with Apache POI: see PptSample.java).

It is also how the traps for this format are made (make-traps.py), each wrong in one way.
"""
import os
import struct

import xls as X

FIXTURES = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BOLD, ITALIC = 1, 2
# What a stretch of text is.
TITLE, BODY, NOTES, OTHER, SUBTITLE, CENTRE_TITLE = 0, 1, 2, 4, 5, 6
# What a placeholder is.
P_TITLE, P_BODY, P_CENTRE_TITLE, P_SUBTITLE, P_NUMBER = 0x0D, 0x0E, 0x0F, 0x10, 0x08
TOKEN, LOCKED = 0xE391C05F, 0xF3D1C4DF


def rec(kind, data=b"", instance=0, version=0):
    return struct.pack("<HHI", (instance << 4) | version, kind, len(data)) + data


def box(kind, *children, instance=0):
    """A record that holds others."""
    return rec(kind, b"".join(children), instance, 0xF)


def run(text, *marks, link=None, coloured=False):
    """Letters, how they are set (BOLD, ITALIC; `coloured` adds a colour and a raised position), and the address they lead to, if any."""
    return (text, sum(marks) | (0x100 if coloured else 0), link)


def para(*runs, indent=0, bullet=None):
    """A paragraph: runs of letters, its level, and whether it says it has a bullet (None: its box decides)."""
    return ([r if isinstance(r, tuple) else run(r) for r in runs], indent, bullet)


class Deck:
    """What the whole presentation shares as it is written: its links and its pictures."""

    def __init__(self):
        self.links = []
        self.pictures = []

    def link(self, address):
        self.links.append(address)
        return len(self.links)

    def picture(self, data, kind=0xF01E, instance=0x6E0):
        self.pictures.append(rec(kind, b"\0" * 16 + b"\xff" + data, instance))
        return len(self.pictures)


def text(deck, kind, paragraphs, language=None, wide=None):
    """The records of one stretch of text: what it is, its letters, how they are set, its links."""
    chars, pf, cf, links = "", b"", b"", []
    for n, (runs, indent, bullet) in enumerate(paragraphs):
        last = n == len(paragraphs) - 1
        start = len(chars)
        for i, (letters, marks, address) in enumerate(runs):
            if address is not None:
                links.append((deck.link(address), len(chars), len(chars) + len(letters)))
            chars += letters
            count = len(letters) + (1 if i == len(runs) - 1 else 0)
            style = marks & 0x3
            # A colour and a position are written after the style, four bytes and two.
            extra = struct.pack("<IH", 0xFE0000FF, 0x0010) if marks & 0x100 else b""
            mask = (0x3 if style else 0) | (0xC0000 if extra else 0)
            cf += struct.pack("<II", count, mask) + (struct.pack("<H", style) if style else b"") + extra
        if not last:
            chars += "\r"
        count = len(chars) - start + (1 if last else 0)
        if bullet is None:
            pf += struct.pack("<IHI", count, indent, 0)
        else:
            pf += struct.pack("<IHIH", count, indent, 0x1, 1 if bullet else 0)
    if wide is None:
        wide = any(ord(c) > 0xFF for c in chars)
    letters = rec(0x0FA0, chars.encode("utf-16-le")) if wide else rec(0x0FA8, chars.encode("latin-1"))
    out = rec(0x0F9F, struct.pack("<I", kind)) + letters + rec(0x0FA1, pf + cf)
    if language is not None:
        out += rec(0x0FAA, struct.pack("<IIH", len(chars) + 1, 0x2, language))
    for target, begin, end in links:
        out += box(0x0FF2, rec(0x0FF3, struct.pack("<IIBBBBB3x", 0, target, 4, 0, 0, 0, 8)))
        out += rec(0x0FDF, struct.pack("<II", begin, end))
    return out


def properties(simple=(), complex=()):
    """A shape's list of properties: numbers, then the longer values (text) after them."""
    table, extra = b"", b""
    for pid, value in simple:
        table += struct.pack("<HI", pid, value)
    for pid, value in complex:
        data = value.encode("utf-16-le") + b"\0\0"
        table += struct.pack("<HI", pid | 0x8000, len(data))
        extra += data
    return rec(0xF00B, table + extra, len(simple) + len(complex), 3)


def shape(spid, kind=1, placeholder=None, textbox=b"", props=(), alt=None, anchor=None):
    """One shape: what it is, its properties, where it sits, what placeholder it is, and its text."""
    parts = rec(0xF00A, struct.pack("<II", spid, 0xA00), kind, 2)
    parts += properties(props, [(0x0381, alt)] if alt else [])
    parts += rec(0xF00F, struct.pack("<iiii", *anchor)) if anchor else rec(0xF010, struct.pack("<hhhh", 0, 0, 100, 100))
    if placeholder is not None:
        parts += box(0xF011, rec(0x0BC3, struct.pack("<iBBH", -1, placeholder, 0, 0)))
    if textbox:
        parts += box(0xF00D, textbox)
    return box(0xF004, parts)


def group(spid, shapes, table=False):
    """A group of shapes. Its first shape stands for the group itself."""
    own = rec(0xF009, b"\0" * 16, 0, 1) + rec(0xF00A, struct.pack("<II", spid, 0x201), 0, 2)
    if table:
        own += rec(0xF122, struct.pack("<HI", 0x039F, 1), 1, 3)
    return box(0xF003, box(0xF004, own), *shapes)


def drawing(shapes, patriarch=0x400):
    """A slide's drawing: the outermost group, holding every shape."""
    own = rec(0xF009, b"\0" * 16, 0, 1) + rec(0xF00A, struct.pack("<II", patriarch, 0x005), 0, 2)
    return box(0x040C, box(0xF002, rec(0xF008, struct.pack("<II", len(shapes) + 1, patriarch + len(shapes)), 1) + box(0xF003, box(0xF004, own), *shapes)))


def slide(shapes, hidden=False):
    out = rec(0x03EF, struct.pack("<I8BIIHH", 0, 0x0F, 0x10, 0, 0, 0, 0, 0, 0, 0x80000000, 0, 0x0007, 0), 0, 2)
    if hidden:
        out += rec(0x03F9, struct.pack("<IIBBHB3x", 0, 0, 0, 0, 0x0004, 0))
    return box(0x03EE, out + drawing(shapes))


def notes(spid, words):
    return box(0x03F0, rec(0x03F1, struct.pack("<IHH", 0, 0x0001, 0), 0, 1) + drawing([shape(spid, placeholder=0x0C, textbox=rec(0x0F9E, struct.pack("<i", 0)))]))


def table(deck, spid, rows):
    """A table, as PowerPoint draws one: a group of boxes, each set where its cell is."""
    cells = []
    for r, row in enumerate(rows):
        for c, words in enumerate(row):
            cells.append(shape(spid + len(cells) + 1, anchor=(c * 1000, r * 400, c * 1000 + 1000, r * 400 + 400), textbox=text(deck, OTHER, [para(words)])))
    return group(spid, cells, table=True)


def presentation(slides, title=b"About Omsett", author=b"SECRET-AUTHOR", language=0x0809, locked=False, version=0x03F4,
                 notes_text=None, earlier=None, pictures=(), change=None, extra=(), links=None, stored=None):
    """
    A presentation. `slides` is a list of (shapes, texts, hidden): the shapes are written by
    `shape`, the texts by `text`, and a shape refers to its slide's texts by number with `ref`.
    `earlier` is a slide written by a save before the last, and replaced by it. `change` is
    given the parts before they are joined, to damage one. `stored` is the order the slides are
    written in the file, by their places in the order they are shown.
    """
    deck = links or Deck()
    resolved = [(fn(deck) if callable(fn) else fn) for fn in slides]
    for data in pictures:
        deck.picture(data)
    # Objects are numbered from 1, the document first; each slide and each page of notes after it.
    slide_ids = list(range(2, 2 + len(resolved)))
    notes_id = 2 + len(resolved) if notes_text else None

    slide_list = b""
    for n, (shapes, texts, hidden) in enumerate(resolved):
        slide_list += rec(0x03F3, struct.pack("<IIiII", slide_ids[n], 0, len(texts), 256 + n, 0))
        slide_list += b"".join(texts)
    notes_list = b""
    if notes_text:
        notes_list = rec(0x03F3, struct.pack("<IIiII", notes_id, 0, 1, 256, 0)) + text(deck, NOTES, [para(notes_text)])

    objects = rec(0x040A, struct.pack("<I", len(deck.links)))
    for n, address in enumerate(deck.links):
        objects += box(0x0FD7, rec(0x0FD3, struct.pack("<I", n + 1)) + rec(0x0FBA, address.encode("utf-16-le"), 0) + rec(0x0FBA, address.encode("utf-16-le"), 1))
    store = b"".join(rec(0xF007, struct.pack("<BB16sHIIIBBBB", 6, 6, b"\0" * 16, 0xFF, len(p), 1, sum(len(q) for q in deck.pictures[:i]), 0, 0, 0, 0), 2, 2)
                     for i, p in enumerate(deck.pictures))
    environment = box(0x03F2, rec(0x0FA9, struct.pack("<IHHH", 0x7, 0, language, 0)))
    document = box(0x03E8,
                   rec(0x03E9, struct.pack("<iiiiIIhhBBBBBBBB", 5760, 4320, 4320, 5760, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0) + b"\0" * 4, 0, 1),
                   box(0x0409, objects),
                   environment,
                   box(0x040B, box(0xF000, rec(0xF006, struct.pack("<IIII", 0x400 * (len(resolved) + 2), 1, 0, 0)) + (box(0xF001, store, instance=len(deck.pictures)) if deck.pictures else b""))),
                   box(0x0FF0, slide_list, instance=0),
                   *([box(0x0FF0, notes_list, instance=2)] if notes_text else []),
                   rec(0x03EA))

    parts = {"stream": bytearray(), "objects": {}}
    stream = parts["stream"]

    def place(number, data):
        parts["objects"][number] = len(stream)
        stream.extend(data)

    def save(numbers, last):
        """A directory for the objects this save wrote, and the record that says where it is."""
        at_directory = len(stream)
        entries = b""
        for number in sorted(numbers):
            entries += struct.pack("<II", number | (1 << 20), parts["objects"][number])
        stream.extend(rec(0x1772, entries))
        at_edit = len(stream)
        stream.extend(rec(0x0FF5, struct.pack("<IHBBIIIIHH", 256, 0, 0, 3, last, at_directory, 1, max(parts["objects"]), 1, 0)))
        return at_edit

    # A file saved twice: the first save wrote everything, one slide of it as it was then; the
    # second wrote that slide again, and its directory says that the new one stands.
    first_slide = slide(*earlier) if earlier else slide(resolved[0][0], resolved[0][2])
    place(1, document)
    place(slide_ids[0], first_slide)
    for n in stored or range(1, len(resolved)):
        if n:
            place(slide_ids[n], slide(resolved[n][0], resolved[n][2]))
    if notes_text:
        place(notes_id, notes(0x400 * (len(resolved) + 1) + 1, notes_text))
    edit = save(parts["objects"].keys(), 0)
    if earlier:
        place(slide_ids[0], slide(resolved[0][0], resolved[0][2]))
        edit = save([slide_ids[0]], edit)
    parts["edit"] = edit
    parts["user"] = bytearray(rec(0x0FF6, struct.pack("<IIIHHBBH", 0x14, LOCKED if locked else TOKEN, edit, 6, version, 3, 0, 0) + b"Omsett"))
    if change:
        change(parts)
    streams = [("PowerPoint Document", bytes(stream)), ("Current User", bytes(parts["user"])),
               ("\x05SummaryInformation", X.about(title, author, b"fixtures/_tools/ppt.py"))]
    if deck.pictures:
        streams.append(("Pictures", b"".join(deck.pictures)))
    return X.container(streams + list(extra), small=True)


def ref(n):
    """A placeholder's text, by its number among the texts of its slide."""
    return rec(0x0F9E, struct.pack("<i", n))


def sample_slides():
    def one(deck):
        return ([shape(1025, placeholder=P_CENTRE_TITLE, textbox=ref(0)), shape(1026, placeholder=P_SUBTITLE, textbox=ref(1)),
                 shape(1027, placeholder=P_NUMBER, textbox=text(deck, OTHER, [para("*")]))],
                [text(deck, CENTRE_TITLE, [para("Omsett")], language=0x0809), text(deck, SUBTITLE, [para("Drop a file. Pick a format.")])], False)

    def two(deck):
        body = [
            para("Pictures"),
            para("Data, such as ", run("JSON", BOLD, coloured=True), run(" and ", coloured=True), run("CSV", ITALIC)),
            para("Workbooks", indent=1),
            para("Contacts", indent=1),
            para("See ", run("omsett.com", link="https://omsett.com")),
        ]
        return ([shape(2049, placeholder=P_TITLE, textbox=ref(0)), shape(2050, placeholder=P_BODY, textbox=ref(1)),
                 shape(2051, textbox=text(deck, OTHER, [para("Nothing leaves your device.")])),
                 # Hidden in the editor: on the slide, and never shown.
                 shape(2052, textbox=text(deck, OTHER, [para("SECRET-HIDDEN-SHAPE")]), props=[(0x03BF, 0x00020002)])],
                [text(deck, TITLE, [para("What it converts")]), text(deck, BODY, body)], False)

    def hidden(deck):
        return ([shape(3073, placeholder=P_TITLE, textbox=ref(0))], [text(deck, TITLE, [para("SECRET-HIDDEN-SLIDE")])], True)

    def four(deck):
        return ([shape(4097, placeholder=P_TITLE, textbox=ref(0)),
                 shape(4098, kind=75, props=[(0x4104, 1)], alt="The Omsett mark: a word in white with a blue square"),
                 table(deck, 4099, [["Format", "Kind"], ["PNG", "Picture"], ["XLSX", "Workbook"]])],
                [text(deck, TITLE, [para("A picture and a table, café 字幕")])], False)

    return [one, two, hidden, four]


def sample():
    with open(os.path.join(FIXTURES, "png", "sample.png"), "rb") as f:
        png = f.read()
    # The first slide as an earlier save left it: it read differently, and that text is still in the file.
    earlier = Deck()
    old = ([shape(1025, textbox=text(earlier, OTHER, [para("SECRET-EARLIER-SAVE")]))], False)
    return presentation(sample_slides(), notes_text="SECRET-SPEAKER-NOTES: not for the audience", earlier=old, pictures=[png])


if __name__ == "__main__":
    full = os.path.join(FIXTURES, "ppt", "sample.ppt")
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "wb") as out:
        out.write(sample())
    print(f"ppt/sample.ppt: {os.path.getsize(full)} bytes")
