#!/usr/bin/env python3
"""Writes a DNG, the open camera RAW format, with no dependencies.

    dng.py OUT.dng     the Omsett test pattern, 320 by 200, flattened onto white

A DNG is a TIFF: a list of numbered entries (width, height, where the pixels are) and the pixels.
What makes it a DNG is a handful of entries that say how the camera saw colour. No camera made
this one: its maker is "Omsett" and its picture is the pattern every other sample holds.
make-traps.py borrows `dng` and `ifd` to build its broken ones.
"""
import struct
import sys

from dicom import pattern

BYTE, ASCII, SHORT, LONG, RATIONAL, SRATIONAL = 1, 2, 3, 4, 5, 10
PACK = {BYTE: "<B", SHORT: "<H", LONG: "<I"}
# Entries, by number.
SUBFILE, WIDTH, HEIGHT, BITS, PACKING, KIND, DESCRIPTION, MAKE, MODEL, STRIPS, TURNED, SAMPLES, ROWS, COUNTS, PLANES = 254, 256, 257, 258, 259, 262, 270, 271, 272, 273, 274, 277, 278, 279, 284
SUB_LISTS, XMP, MOSAIC_SIZE, MOSAIC = 330, 700, 33421, 33422
DNG_VERSION, DNG_BACKWARD, CAMERA, BLACK, WHITE, COLOUR, NEUTRAL, LIGHT = 50706, 50707, 50708, 50714, 50717, 50721, 50728, 50778
LINEAR, MOSAICKED, RGB = 34892, 32803, 2
# sRGB's own matrix, so that the camera's colours are the screen's.
SRGB = [(3240454, 1000000), (-1537138, 1000000), (-498531, 1000000), (-969266, 1000000), (1876011, 1000000), (41556, 1000000), (55643, 1000000), (-204026, 1000000), (1057225, 1000000)]


def packed(kind: int, values) -> bytes:
    if isinstance(values, (bytes, bytearray)):
        return bytes(values)
    if kind == ASCII:
        return values.encode() + b"\0"
    if kind == RATIONAL:
        return b"".join(struct.pack("<II", n, d) for n, d in values)
    if kind == SRATIONAL:
        return b"".join(struct.pack("<ii", n, d) for n, d in values)
    return b"".join(struct.pack(PACK[kind], v) for v in (values if isinstance(values, (list, tuple)) else [values]))


def ifd(entries: dict, at: int, following: int = 0) -> bytes:
    """One list of entries, laid out to sit at `at`: the list, then the values too long to fit in it.

    An entry is {number: (kind, values)}. A value given as ("at", n) is where something else is.
    """
    rows = sorted(entries.items())
    after = at + 2 + len(rows) * 12 + 4
    table, extra = bytearray(), bytearray()
    for number, (kind, values) in rows:
        data = packed(kind, values)
        count = len(data) // {BYTE: 1, ASCII: 1, SHORT: 2, LONG: 4, RATIONAL: 8, SRATIONAL: 8}[kind]
        if len(data) <= 4:
            value = data.ljust(4, b"\0")
        else:
            value = struct.pack("<I", after + len(extra))
            extra += data + (b"\0" if len(data) % 2 else b"")
        table += struct.pack("<HHI", number, kind, count) + value
    return struct.pack("<H", len(rows)) + bytes(table) + struct.pack("<I", following) + bytes(extra)


def colour() -> dict:
    """What makes a TIFF a DNG: its version, the camera, and how the camera saw colour."""
    return {
        DNG_VERSION: (BYTE, [1, 4, 0, 0]), DNG_BACKWARD: (BYTE, [1, 1, 0, 0]), CAMERA: (ASCII, "Omsett Test Pattern"),
        COLOUR: (SRATIONAL, SRGB), NEUTRAL: (RATIONAL, [(1, 1)] * 3), LIGHT: (SHORT, 21),
        MAKE: (ASCII, "Omsett"), MODEL: (ASCII, "Test pattern"), TURNED: (SHORT, 1),
    }


def image(width: int, height: int, strip_at: int, length: int, mosaic: bool = False) -> dict:
    """The entries that describe one picture whose pixels are at `strip_at`."""
    entries = {
        SUBFILE: (LONG, 0), WIDTH: (LONG, width), HEIGHT: (LONG, height), PACKING: (SHORT, 1), STRIPS: (LONG, strip_at),
        ROWS: (LONG, height), COUNTS: (LONG, length), PLANES: (SHORT, 1),
    }
    if mosaic:
        # One value to a pixel, behind a grid of red, green, green and blue: what a sensor gives.
        entries.update({BITS: (SHORT, 16), KIND: (SHORT, MOSAICKED), SAMPLES: (SHORT, 1), MOSAIC_SIZE: (SHORT, [2, 2]), MOSAIC: (BYTE, [0, 1, 1, 2]),
                        BLACK: (SHORT, 0), WHITE: (SHORT, 65535)})
    else:
        entries.update({BITS: (SHORT, [16, 16, 16]), KIND: (SHORT, LINEAR), SAMPLES: (SHORT, 3), BLACK: (SHORT, [0, 0, 0]), WHITE: (SHORT, [65535] * 3)})
    return entries


def sixteen(rgb: bytes) -> bytes:
    return b"".join(struct.pack("<H", c * 257) for c in rgb)


def as_mosaic(width: int, height: int, rgb: bytes) -> bytes:
    """The picture as a sensor would have recorded it: of each pixel's three colours, the one its place in the grid sees."""
    out = bytearray()
    for y in range(height):
        for x in range(width):
            out += struct.pack("<H", rgb[(y * width + x) * 3 + (0, 1, 1, 2)[(y % 2) * 2 + x % 2]] * 257)
    return bytes(out)


def dng(width: int, height: int, pixels: bytes, mosaic: bool = False, change=None, said=None) -> bytes:
    """A DNG of one picture. `change` edits the entries before they are written; `said` is (width, height) to claim."""
    def build(strip_at: int) -> bytes:
        entries = {**colour(), **image(*(said or (width, height)), strip_at, len(pixels), mosaic)}
        if change:
            change(entries)
        return ifd(entries, 8)
    body = build(0)
    return b"II*\0" + struct.pack("<I", 8) + build(8 + len(body)) + pixels


if __name__ == "__main__":
    with open(sys.argv[1], "wb") as out:
        out.write(dng(320, 200, sixteen(pattern(320, 200))))
