#!/usr/bin/env python3
"""Writes the trap files: images that are broken, hostile, or lying, each in one deliberate way.

    fixtures/_tools/make-traps.py

Output goes to fixtures/_traps/, with manifest.json saying what every file is and what must
happen to it. Both test suites read that manifest (fixtures/traps.test.ts in Node,
e2e/traps.spec.ts in three browsers), so adding a trap here is all it takes to have it run.

Everything is built byte by byte with the standard library, and is deterministic: running this
twice writes identical files.
"""
import json
import os
import random
import struct
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
FIXTURES = os.path.dirname(HERE)
OUT = os.path.join(FIXTURES, "_traps")
SIGNATURE = b"\x89PNG\r\n\x1a\n"

manifest = []


# --- PNG building blocks ------------------------------------------------------------------------
def chunk(kind: bytes, data: bytes, crc: int | None = None, length: int | None = None) -> bytes:
    real_crc = zlib.crc32(kind + data) & 0xFFFFFFFF
    return (
        struct.pack(">I", len(data) if length is None else length)
        + kind
        + data
        + struct.pack(">I", real_crc if crc is None else crc)
    )


def ihdr(width, height, depth=8, colour=6, interlace=0) -> bytes:
    return chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, depth, colour, 0, 0, interlace))


def idat(raw: bytes) -> bytes:
    return chunk(b"IDAT", zlib.compress(raw, 9))


IEND = chunk(b"IEND", b"")


