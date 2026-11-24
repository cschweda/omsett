#!/usr/bin/env python3
"""Writes the sample sound files, and builds sound files for the traps, with no dependencies.

    fixtures/_tools/sound.py        writes fixtures/wav, fixtures/aiff and fixtures/au

Every sample holds the same quarter of a second: a note that rises on the left and a note that
fades on the right, 11,025 times a second. It begins with the loudest and the quietest numbers
a file can hold, so that a reader which gets a sign or the order of the bytes wrong is caught.
The files differ only in how they write those numbers. Deterministic: twice gives the same files.
"""
import math
import os
import struct

RATE = 11025
FRAMES = RATE // 4
ORDINARY = bytes([0x00, 0x00, 0x00, 0x00, 0x10, 0x00, 0x80, 0x00, 0x00, 0xAA, 0x00, 0x38, 0x9B, 0x71])


def pattern(frames=FRAMES, rate=RATE):
    """The test sound as pairs of 16-bit numbers, left and right."""
    out = [(32767, -32768), (-32768, 32767), (0, 0), (1, -1)]
    phase = 0.0
    for n in range(len(out), frames):
        t = n / rate
        phase += 2 * math.pi * (220 + 1760 * t) / rate
        left = int(round(26000 * math.sin(phase)))
        right = int(round(26000 * math.exp(-6 * t) * math.sin(2 * math.pi * 440 * t)))
        out.append((left, right))
    return out


