#!/usr/bin/env python3
"""Writes old Excel workbooks (XLS), record by record, and the container they are kept in.

    python3 fixtures/_tools/xls.py        writes fixtures/xls/

Standard library only, and the same bytes every time. sample.xls holds what sample.xlsx holds,
cell for cell, so that the two readers can be held to the same answer: text shared between
cells, text in runs of differing style with a guide to pronunciation, dates kept as numbers,
formulas beside the values they last showed, a hidden sheet in front of the visible one.

It is also how the traps for this format are made (make-traps.py), each wrong in one way.
"""
import os
import struct

FIXTURES = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FREE, END, FAT = 0xFFFFFFFF, 0xFFFFFFFE, 0xFFFFFFFD


# --- the container ----------------------------------------------------------------------------
def container(streams, small=False, sector=512, change=None):
    """
    A compound file holding these streams (a list of name and bytes). Streams under 4,096 bytes
    are padded up to that, unless `small`, when they go in the stream of small sectors as a real
    program would put them. `change` is given the parts before they are joined, to damage one.
    """
    names = sorted(streams, key=lambda item: (len(item[0]), item[0].upper()))
    mini, mini_table, big = b"", [], []
    entries = []
    for name, data in names:
        if small and len(data) < 4096:
            start = len(mini) // 64
            count = max(1, -(-len(data) // 64))
            mini += data + b"\0" * (count * 64 - len(data))
            mini_table += [start + i + 1 for i in range(count - 1)] + [END]
            entries.append([name, 2, ("mini", start), len(data)])
        else:
            data = data + b"\0" * max(0, 4096 - len(data))
            entries.append([name, 2, ("big", len(big)), len(data)])
            big.append(data)
    # Sectors, in order: each large stream, the stream of small sectors, its table, the directory, the main table.
    chains, body = [], b""
    def place(data):
        first = len(body) // sector
        count = -(-len(data) // sector)
        chains.append((first, count))
        return first, data + b"\0" * (count * sector - len(data))
    starts = []
    for data in big:
        first, padded = place(data)
        starts.append(first)
        body += padded
    mini_first = mini_table_first = END
    if mini:
        mini_first, padded = place(mini)
        body += padded
        mini_table_first, padded = place(b"".join(struct.pack("<I", value) for value in mini_table) + b"\xff" * (-len(mini_table) * 4 % sector))
        mini_table_sectors = chains[-1][1]
        body += padded
    directory = entry("Root Entry", 5, mini_first, len(mini), child=1 if entries else FREE)
    for i, (name, kind, (where, index), size) in enumerate(entries):
        first = starts[index] if where == "big" else index
        directory += entry(name, kind, first, size, right=i + 2 if i + 1 < len(entries) else FREE)
    directory += b"\0" * (-len(directory) % sector)
    directory_first, padded = place(directory)
    body += padded
    used = len(body) // sector
    tables = 1
    while (used + tables) * 4 > tables * sector:
        tables += 1
    table = [FREE] * (tables * sector // 4)
    for first, count in chains:
        for i in range(count):
            table[first + i] = first + i + 1 if i + 1 < count else END
    for i in range(tables):
        table[used + i] = FAT
    parts = {
        "header": header(sector, tables, directory_first, mini_table_first, mini_table_sectors if mini else 0, [used + i for i in range(tables)]),
        "body": body,
        "table": table,
        "directory_first": directory_first,
        "sector": sector,
    }
    if change:
        change(parts)
    return parts["header"] + b"\0" * (sector - 512) + parts["body"] + b"".join(struct.pack("<I", value) for value in parts["table"])


def entry(name, kind, first, size, child=FREE, right=FREE):
    text = name.encode("utf-16-le") + b"\0\0"
    return text.ljust(64, b"\0") + struct.pack("<HBBIII", len(text), kind, 1, FREE, right, child) + b"\0" * 36 + struct.pack("<IQ", first & 0xFFFFFFFF, size)


def header(sector, tables, directory_first, mini_table_first, mini_table_sectors, where):
    shift = {512: 9, 4096: 12}[sector]
    out = bytes.fromhex("D0CF11E0A1B11AE1") + b"\0" * 16 + struct.pack("<HHHHH", 0x3E, 3 if shift == 9 else 4, 0xFFFE, shift, 6) + b"\0" * 6
    out += struct.pack("<IIIIIIIII", 0, tables, directory_first, 0, 4096, mini_table_first, mini_table_sectors, END, 0)
    return out + b"".join(struct.pack("<I", sector_) for sector_ in where).ljust(436, b"\xff")


# --- the workbook -----------------------------------------------------------------------------
def rec(kind, data=b""):
    return struct.pack("<HH", kind, len(data)) + data


def words(text, short=False, runs=0, guide=b""):
    """Text: a count, a byte of flags, the characters; with changes of style and a guide to pronunciation if asked."""
    wide = any(ord(letter) > 255 for letter in text)
    flags = (1 if wide else 0) | (8 if runs else 0) | (4 if guide else 0)
    out = struct.pack("<B" if short else "<H", len(text)) + bytes([flags])
    out += (struct.pack("<H", runs) if runs else b"") + (struct.pack("<I", len(guide)) if guide else b"")
    return out + text.encode("utf-16-le" if wide else "latin-1") + b"\0\0\0\0" * runs + guide


def bof(kind):
    return rec(0x0809, struct.pack("<HHHHII", 0x0600, kind, 0x0DBB, 0x07CC, 0, 6))


def shared(texts, most=8224, split_inside=None):
    """
    The text cells share. Where it outgrows a record it carries on in the next, between two
    pieces of text; `split_inside` (which piece, after how many characters) breaks one in two
    instead, as Excel does when a long text straddles the limit.
    """
    out, current = [], struct.pack("<II", len(texts), len(texts))
    for i, item in enumerate(texts):
        data = item if isinstance(item, bytes) else words(item)
        if split_inside and split_inside[0] == i:
            text = item
            wide = any(ord(letter) > 255 for letter in text)
            cut = split_inside[1]
            encode = lambda piece: piece.encode("utf-16-le" if wide else "latin-1")
            current += struct.pack("<HB", len(text), 1 if wide else 0) + encode(text[:cut])
            out.append(current)
            current = bytes([1 if wide else 0]) + encode(text[cut:])
            continue
        if len(current) + len(data) > most:
            out.append(current)
            current = b""
        current += data
    out.append(current)
    return rec(0x00FC, out[0]) + b"".join(rec(0x003C, more) for more in out[1:])


def cell(row, column, style=0):
    return struct.pack("<HHH", row, column, style)


def text_cell(row, column, index):
    return rec(0x00FD, cell(row, column) + struct.pack("<I", index))


def number(row, column, value, style=0):
    return rec(0x0203, cell(row, column, style) + struct.pack("<d", value))


def packed(row, column, value, style=0):
    """A number in four bytes: whole, or whole after multiplying by a hundred."""
    if value == int(value):
        return rec(0x027E, cell(row, column, style) + struct.pack("<I", (int(value) << 2 | 2) & 0xFFFFFFFF))
    return rec(0x027E, cell(row, column, style) + struct.pack("<I", (int(round(value * 100)) << 2 | 3) & 0xFFFFFFFF))


def several(row, first, values, style=0):
    """A run of whole numbers along a row, in one record: Excel writes neighbours this way."""
    body = b"".join(struct.pack("<HI", style, (int(value) << 2 | 2) & 0xFFFFFFFF) for value in values)
    return rec(0x00BD, struct.pack("<HH", row, first) + body + struct.pack("<H", first + len(values) - 1))


def truth(row, column, value, error=False):
    return rec(0x0205, cell(row, column) + bytes([value, 1 if error else 0]))


def formula(row, column, value, style=0):
    """A formula with the value it last showed: a number, text, yes or no, or an error."""
    if isinstance(value, str):
        shown = b"\0" * 6 + b"\xff\xff"
    elif isinstance(value, bool):
        shown = bytes([1, 0, 1 if value else 0, 0, 0, 0, 0xFF, 0xFF])
    elif isinstance(value, tuple):
        shown = bytes([2, 0, value[0], 0, 0, 0, 0xFF, 0xFF])
    else:
        shown = struct.pack("<d", value)
    # The formula itself is three bytes that say "the number one". It is never worked out.
    out = rec(0x0006, cell(row, column, style) + shown + struct.pack("<HIH", 0, 0, 3) + b"\x1e\x01\x00")
    return out + (rec(0x0207, words(value)) if isinstance(value, str) else b"")


def workbook(sheets, texts, formats=(), styles=(0,), hidden=(), from1904=False, share=None, before=b"", kinds=None, version=0x0600, moved=None):
    """
    sheets: a list of name and the records of its cells. formats: number formats someone
    wrote, as (number, pattern). styles: for each cell style, the number of its format.
    """
    bodies = [bof(0x0010) + cells + rec(0x000A) for _, cells in sheets]
    def head(places):
        out = rec(0x0809, struct.pack("<HHHHII", version, 5, 0x0DBB, 0x07CC, 0, 6)) + before + rec(0x0042, struct.pack("<H", 1200)) + rec(0x0022, struct.pack("<H", 1 if from1904 else 0))
        out += b"".join(rec(0x041E, struct.pack("<H", index) + words(pattern)) for index, pattern in formats)
        out += b"".join(rec(0x00E0, struct.pack("<HH", 0, form) + b"\0" * 16) for form in styles)
        for i, (name, _) in enumerate(sheets):
            out += rec(0x0085, struct.pack("<IBB", places[i], 1 if name in hidden else 0, (kinds or {}).get(name, 0)) + words(name, short=True))
        return out + (share if share is not None else shared(texts)) + rec(0x000A)
    length = len(head([0] * len(sheets)))
    places, at = [], length
    for (name, _), body in zip(sheets, bodies):
        # `moved` says a sheet is somewhere it is not.
        places.append((moved or {}).get(name, at))
        at += len(body)
    return head(places) + b"".join(bodies)


def about(title=b"", author=b"", program=b""):
    """The stream that says who wrote a file and with what: a few numbered pieces of text."""
    items = [(2, title), (4, author), (18, program)]
    items = [(number_, value) for number_, value in items if value]
    values, places, at = b"", [], 8 + 8 * len(items)
    for number_, value in items:
        places.append(struct.pack("<II", number_, at))
        data = struct.pack("<II", 0x1E, len(value) + 1) + value + b"\0"
        data += b"\0" * (-len(data) % 4)
        values += data
        at += len(data)
    section = struct.pack("<II", 8 + 8 * len(items) + len(values), len(items)) + b"".join(places) + values
    return struct.pack("<HHI", 0xFFFE, 0, 0x00020106) + b"\0" * 16 + struct.pack("<I", 1) + bytes.fromhex("E0859FF2F94F6810AB9108002B27B3D9") + struct.pack("<I", 48) + section


# What sample.xlsx holds, in the same order (see make-sheets.py).
TEXTS = [
    "id", "name", "born", "joined", "salary", "note", "postcode", "Ada Lovelace",
    words("Grace Hopper", runs=1, guide=b"\x01\x00\x0c\x00" + b"pronounced\0\0"),
    "Wrote the first program, & said so <plainly>\nin two lines", "01234", "Café 字幕", "active", "not shown",
    "1815-12-10", "total",
]
FORMATS = [(164, "yyyy\\-mm\\-dd\\ hh:mm"), (165, '"$"#,##0.00')]
STYLES = (0, 14, 164, 165)
PEOPLE = (
    b"".join(text_cell(0, column, index) for column, index in enumerate([0, 1, 2, 3, 4, 5, 6, 12]))
    + packed(1, 0, 1) + text_cell(1, 1, 7) + text_cell(1, 2, 14) + number(1, 3, 46349, 1) + packed(1, 4, 1234.5, 3) + text_cell(1, 5, 9) + text_cell(1, 6, 10) + truth(1, 7, 1)
    + formula(2, 0, 2.0) + text_cell(2, 1, 8) + packed(2, 2, 2532, 1) + number(2, 3, 46349.604166666664, 2) + number(2, 4, 0.1, 3) + packed(2, 6, 10001) + truth(2, 7, 0)
    + packed(3, 0, 3) + text_cell(3, 1, 11) + formula(3, 5, "ab") + formula(3, 7, (0x07,))
)
SHEETS = [("Secret", text_cell(0, 0, 13) + packed(1, 0, 42)), ("People", PEOPLE), ("Totals", text_cell(0, 0, 15) + packed(1, 0, 3))]
EVENT_TEXTS = ["summary", "start", "end", "location", "Planning meeting, room 4", "Springfield", "Holiday", "Release", "2026-12-25", "2026-12-26"]
EVENTS = (
    b"".join(text_cell(0, column, column) for column in range(4))
    + text_cell(1, 0, 4) + number(1, 1, 46349.375, 2) + number(1, 2, 46349.416666666664, 2) + text_cell(1, 3, 5)
    + text_cell(2, 0, 6) + text_cell(2, 1, 8) + text_cell(2, 2, 9)
    + text_cell(3, 0, 7) + number(3, 1, 46391, 1)
)


def sample():
    return container([("Workbook", workbook(SHEETS, TEXTS, FORMATS, STYLES, hidden=("Secret",))), ("\x05SummaryInformation", about(b"Test pattern", b"Omsett", b"fixtures/_tools/xls.py"))], small=True)


SAMPLES = {
    "xls/sample.xls": sample,
    "xls/events.xls": lambda: container([("Workbook", workbook([("Events", EVENTS)], EVENT_TEXTS, FORMATS, STYLES))]),
    # Larger sectors, as files past two gigabytes use, and a workbook counting its days from 1904 as old Macs did.
    "xls/large-sectors.xls": lambda: container([("Workbook", workbook(SHEETS, TEXTS, FORMATS, STYLES, hidden=("Secret",), from1904=False))], sector=4096),
}

if __name__ == "__main__":
    for path, make in SAMPLES.items():
        full = os.path.join(FIXTURES, path)
        os.makedirs(os.path.dirname(full), exist_ok=True)
        with open(full, "wb") as out:
            out.write(make())
        print(f"{path}: {os.path.getsize(full)} bytes")
