#!/usr/bin/env python3
"""Writes _cases/with-exif.jpg: the sample JPEG with what a phone writes into a photograph.

    python3 fixtures/_tools/make-exif.py

A date, a camera, the program that saved it, the photographer's name, and where it was taken
(the Illinois State Capitol). Standard library only, and the same bytes every time.
"""
import os
import struct

FIXTURES = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def exif_block():
    """A small TIFF: a list of entries, a list for the camera's own details, and one for the place."""
    strings = {
        0x010F: b"Omsett\0", 0x0110: b"Omsett Phone 9\0", 0x0131: b"make-exif.py 1.0\0", 0x0132: b"2026:11:23 14:30:00\0",
        0x013B: b"Ada Lovelace\0", 0x8298: b"(c) 2026 Ada Lovelace\0", 0x010E: b"The sample picture\0",
    }
    entries, data = [], b""
    count = len(strings) + 2
    base = 8 + 2 + count * 12 + 4

    def text(tag, value):
        nonlocal data
        entries.append(struct.pack("<HHII", tag, 2, len(value), base + len(data)))
        data += value + (b"\0" if len(value) % 2 else b"")

    for tag in sorted(strings):
        text(tag, strings[tag])
    # The camera's own list: when the picture was taken, and the lens.
    taken, lens = b"2026:11:23 14:29:58\0", b"Omsett 26mm f/1.8\0"
    exif_at = base + len(data)
    sub = struct.pack("<H", 2)
    sub_base = exif_at + 2 + 2 * 12 + 4
    sub += struct.pack("<HHII", 0x9003, 2, len(taken), sub_base) + struct.pack("<HHII", 0xA434, 2, len(lens), sub_base + len(taken))
    sub += struct.pack("<I", 0) + taken + lens
    data += sub + (b"\0" if len(sub) % 2 else b"")
    # Where: 39 deg 47' 53.5" N, 89 deg 39' 17.3" W.
    gps_at = base + len(data)
    gps_base = gps_at + 2 + 4 * 12 + 4
    rationals = struct.pack("<IIIIII", 39, 1, 47, 1, 535, 10) + struct.pack("<IIIIII", 89, 1, 39, 1, 173, 10)
    gps = struct.pack("<H", 4)
    gps += struct.pack("<HHI4s", 1, 2, 2, b"N\0\0\0") + struct.pack("<HHII", 2, 5, 3, gps_base)
    gps += struct.pack("<HHI4s", 3, 2, 2, b"W\0\0\0") + struct.pack("<HHII", 4, 5, 3, gps_base + 24)
    gps += struct.pack("<I", 0) + rationals
    data += gps
    entries.append(struct.pack("<HHII", 0x8769, 4, 1, exif_at))
    entries.append(struct.pack("<HHII", 0x8825, 4, 1, gps_at))
    entries.sort(key=lambda e: struct.unpack("<H", e[:2])[0])
    return b"II*\0" + struct.pack("<I", 8) + struct.pack("<H", count) + b"".join(entries) + struct.pack("<I", 0) + data


with open(os.path.join(FIXTURES, "jpeg/sample.jpg"), "rb") as f:
    jpeg = f.read()
block = b"Exif\0\0" + exif_block()
out = jpeg[:2] + b"\xff\xe1" + struct.pack(">H", len(block) + 2) + block + jpeg[2:]
path = os.path.join(FIXTURES, "_cases/with-exif.jpg")
with open(path, "wb") as f:
    f.write(out)
print(f"_cases/with-exif.jpg: {len(out)} bytes")
