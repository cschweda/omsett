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
def trap(name, data, why, detect, guard="ok", node="none", browser=None, mismatch=False, group="", note=None, absent=None):
    """
    detect   what identification must say: a format id, 'unregistered', or 'unknown'
    guard    'refused' if the size and pixel guard must stop it before any decode
    node     what libvips in Node must do with it: 'fails', 'succeeds', or 'none' (never reached)
    browser  the same for the app in a browser. Defaults to the Node expectation, and no trap
             differs: a PNG's structure is verified before a browser's own decoder is allowed
             near it, so a forgiving decoder never gets the chance to return half a picture.
    note     the exact reason the app must show, where a generic one will not do
    absent   text that must not appear anywhere in the converted file (a payload hidden in the
             input's metadata, which a conversion must not carry across)
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
            "absent": absent,
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
    "An SVG carrying a script, named as a PNG. It is drawn as the SVG it is, and the script is "
    "never run.",
    "svg",
    node="succeeds",
    mismatch=True,
    group=G,
)
trap(
    "jpeg-named.png",
    read("jpeg", "sample.jpg"),
    "A real JPEG with a .png name. The contents win over the name, and it converts as a JPEG.",
    "jpeg",
    node="succeeds",
    mismatch=True,
    group=G,
)
trap(
    "webp-named.png",
    read("webp", "sample.webp"),
    "A real WebP with a .png name. It converts as the WebP it is.",
    "webp",
    node="succeeds",
    mismatch=True,
    group=G,
)
trap(
    "gif-named.png",
    read("gif", "sample.gif"),
    "A real GIF with a .png name. It converts as the GIF it is.",
    "gif",
    node="succeeds",
    mismatch=True,
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
bmp_huge = bytearray(read("bmp", "sample.bmp"))
bmp_huge[18:26] = struct.pack("<ii", 50000, 50000)
trap(
    "huge-declared.bmp",
    bytes(bmp_huge),
    "A small BMP whose header states 50,000 pixels a side. Refused from the header.",
    "bmp",
    guard="refused",
    group=G,
)
trap(
    "huge-declared.qoi",
    b"qoif" + struct.pack(">II", 50000, 50000) + bytes([4, 0]) + bytes(7) + b"\x01",
    "Twenty-two bytes of QOI that state 50,000 pixels a side. Refused from the header.",
    "qoi",
    guard="refused",
    group=G,
)
psd_huge = bytearray(read("psd", "sample.psd"))
psd_huge[14:22] = struct.pack(">II", 300000, 300000)
trap(
    "huge-declared.psd",
    bytes(psd_huge),
    "A Photoshop file whose header states 300,000 pixels a side, ten times what the format allows.",
    "psd",
    guard="refused",
    group=G,
)
trap(
    "huge-declared.svg",
    b'<svg xmlns="http://www.w3.org/2000/svg" width="200000" height="200000"><rect width="10" height="10"/></svg>\n',
    "A hundred bytes of SVG that state a size of forty thousand megapixels. Refused from the "
    "stated size, before anything is drawn.",
    "svg",
    guard="refused",
    group=G,
)
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
    group=G,
)
trap(
    "bad-checksum.png",
    SIGNATURE + ihdr(W, H) + chunk(b"IDAT", good_idat, crc=0xDEADBEEF) + IEND,
    "The image data is intact but its checksum is wrong.",
    "png",
    node="fails",
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

# AVIF and JPEG XL, read by libvips's optional modules. Each must refuse what is damaged too.
for folder, ext, label in (("avif", "avif", "AVIF"), ("jxl", "jxl", "JPEG XL")):
    sound = read(folder, f"sample.{ext}")
    trap(
        f"truncated.{ext}",
        sound[: len(sound) // 2],
        f"A sound {label} file cut off halfway through.",
        ext,
        node="fails",
        group=G,
    )
    flipped = bytearray(sound)
    for i in range(len(flipped) - 400, len(flipped) - 300):
        flipped[i] ^= 0xFF
    trap(
        f"corrupt-data.{ext}",
        bytes(flipped),
        f"A sound {label} file with a hundred bytes of its picture data inverted.",
        ext,
        node="fails",
        group=G,
    )

# HEIC, decoded by libheif. A file cut short is refused. One whose compressed data is altered is
# not always: HEVC carries no checksum, so the decoder cannot tell, and returns a damaged picture.
heic_sound = read("heic", "sample.heic")
trap(
    "truncated.heic",
    heic_sound[: len(heic_sound) // 2],
    "A sound HEIC file cut off halfway through.",
    "heic",
    node="fails",
    group=G,
)

# The formats ImageMagick reads. Each is cut off halfway; each must be refused, not half-drawn.
for folder, ext, label in (
    ("bmp", "bmp", "BMP"),
    ("qoi", "qoi", "QOI"),
    ("psd", "psd", "Photoshop"),
    ("ico", "ico", "icon"),
    ("jp2", "jp2", "JPEG 2000"),
):
    sound = read(folder, f"sample.{ext}")
    trap(
        f"truncated.{ext}",
        sound[: len(sound) // 2],
        f"A sound {label} file cut off halfway through.",
        ext,
        node="fails",
        group=G,
    )
ico_sound = bytearray(read("ico", "sample.ico"))
ico_sound[18:22] = struct.pack("<I", 0x7FFFFFF0)  # where the first picture is said to start
trap(
    "bad-offset.ico",
    bytes(ico_sound),
    "An icon whose directory points two gigabytes past the end of the file for its picture.",
    "ico",
    node="fails",
    group=G,
)

# SVG, drawn by resvg. It is text, so the ways it goes wrong are a parser's.
SVG_OPEN = b'<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">'
trap(
    "unclosed.svg",
    SVG_OPEN + b'<rect width="10" height="10"',
    "An SVG that stops in the middle of a tag.",
    "svg",
    node="fails",
    group=G,
)
use_bomb = b'<g id="a0"><rect width="1" height="1"/></g>'
for level in range(1, 9):
    use_bomb += f'<g id="a{level}">'.encode() + f'<use href="#a{level - 1}"/>'.encode() * 10 + b"</g>"
trap(
    "use-bomb.svg",
    SVG_OPEN + b"<defs>" + use_bomb + b'</defs><use href="#a8"/></svg>\n',
    "A few hundred bytes of shapes that each draw the one before ten times: a hundred million "
    "rectangles if followed. The reader must stop counting and refuse.",
    "svg",
    node="fails",
    group=G,
)
trap(
    "self-reference.svg",
    SVG_OPEN + b'<g id="x"><rect width="8" height="8"/><use href="#x"/></g></svg>\n',
    "A shape that draws itself. The reader must break the loop, not follow it.",
    "svg",
    node="succeeds",
    group=G,
)
trap(
    "html-named.svg",
    b"<!DOCTYPE html>\n<html><body><svg></svg><script>alert(1)</script></body></html>\n",
    "A web page with an .svg name. Its root is not <svg>, so it is not an SVG.",
    "unknown",
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


# ================================================================================================
# Second batch: adversarial files. Each reproduces the *shape* of an attack on an image reader
# (resource exhaustion, an index or length that points outside its table, a payload smuggled in
# metadata, a file that is two formats at once) without containing anything harmful itself.
# ================================================================================================

SMALL_W, SMALL_H = 64, 40
SMALL = rgba_rows(SMALL_W, SMALL_H)
PAYLOAD = "OMSETT-TRAP-PAYLOAD"

# --- more files that are not what they say --------------------------------------------------------
G = "identity"
trap(
    "gif-header-then-script.png",
    b"GIF89a" + b"/*" + bytes(20) + b"*/=1;<script>alert(1)</script>",
    "The classic two-in-one: bytes that open like a GIF and continue as a script. Identified as "
    "the GIF it opens as, refused as a broken one, and never run.",
    "gif",
    node="fails",
    mismatch=True,
    group=G,
)
trap(
    "entity-expansion.svg",
    b'<?xml version="1.0"?>\n<!DOCTYPE lolz [<!ENTITY a "aaaaaaaaaa">'
    + b"".join(
        f'<!ENTITY {chr(98 + i)} "{("&" + chr(97 + i) + ";") * 10}">'.encode() for i in range(8)
    )
    + b']>\n<svg xmlns="http://www.w3.org/2000/svg"><text>&i;</text></svg>\n',
    "An XML entity bomb (\"billion laughs\"): a kilobyte that expands to a gigabyte of text if "
    "parsed. The SVG reader must notice the loop and refuse.",
    "svg",
    node="fails",
    group=G,
)
trap(
    "svg-fetches-elsewhere.svg",
    b'<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="40" height="40">'
    b'<image xlink:href="https://example.invalid/track.png" width="1" height="1"/>'
    b'<script xlink:href="https://example.invalid/x.js"/></svg>\n',
    "An SVG that asks for a picture and a script from another site. It is drawn without them, "
    "and nothing may be requested.",
    "svg",
    node="succeeds",
    group=G,
)
trap(
    "utf16-text.png",
    "﻿This is text in UTF-16, with a byte-order mark.\n".encode("utf-16"),
    "Text in an encoding whose first bytes can be mistaken for a binary signature.",
    "unknown",
    group=G,
)
trap(
    "png-then-zip.png",
    GOOD + b"PK\x03\x04" + bytes(26) + b"PK\x05\x06" + bytes(18),
    "A sound PNG with a ZIP archive attached to its end: one file, two formats. It is the PNG "
    "it opens as, and only the picture is converted.",
    "png",
    node="succeeds",
    group=G,
)
trap(
    "script-in-metadata.png",
    SIGNATURE
    + ihdr(SMALL_W, SMALL_H)
    + chunk(b"tEXt", b"Comment\x00<script>alert('" + PAYLOAD.encode() + b"')</script>")
    + chunk(
        b"iTXt",
        b"XML:com.adobe.xmp\x00\x00\x00\x00\x00"
        + b'<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">'
        b'<rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:creator>'
        + PAYLOAD.encode()
        + b"</dc:creator></rdf:Description></rdf:RDF></x:xmpmeta>",
    )
    + chunk(
        b"eXIf",
        b"MM\x00\x2a\x00\x00\x00\x08\x00\x01\x01\x0e\x00\x02"
        + struct.pack(">II", len(PAYLOAD) + 1, 26)
        + bytes(4)
        + PAYLOAD.encode()
        + b"\x00",
    )
    + idat(SMALL)
    + IEND,
    "A sound picture whose comment, XMP and EXIF metadata all carry a marked payload, one of "
    "them a script. The picture converts; none of the payload may reach the output, whichever "
    "engine does the work.",
    "png",
    node="succeeds",
    absent=PAYLOAD,
    group=G,
)

# --- more files that lie about their size ----------------------------------------------------------
G = "size"
trap(
    "rowbytes-overflow.png",
    SIGNATURE + ihdr(0x40000000, 1, depth=16),
    "One row, a billion pixels wide at 16 bits a channel: eight gigabytes for a single row, a "
    "size that overflows the 32-bit arithmetic older readers used for it.",
    "png",
    guard="refused",
    group=G,
)
trap(
    "sign-bit-size.png",
    SIGNATURE + ihdr(0x80000000, 0x80000000),
    "A width and height with the top bit set, which a reader that treats them as signed numbers "
    "sees as negative.",
    "png",
    guard="refused",
    group=G,
)
tall = 100000
squeeze = zlib.compressobj(9)
tall_data = b"".join(squeeze.compress(b"\x00\x00") for _ in range(tall)) + squeeze.flush()
trap(
    "tall-1x100000.png",
    SIGNATURE + ihdr(1, tall, depth=1, colour=0) + chunk(b"IDAT", tall_data) + IEND,
    "Valid, one pixel wide and a hundred thousand tall. Tiny in pixels, so the size guard lets "
    "it through; far taller than WebP can hold, so the target must refuse it.",
    "png",
    node="fails",
    note="Too large for WebP, which holds 16383 pixels a side at most",
    group=G,
)
big = 8000
big_row = b"\x00" + bytes(big // 8)
squeeze = zlib.compressobj(9)
big_data = b"".join(squeeze.compress(big_row) for _ in range(big)) + squeeze.flush()
trap(
    "large-8000x8000.png",
    SIGNATURE + ihdr(big, big, depth=1, colour=0) + chunk(b"IDAT", big_data) + IEND,
    "Valid and genuinely large: 64 megapixels in a file of a few kilobytes. Allowed by the guard "
    "and too big for the canvas engine, so it must be handed to libvips and convert, without "
    "the tab running out of memory.",
    "png",
    node="succeeds",
    group=G,
)

# --- more damage: the shapes that have broken image readers before ---------------------------------
G = "damage"
bad_adler = bytearray(zlib.compress(SMALL, 9))
bad_adler[-4:] = b"\xde\xad\xbe\xef"
trap(
    "inner-checksum-wrong.png",
    SIGNATURE + ihdr(SMALL_W, SMALL_H) + chunk(b"IDAT", bytes(bad_adler)) + IEND,
    "The outer checksum is right; the one inside the compressed data, which is only checked "
    "after everything has been decompressed, is wrong.",
    "png",
    node="fails",
    group=G,
)
trap(
    "too-much-image-data.png",
    SIGNATURE + ihdr(SMALL_W, SMALL_H) + idat(SMALL + SMALL) + IEND,
    "Twice as many rows as the header declares. A reader that writes what it is given, instead "
    "of what it allocated for, writes past the end of its buffer.",
    "png",
    node="succeeds",
    group=G,
)
out_of_range = b"".join(b"\x00" + bytes([200]) * SMALL_W for _ in range(SMALL_H))
trap(
    "palette-index-out-of-range.png",
    SIGNATURE
    + ihdr(SMALL_W, SMALL_H, colour=3)
    + chunk(b"PLTE", bytes((255, 0, 0, 0, 0, 255)))
    + idat(out_of_range)
    + IEND,
    "A two-colour palette, and pixels that all ask for colour number 200. A reader that looks "
    "it up without checking reads memory that is not the palette.",
    "png",
    node="succeeds",
    group=G,
)
trap(
    "palette-wrong-length.png",
    SIGNATURE
    + ihdr(SMALL_W, SMALL_H, colour=3)
    + chunk(b"PLTE", bytes((255, 0, 0, 0, 0, 255, 7)))
    + idat(b"".join(b"\x00" + bytes(SMALL_W) for _ in range(SMALL_H)))
    + IEND,
    "A palette of seven bytes. Colours take three bytes each, so the last one is cut short.",
    "png",
    node="fails",
    group=G,
)
trap(
    "transparency-longer-than-palette.png",
    SIGNATURE
    + ihdr(SMALL_W, SMALL_H, colour=3)
    + chunk(b"PLTE", bytes((255, 0, 0, 0, 0, 255)))
    + chunk(b"tRNS", bytes(256))
    + idat(b"".join(b"\x00" + bytes(SMALL_W) for _ in range(SMALL_H)))
    + IEND,
    "Two colours in the palette, and 256 transparency entries for them.",
    "png",
    node="succeeds",
    group=G,
)
trap(
    "unknown-critical-chunk.png",
    SIGNATURE + ihdr(SMALL_W, SMALL_H) + chunk(b"CRIT", b"must be understood") + idat(SMALL) + IEND,
    "Contains a chunk marked as essential that no reader knows. The format says a reader that "
    "does not understand an essential chunk must give up.",
    "png",
    node="fails",
    group=G,
)
trap(
    "interlace-flag-lies.png",
    SIGNATURE
    + chunk(b"IHDR", struct.pack(">IIBBBBB", SMALL_W, SMALL_H, 8, 6, 0, 0, 1))
    + idat(SMALL)
    + IEND,
    "The header says the rows are interlaced; the data is laid out as if they were not.",
    "png",
    node="fails",
    group=G,
)
trap(
    "colour-profile-bomb.png",
    SIGNATURE
    + ihdr(SMALL_W, SMALL_H)
    + chunk(b"iCCP", b"bomb\x00\x00" + zlib.compress(bytes(64 * 1024 * 1024), 9))
    + idat(SMALL)
    + IEND,
    "A sound picture with a colour profile that expands to 64 MB of nothing. Unlike a comment, "
    "a profile is something a reader wants to load.",
    "png",
    node="succeeds",
    group=G,
)
whole = zlib.compress(SMALL, 9)
trap(
    "image-data-in-single-bytes.png",
    SIGNATURE + ihdr(SMALL_W, SMALL_H) + b"".join(chunk(b"IDAT", whole[i : i + 1]) for i in range(len(whole))) + IEND,
    "Valid, with the image data split into one chunk per byte: thousands of chunks, each with "
    "its own header and checksum, to make a reader do a great deal of work for very little.",
    "png",
    node="succeeds",
    group=G,
)
trap(
    "five-thousand-comments.png",
    SIGNATURE + ihdr(SMALL_W, SMALL_H) + b"".join(chunk(b"tEXt", b"k%04d\x00v" % i) for i in range(5000)) + idat(SMALL) + IEND,
    "Valid, with five thousand comments ahead of the picture.",
    "png",
    node="succeeds",
    group=G,
)
trap(
    "zero-gamma.png",
    SIGNATURE + ihdr(SMALL_W, SMALL_H) + chunk(b"gAMA", struct.pack(">I", 0)) + idat(SMALL) + IEND,
    "Declares a gamma of zero, which a reader that applies it divides by.",
    "png",
    node="succeeds",
    group=G,
)
trap(
    "claims-a-million-frames.png",
    SIGNATURE + ihdr(SMALL_W, SMALL_H) + chunk(b"acTL", struct.pack(">II", 1_000_000, 0)) + idat(SMALL) + IEND,
    "Announces itself as an animation of a million frames and contains one picture. A reader "
    "that allocates per announced frame runs out of memory.",
    "png",
    node="succeeds",
    group=G,
)

# --- one more sound file a careless reader gets wrong ----------------------------------------------
G = "unusual"


def adam7(width, height):
    """The same gradient as rgba_rows, laid out in the seven passes of an interlaced PNG."""
    raw = bytearray()
    passes = ((0, 0, 8, 8), (4, 0, 8, 8), (0, 4, 4, 8), (2, 0, 4, 4), (0, 2, 2, 4), (1, 0, 2, 2), (0, 1, 1, 2))
    for x0, y0, dx, dy in passes:
        if x0 >= width:
            continue
        for y in range(y0, height, dy):
            raw.append(0)
            for x in range(x0, width, dx):
                raw += bytes((255 * x // max(1, width - 1), 255 * y // max(1, height - 1), 160, 255))
    return bytes(raw)


trap(
    "interlaced.png",
    SIGNATURE
    + chunk(b"IHDR", struct.pack(">IIBBBBB", SMALL_W, SMALL_H, 8, 6, 0, 0, 1))
    + idat(adam7(SMALL_W, SMALL_H))
    + IEND,
    "Valid, with its rows interlaced in seven passes, the way PNGs were saved for slow "
    "connections.",
    "png",
    node="succeeds",
    group=G,
)

with open(os.path.join(OUT, "manifest.json"), "w") as out:
    json.dump(manifest, out, indent=2)
    out.write("\n")
print(f"{len(manifest)} traps written to {OUT}")