def mono(pairs):
    return [((left + right) // 2,) for left, right in pairs]


def whole(frames, size, little, unsigned=False):
    """16-bit numbers written `size` bytes wide: widened by adding empty bytes, narrowed by dropping them."""
    out = bytearray()
    for frame in frames:
        for value in frame:
            value = value << (8 * (size - 2)) if size >= 2 else value >> 8
            if unsigned:
                value += 1 << (8 * size - 1)
            out += (value & ((1 << (8 * size)) - 1)).to_bytes(size, "little" if little else "big")
    return bytes(out)


def fractions(frames, size, little):
    code = ("<" if little else ">") + ("f" if size == 4 else "d")
    return b"".join(struct.pack(code, value / 32768) for frame in frames for value in frame)


def ulaw_of(value):
    """The telephone code for a 16-bit number (G.711, µ-law)."""
    sign = 0x80 if value < 0 else 0
    value = min(abs(value), 32635) + 0x84
    exponent = max(value.bit_length() - 8, 0)
    return ~(sign | (exponent << 4) | ((value >> (exponent + 3)) & 0x0F)) & 0xFF


def alaw_of(value):
    """The same for A-law, the code used outside North America and Japan."""
    sign = 0x80 if value >= 0 else 0
    value = min(abs(value), 32767) >> 3
    if value < 32:
        code = value >> 1
    else:
        exponent = value.bit_length() - 5
        code = (exponent << 4) | ((value >> exponent) & 0x0F)
    return (sign | code) ^ 0x55


def coded(frames, code):
    return bytes(code(value) for frame in frames for value in frame)


def part(name: bytes, data: bytes, little=True, size=None) -> bytes:
    """A labelled part: four letters, a length, the contents, and a byte to make it even."""
    length = len(data) if size is None else size
    return name + struct.pack("<I" if little else ">I", length) + data + b"\0" * (len(data) % 2)


def info(**entries) -> bytes:
    """A WAV's notes: INAM for a title, IART for an artist, and so on."""
    return part(b"LIST", b"INFO" + b"".join(part(key.encode(), value + b"\0") for key, value in entries.items()))


def wav(data, channels=2, rate=RATE, bits=16, kind=1, block=None, said=None, extensible=False, before=b"", after=b"", riff=None, label=None):
    """A WAV. `said` is the length the sound claims; `block` the bytes it claims to a moment."""
    width = (bits + 7) // 8
    block = channels * width if block is None else block
    fmt = struct.pack("<HHIIHH", 0xFFFE if extensible else kind, channels, rate, rate * block & 0xFFFFFFFF, block, bits)
    if extensible:
        fmt += struct.pack("<HHIH", 22, bits, 0, kind) + ORDINARY
    elif kind != 1:
        fmt += struct.pack("<H", 0)
    fmt = fmt if label is None else label
    body = b"WAVE" + part(b"fmt ", fmt) + before
    if kind != 1:
        body += part(b"fact", struct.pack("<I", len(data) // max(block, 1)))
    body += part(b"data", data, size=said) + after
    return b"RIFF" + struct.pack("<I", len(body) if riff is None else riff) + body


def extended(value: float) -> bytes:
    """A rate as AIFF writes it: a power of two, then sixty-four bits of number."""
    power = math.floor(math.log2(value))
    whole_part = int(value * 2 ** (63 - power))
    return struct.pack(">HQ", power + 16383, whole_part)


def aiff(data, channels=2, rate=RATE, bits=16, how=None, frames=None, said=None, before=b"", after=b"", skip=0, name=b"", common=None, sound_first=False):
    """An AIFF, or an AIFF-C when `how` gives the four letters for the way its numbers are written."""
    width = (bits + 7) // 8 if how not in (b"ulaw", b"alaw") else 1
    frames = len(data) // (channels * width) if frames is None else frames
    comm = struct.pack(">hIh", channels, frames, bits) + extended(rate)
    if how:
        comm += how + bytes([len(name)]) + name + b"\0" * ((len(name) + 1) % 2)
    comm = part(b"COMM", comm if common is None else common, little=False)
    ssnd = part(b"SSND", struct.pack(">II", skip, 0) + b"\0" * skip + data, little=False, size=said)
    version = part(b"FVER", struct.pack(">I", 0xA2805140), little=False) if how else b""
    body = (b"AIFC" if how else b"AIFF") + version + before + (ssnd + comm if sound_first else comm + ssnd) + after
    return b"FORM" + struct.pack(">I", len(body)) + body


def au(data, channels=2, rate=RATE, how=3, said=None, note=b"\0\0\0\0", start=None):
    """An AU: six numbers, a note, the sound. `how` is 1 µ-law, 2-5 whole numbers, 6-7 fractions, 27 A-law."""
    at = 24 + len(note) if start is None else start
    return b".snd" + struct.pack(">IIIII", at, len(data) if said is None else said, how, rate, channels) + note + data


PAIRS = pattern()

SAMPLES = {
    # One of each, as most such files are: sixteen bits, two channels. The WAV says who made it.
    "wav/sample.wav": lambda: wav(whole(PAIRS, 2, True), after=info(INAM=b"Test pattern", IART=b"Omsett", ISFT=b"fixtures/_tools/sound.py")),
    "aiff/sample.aiff": lambda: aiff(whole(PAIRS, 2, False), before=part(b"NAME", b"Test pattern", little=False)),
    "au/sample.au": lambda: au(whole(PAIRS, 2, False), note=b"Test pattern\0\0\0\0"),
    # And the other ways each can write its numbers.
    "wav/one-byte.wav": lambda: wav(whole(PAIRS, 1, True, unsigned=True), bits=8),
    "wav/three-bytes.wav": lambda: wav(whole(PAIRS, 3, True), bits=24),
    "wav/fractions.wav": lambda: wav(fractions(PAIRS, 4, True), bits=32, kind=3),
    "wav/telephone.wav": lambda: wav(coded(mono(PAIRS), ulaw_of), channels=1, bits=8, kind=7),
    "wav/six-channels.wav": lambda: wav(whole([pair * 3 for pair in PAIRS], 2, True), channels=6, extensible=True),
    "aiff/smallest-first.aifc": lambda: aiff(whole(PAIRS, 2, True), how=b"sowt", name=b""),
    "aiff/fractions.aifc": lambda: aiff(fractions(PAIRS, 8, False), bits=64, how=b"fl64", name=b"64-bit floating point"),
    "aiff/old-mac.aiff": lambda: aiff(whole(mono(PAIRS), 1, False), channels=1, bits=8, rate=22254.54545),
    "au/telephone.au": lambda: au(coded(mono(PAIRS), ulaw_of), channels=1, rate=8000, how=1),
    "au/a-law.au": lambda: au(coded(mono(PAIRS), alaw_of), channels=1, rate=8000, how=27),
    "au/four-bytes.au": lambda: au(whole(PAIRS, 4, False), how=5),
}

if __name__ == "__main__":
    fixtures = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    for path, make in SAMPLES.items():
        os.makedirs(os.path.dirname(os.path.join(fixtures, path)), exist_ok=True)
        with open(os.path.join(fixtures, path), "wb") as out:
            out.write(make())
    print(f"{len(SAMPLES)} sound samples written")
