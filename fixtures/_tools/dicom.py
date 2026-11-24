#!/usr/bin/env python3
"""Writes a DICOM file, with no dependencies.

    dicom.py OUT.dcm     the Omsett test pattern, 320 by 200, in colour, flattened onto white

DICOM is the format of medical scans. Nothing here came from a scanner or a person: the patient
is called "Sample^Pattern" and the picture is the same test pattern every other sample holds.
make-traps.py borrows `element` and `dicom` to build its broken ones.
"""
import struct
import sys

from pattern import pattern_rows

# Kinds of value whose length is four bytes, after two empty ones. Every other kind's is two.
LONG = ("OB", "OW", "SQ", "UN", "UT")
EXPLICIT = "1.2.840.10008.1.2.1"
PATIENT = "Sample^Pattern"


def element(group: int, number: int, kind: str, value, implicit: bool = False) -> bytes:
    if isinstance(value, str):
        value = value.encode()
    if isinstance(value, int):
        value = struct.pack("<H", value)
    if len(value) % 2:
        value += b"\x00" if kind == "UI" else b" "
    tag = struct.pack("<HH", group, number)
    if implicit:
        return tag + struct.pack("<I", len(value)) + value
    if kind in LONG:
        return tag + kind.encode() + b"\x00\x00" + struct.pack("<I", len(value)) + value
    return tag + kind.encode() + struct.pack("<H", len(value)) + value


def opening(syntax: str = EXPLICIT) -> bytes:
    """The 128 empty bytes, the letters, and the group that says how the rest is written."""
    meta = (element(2, 1, "OB", b"\x00\x01") + element(2, 2, "UI", "1.2.840.10008.5.1.4.1.1.7") + element(2, 3, "UI", "2.25.1")
            + element(2, 0x10, "UI", syntax) + element(2, 0x12, "UI", "2.25.2"))
    return b"\x00" * 128 + b"DICM" + element(2, 0, "UL", struct.pack("<I", len(meta))) + meta


def about(patient: str = PATIENT, implicit: bool = False, extra: bytes = b"") -> bytes:
    """Who and what: the part a conversion leaves behind."""
    e = lambda *a: element(*a, implicit=implicit)
    return (e(8, 0x16, "UI", "1.2.840.10008.5.1.4.1.1.7") + e(8, 0x18, "UI", "2.25.1") + e(8, 0x60, "CS", "OT")
            + e(8, 0x1030, "LO", "Omsett test pattern") + extra + e(0x10, 0x10, "PN", patient) + e(0x10, 0x20, "LO", "OMSETT-0001")
            + e(0x10, 0x30, "DA", "19700101"))


def picture(width: int, height: int, pixels: bytes, colour: bool = True, implicit: bool = False, frames: int = 0, said=None) -> bytes:
    """The picture's description and the picture. `said` replaces the length the picture gives for itself."""
    e = lambda *a: element(*a, implicit=implicit)
    data = e(0x7FE0, 0x10, "OW", pixels)
    if said is not None:
        data = data[: -len(pixels) - 4] + struct.pack("<I", said) + pixels if pixels else data[:-4] + struct.pack("<I", said)
    return (e(0x28, 2, "US", 3 if colour else 1) + e(0x28, 4, "CS", "RGB" if colour else "MONOCHROME2")
            + (e(0x28, 6, "US", 0) if colour else b"") + (e(0x28, 8, "IS", str(frames)) if frames else b"")
            + e(0x28, 0x10, "US", height) + e(0x28, 0x11, "US", width) + e(0x28, 0x100, "US", 8) + e(0x28, 0x101, "US", 8)
            + e(0x28, 0x102, "US", 7) + e(0x28, 0x103, "US", 0) + data)


def dicom(width: int, height: int, pixels: bytes, **more) -> bytes:
    return opening() + about() + picture(width, height, pixels, **more)


def pattern(width: int, height: int) -> bytes:
    """The test pattern as red, green and blue, with its transparent disc turned white."""
    out = bytearray()
    for row in pattern_rows(width, height):
        for x in range(width):
            r, g, b, a = row[x * 4: x * 4 + 4]
            out += bytes((c * a + 255 * (255 - a)) // 255 for c in (r, g, b))
    return bytes(out)


if __name__ == "__main__":
    with open(sys.argv[1], "wb") as out:
        out.write(dicom(320, 200, pattern(320, 200)))
