#!/usr/bin/env python3
"""Draws the Omsett test pattern as an RGBA PNG, with no dependencies.

    pattern.py WIDTH HEIGHT OUT.png            the full pattern
    pattern.py WIDTH HEIGHT OUT.png --bands    flat colour bands (compresses to almost nothing)

The pattern puts one thing in each region that a conversion can get wrong:

    gradient background    banding
    transparent disc       alpha lost, or its soft edge turned into a halo
    checkerboard           ringing around hard edges
    one-pixel lines        fine detail smeared or dropped
    flat blue block        colour shift (it is exactly #3b6cff)
"""
import math
import struct
import sys
import zlib


def chunk(kind: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)


def write_png(path: str, width: int, height: int, rows) -> None:
    compressor = zlib.compressobj(9)
    data = bytearray()
    for row in rows:
        data += compressor.compress(b"\x00" + bytes(row))
    data += compressor.flush()
    header = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    with open(path, "wb") as out:
        out.write(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", bytes(data)) + chunk(b"IEND", b""))


def pattern_rows(w: int, h: int):
    # Everything is placed as a fraction of the canvas, so any size shows the same picture.
    def box(x0, y0, x1, y1):
        return int(x0 * w), int(y0 * h), int(x1 * w), int(y1 * h)

    blue = box(0.075, 0.12, 0.325, 0.42)
    check = box(0.075, 0.56, 0.325, 0.88)
    lines = box(0.40, 0.56, 0.65, 0.88)
    cx, cy, radius = 0.75 * w, 0.33 * h, 0.22 * h
    soft = max(2.0, 0.04 * h)
    cell = max(2, (check[2] - check[0]) // 10)

    for y in range(h):
        row = bytearray(w * 4)
        for x in range(w):
            r = 255 * x // max(1, w - 1)
            g = 255 * y // max(1, h - 1)
            b = int(255 * (1 - x / max(1, w - 1)) * 0.6 + 60)
            a = 255
            d = math.hypot(x - cx, y - cy)
            if d < radius:
                a = 0
            elif d < radius + soft:
                a = int(255 * (d - radius) / soft)
            if check[0] <= x < check[2] and check[1] <= y < check[3]:
                r = g = b = 255 if ((x - check[0]) // cell + (y - check[1]) // cell) % 2 == 0 else 13
            if lines[0] <= x < lines[2] and lines[1] <= y < lines[3] and x % 4 == 0:
                r, g, b = 59, 108, 255
            if blue[0] <= x < blue[2] and blue[1] <= y < blue[3]:
                r, g, b = 59, 108, 255
            i = x * 4
            row[i], row[i + 1], row[i + 2], row[i + 3] = r, g, b, a
        yield row


def band_rows(w: int, h: int):
    colours = [(59, 108, 255), (244, 244, 242), (13, 13, 13), (138, 138, 134)]
    cached = [bytes(c + (255,)) * w for c in colours]
    for y in range(h):
        yield cached[(y * len(colours)) // h]


if __name__ == "__main__":
    width, height, out = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3]
    rows = band_rows(width, height) if "--bands" in sys.argv else pattern_rows(width, height)
    write_png(out, width, height, rows)
