#!/usr/bin/env python3
"""Builds FLAC files for the traps, bit by bit, with no dependencies.

A FLAC is a label and then stretches of sound, each with two checksums of its own, and the label
carries a checksum of all the sound. To make a file that is wrong in one way only, everything
else about it has to be right, so this writes real FLAC: every checksum correct unless a trap
asks otherwise. It packs nothing cleverly. Numbers are written as they are, or as one number
repeated, or as the differences from a fixed guess, which is enough to reach every part of a
reader.

The sample FLAC files are not made here. They come from the reference packer and from ffmpeg
(make-samples.sh), so that the reader is tested against files it did not write.
"""
import hashlib
import struct


class Bits:
    def __init__(self):
        self.bits = []

    def put(self, value, count):
        self.bits += [(value >> (count - 1 - i)) & 1 for i in range(count)]
        return self

    def signed(self, value, count):
        return self.put(value & ((1 << count) - 1), count)

    def zeros(self, count):
        self.bits += [0] * count + [1]
        return self

    def align(self):
        self.bits += [0] * (-len(self.bits) % 8)
        return self

    def bytes(self):
        self.align()
        return bytes(int("".join(map(str, self.bits[i : i + 8])), 2) for i in range(0, len(self.bits), 8))


def crc8(data):
    crc = 0
    for byte in data:
        crc ^= byte
        for _ in range(8):
            crc = ((crc << 1) ^ 0x07) & 0xFF if crc & 0x80 else (crc << 1) & 0xFF
    return crc


def crc16(data):
    crc = 0
    for byte in data:
        crc ^= byte << 8
        for _ in range(8):
            crc = ((crc << 1) ^ 0x8005) & 0xFFFF if crc & 0x8000 else (crc << 1) & 0xFFFF
    return crc


def counted(value):
    """A number as UTF-8 writes a character."""
    if value < 0x80:
        return bytes([value])
    more = 1
    while value >= 1 << (6 + 5 * more):
        more += 1
    lead = ((0xFF << (7 - more)) & 0xFF) | (value >> (6 * more))
    return bytes([lead] + [0x80 | ((value >> (6 * i)) & 0x3F) for i in range(more - 1, -1, -1)])


def plain(values, depth, spare=0):
    """One channel written as it is. `spare` low bits are left out and counted instead."""
    def write(bits):
        bits.put(0, 1).put(1, 6)
        if spare:
            bits.put(1, 1).zeros(spare - 1)
        else:
            bits.put(0, 1)
        for value in values:
            bits.signed(value >> spare, depth - spare)
    return write


def constant(value, depth):
    """One channel that is the same number throughout."""
    return lambda bits: bits.put(0, 1).put(0, 6).put(0, 1).signed(value, depth)


def guessed(values, depth, order=2, k=None, escape=None, parts=0, kind=None, long=False):
    """One channel as the differences from a fixed guess. `escape` writes them plainly in that many bits."""
    rules = {0: [], 1: [1], 2: [2, -1], 3: [3, -3, 1], 4: [4, -6, 4, -1]}[order]
    left = [values[i] - sum(w * values[i - 1 - j] for j, w in enumerate(rules)) for i in range(order, len(values))]

    def write(bits):
        bits.put(0, 1).put(8 + order if kind is None else kind, 6).put(0, 1)
        for value in values[:order]:
            bits.signed(value, depth)
        # The code's setting takes four bits, or five in the longer form.
        wide = 5 if long else 4
        bits.put(1 if long else 0, 2).put(parts, 4)
        each = len(values) >> parts
        at = 0
        for part in range(1 << parts):
            many = each - (order if part == 0 else 0)
            if escape is not None:
                bits.put((1 << wide) - 1, wide).put(escape, 5)
                for value in left[at : at + many]:
                    bits.signed(value, escape) if escape else None
            else:
                rice = 4 if k is None else k
                bits.put(rice, wide)
                for value in left[at : at + many]:
                    folded = 2 * value if value >= 0 else -2 * value - 1
                    bits.zeros(folded >> rice).put(folded & ((1 << rice) - 1), rice)
            at += many
    return write


def stretch(index, count, channels, depth=16, layout=None, header=None, check=None, check16=None, size_code=None):
    """One stretch of sound: `channels` is a list of the writers above, one for each channel."""
    bits = Bits()
    code = {192: 1, 576: 2, 1152: 3, 2304: 4, 4608: 5, 256: 8, 512: 9, 1024: 10, 2048: 11, 4096: 12, 8192: 13, 16384: 14, 32768: 15}.get(count, 7)
    code = code if size_code is None else size_code
    bits.put(0xFFF8, 16).put(code, 4).put(0, 4).put(len(channels) - 1 if layout is None else layout, 4)
    bits.put({8: 1, 12: 2, 16: 4, 20: 5, 24: 6, 32: 7}[depth], 3).put(0, 1)
    head = bits.bytes() + counted(index) + (struct.pack(">H", count - 1) if code == 7 else b"")
    head = head if header is None else header(head)
    head += bytes([crc8(head) if check is None else check])
    body = Bits()
    for write in channels:
        write(body)
    data = head + body.bytes()
    return data + struct.pack(">H", crc16(data) if check16 is None else check16)


def label(rate, channels, depth, total, md5=b"\0" * 16, block=4096):
    """The part that says how the sound is stored: thirty-four bytes."""
    packed = (rate << 44) | ((channels - 1) << 41) | ((depth - 1) << 36) | total
    return struct.pack(">HH", block, block) + b"\0" * 6 + packed.to_bytes(8, "big") + md5


def part(kind, data, last=False, size=None):
    return bytes([kind | (0x80 if last else 0)]) + (len(data) if size is None else size).to_bytes(3, "big") + data


def comments(vendor=b"Omsett fixtures", **entries):
    """Words about the sound: who made the file, then NAME=words. Lengths smallest byte first."""
    items = [key.encode() + b"=" + value for key, value in entries.items()]
    return struct.pack("<I", len(vendor)) + vendor + struct.pack("<I", len(items)) + b"".join(struct.pack("<I", len(item)) + item for item in items)


def picture(description=b"", data=b"\x89PNG\r\n\x1a\n"):
    mime = b"image/png"
    return struct.pack(">II", 3, len(mime)) + mime + struct.pack(">I", len(description)) + description + struct.pack(">IIIII", 1, 1, 24, 0, len(data)) + data


def checksum(frames, depth):
    """The checksum FLAC keeps of its sound: every number, smallest byte first, channel by channel in turn."""
    width = (depth + 7) // 8
    return hashlib.md5(b"".join((value & ((1 << (8 * width)) - 1)).to_bytes(width, "little") for frame in frames for value in frame)).digest()


def flac(frames, rate=11025, depth=16, block=1024, total=None, md5=None, extra=b"", make=None, before=b"", after=b""):
    """A whole FLAC of these moments of sound (a list of tuples, one number for each channel)."""
    channels = len(frames[0])
    stretches = b""
    for index, at in enumerate(range(0, len(frames), block)):
        piece = frames[at : at + block]
        columns = [[frame[c] for frame in piece] for c in range(channels)]
        writers = (make or (lambda column, depth: plain(column, depth)))
        stretches += stretch(index, len(piece), [writers(column, depth) for column in columns], depth)
    info = label(rate, channels, depth, len(frames) if total is None else total, checksum(frames, depth) if md5 is None else md5, block=block)
    return before + b"fLaC" + part(0, info, last=not extra) + extra + stretches + after