def rgba_rows(width, height, rows=None) -> bytes:
    """Scanlines for an 8-bit RGBA picture: a gradient with a transparent corner."""
    raw = bytearray()
    for y in range(height if rows is None else rows):
        raw.append(0)
        for x in range(width):
            alpha = 0 if (x < width // 4 and y < height // 4) else 255
            raw += bytes((255 * x // max(1, width - 1), 255 * y // max(1, height - 1), 160, alpha))
    return bytes(raw)


W, H = 256, 160
GOOD = SIGNATURE + ihdr(W, H) + idat(rgba_rows(W, H)) + IEND


# --- manifest ---------------------------------------------------------------------------------
def trap(name, data, why, detect, guard="ok", node="none", browser=None, mismatch=False, group="", note=None):
    """
    detect   what identification must say: a format id, 'unregistered', or 'unknown'
    guard    'refused' if the size and pixel guard must stop it before any decode
    node     what libvips in Node must do with it: 'fails', 'succeeds', or 'none' (never reached)
    browser  the same for the app in a browser. Defaults to the Node expectation. 'either' marks
             the five damaged files that some browsers' own decoders forgive and turn into a
             partial picture (Firefox everywhere, WebKit on Linux) while others refuse them.
             That is a known gap, not a goal: see fixtures/README.md.
    note     the exact reason the app must show, where a generic one will not do
    """
    with open(os.path.join(OUT, name), "wb") as out:
        out.write(data)
    manifest.append(
        {
            "file": name,
            "group": group,
            "why": why,
            "detect": detect,
            "mismatch": mismatch,
            "guard": guard,
            "node": node,
            "browser": node if browser is None else browser,
            "note": note,
        }
    )


def read(*parts) -> bytes:
    with open(os.path.join(FIXTURES, *parts), "rb") as source:
        return source.read()


os.makedirs(OUT, exist_ok=True)
for stale in os.listdir(OUT):
    if stale != "README.md":
        os.remove(os.path.join(OUT, stale))

# === 1. Files that are not what they say ============================================================
G = "identity"
trap("empty.png", b"", "Zero bytes.", "unknown", group=G)
trap("text.png", b"This is a text file, not an image.\n", "Plain text with an image name.", "unknown", group=G)
trap(
    "random-bytes.png",
    random.Random(20261122).randbytes(4096),
    "4 KB of noise: no signature of any kind.",
    "unknown",
    group=G,
)
trap(
    "svg-with-script.png",
    b'<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>\n',
    "Markup carrying a script, named as a PNG. Must never be treated as a picture, or run.",
    "unknown",
    group=G,
)
trap(
    "jpeg-named.png",
    read("jpeg", "sample.jpg"),
    "A real JPEG with a .png name. The contents win over the name.",
    "jpeg",
    mismatch=True,
    group=G,
)
trap(
    "webp-named.png",
    read("webp", "sample.webp"),
    "A real WebP with a .png name.",
    "webp",
    mismatch=True,
    group=G,
)
trap(
    "gif-named.png",
    read("gif", "sample.gif"),
    "A real GIF, a format the registry does not know yet, with a .png name.",
    "unregistered",
    group=G,
)
trap(
    "png-named.jpg",
    GOOD,
    "A sound PNG with a .jpg name. It must convert as the PNG it is.",
    "png",
    node="succeeds",
    mismatch=True,
    group=G,
)

# === 2. Files that lie about their size ============================================================
G = "size"
trap(
    "declares-30000x30000.png",
    SIGNATURE + ihdr(30000, 30000),
    "33 bytes. The header claims 900 megapixels; there are no pixels at all.",
    "png",
    guard="refused",
    group=G,
)
trap(
    "declares-max-size.png",
    SIGNATURE + ihdr(0xFFFFFFFF, 0xFFFFFFFF),
    "The header claims the largest size a PNG header can express.",
    "png",
    guard="refused",
    group=G,
)
trap(
    "declares-zero-size.png",
    SIGNATURE + ihdr(0, 0) + idat(b"") + IEND,
    "The header claims 0 x 0.",
    "png",
    node="fails",
    group=G,
)
# A genuine decompression bomb: a valid, complete, 49 KB file that decodes to 400 megapixels.
# One bit a pixel, all zero, so it deflates to almost nothing; as RGBA it would need 1.6 GB.
BOMB = 20000
bomb_row = b"\x00" + bytes(BOMB // 8)
squeeze = zlib.compressobj(9)
bomb_data = b"".join(squeeze.compress(bomb_row) for _ in range(BOMB)) + squeeze.flush()
trap(
    "bomb-20000x20000.png",
    SIGNATURE + ihdr(BOMB, BOMB, depth=1, colour=0) + chunk(b"IDAT", bomb_data) + IEND,
    "A real decompression bomb: a valid file of a few kilobytes that decodes to 400 megapixels. "
    "It must be refused from its header, never decoded.",
    "png",
    guard="refused",
    group=G,
)
trap(
    "too-wide-for-webp.png",
    SIGNATURE + ihdr(20000, 8) + idat((b"\x00" + bytes(20000 * 4)) * 8) + IEND,
    "A valid, small picture 20000 pixels wide. WebP cannot hold anything wider than 16383. "
    "Chrome's encoder quietly returns a 16383-pixel picture instead of failing, so the app must "
    "refuse first and say why.",
    "png",
    node="fails",
    note="Too large for WebP, which holds 16383 pixels a side at most",
    group=G,
)

# === 3. Files that start well and go wrong ==========================================================
G = "damage"
trap(
    "signature-only.png",
    SIGNATURE,
    "The eight-byte PNG signature and nothing after it. Too little to call a PNG.",
    "unknown",
    group=G,
)
trap(
    "truncated.png",
    GOOD[: len(GOOD) * 6 // 10],
    "A sound PNG cut off 60% of the way through.",
    "png",
    node="fails",
    browser="either",
    group=G,
)
trap(
    "no-image-data.png",
    SIGNATURE + ihdr(W, H) + IEND,
    "A header and an end marker with no image data between them.",
    "png",
    node="fails",
    group=G,
)
trap(
    "short-image-data.png",
    SIGNATURE + ihdr(W, H) + idat(rgba_rows(W, H, rows=H // 2)) + IEND,
    "Well-formed, but holds only half the rows its header promises.",
    "png",
    node="fails",
    browser="either",
    group=G,
)
good_idat = zlib.compress(rgba_rows(W, H), 9)
broken = bytearray(good_idat)
broken[len(broken) // 3 : len(broken) // 3 + 64] = b"\xff" * 64
trap(
    "corrupt-image-data.png",
    SIGNATURE + ihdr(W, H) + chunk(b"IDAT", bytes(broken)) + IEND,
    "The compressed image data is overwritten part-way through. The checksum is correct, so only "
    "decompressing it reveals the damage.",
    "png",
    node="fails",
    browser="either",
    group=G,
)
trap(
    "bad-checksum.png",
    SIGNATURE + ihdr(W, H) + chunk(b"IDAT", good_idat, crc=0xDEADBEEF) + IEND,
    "The image data is intact but its checksum is wrong.",
    "png",
    node="fails",
    browser="either",
    group=G,
)
trap(
    "bad-bit-depth.png",
    SIGNATURE + ihdr(W, H, depth=3) + idat(rgba_rows(W, H)) + IEND,
    "The header declares a bit depth (3) that PNG does not allow.",
    "png",
    node="fails",
    group=G,
)
trap(
    "bad-colour-type.png",
    SIGNATURE + ihdr(W, H, colour=9) + idat(rgba_rows(W, H)) + IEND,
    "The header declares a colour type (9) that does not exist.",
    "png",
    node="fails",
    group=G,
)
bad_filter = bytearray(rgba_rows(W, H))
for row in range(H):
    bad_filter[row * (W * 4 + 1)] = 9
trap(
    "bad-filter-type.png",
    SIGNATURE + ihdr(W, H) + idat(bytes(bad_filter)) + IEND,
    "Every row is marked with a filter type (9) that does not exist.",
    "png",
    node="fails",
    browser="either",
    group=G,
)
trap(
    "chunk-length-overflow.png",
    SIGNATURE + ihdr(W, H) + chunk(b"IDAT", good_idat[:64], length=0xFFFFFFF0) + IEND,
    "A chunk claims to be four gigabytes long. A reader that trusts it reads past the end. "
    "Identification runs off the end of the file looking for the next chunk and gives up.",
    "unknown",
    group=G,
)
trap(
    "header-not-first.png",
    SIGNATURE + idat(rgba_rows(W, H)) + ihdr(W, H) + IEND,
    "The image data comes before the header that describes it.",
    "png",
    node="fails",
    group=G,
)
trap(
    "metadata-bomb.png",
    SIGNATURE
    + ihdr(W, H)
    + chunk(b"zTXt", b"Comment\x00\x00" + zlib.compress(bytes(50 * 1024 * 1024), 9))
    + idat(rgba_rows(W, H))
    + IEND,
    "A sound picture carrying a compressed comment that expands to 50 MB. The picture must "
    "convert without the comment being inflated into memory to no purpose.",
    "png",
    node="succeeds",
    group=G,
)
trap(
    "no-end-marker.png",
    SIGNATURE + ihdr(W, H) + idat(rgba_rows(W, H)),
    "Complete image data, but the file stops before the end marker. Every decoder accepts it.",
    "png",
    node="succeeds",
    group=G,
)
trap(
    "trailing-garbage.png",
    GOOD + random.Random(7).randbytes(10000),
    "A sound PNG followed by 10 KB of noise. The picture is whole; the tail must be ignored.",
    "png",
    node="succeeds",
    group=G,
)

# === 4. Sound files in shapes a careless reader gets wrong ============================================
G = "unusual"
deep = bytearray()
for y in range(40):
    deep.append(0)
    for x in range(64):
        deep += struct.pack(">HHHH", 65535 * x // 63, 65535 * y // 39, 40000, 65535)
trap(
    "sixteen-bit.png",
    SIGNATURE + ihdr(64, 40, depth=16) + idat(bytes(deep)) + IEND,
    "Valid, 16 bits a channel.",
    "png",
    node="succeeds",
    group=G,
)
indexed = bytearray()
for y in range(40):
    indexed.append(0)
    indexed += bytes((x // 16 + y // 10) % 4 for x in range(64))
trap(
    "palette-with-transparency.png",
    SIGNATURE
    + ihdr(64, 40, colour=3)
    + chunk(b"PLTE", bytes((59, 108, 255, 244, 244, 242, 13, 13, 13, 255, 0, 0)))
    + chunk(b"tRNS", bytes((255, 255, 255, 0)))
    + idat(bytes(indexed))
    + IEND,
    "Valid, four-colour palette, one colour fully transparent.",
    "png",
    node="succeeds",
    group=G,
)
bits = bytearray()
for y in range(40):
    bits.append(0)
    bits += bytes(0b10101010 if y % 2 else 0b01010101 for _ in range(8))
trap(
    "one-bit-grey.png",
    SIGNATURE + ihdr(64, 40, depth=1, colour=0) + idat(bytes(bits)) + IEND,
    "Valid, one bit a pixel.",
    "png",
    node="succeeds",
    group=G,
)

with open(os.path.join(OUT, "manifest.json"), "w") as out:
    json.dump(manifest, out, indent=2)
    out.write("\n")
print(f"{len(manifest)} traps written to {OUT}")
