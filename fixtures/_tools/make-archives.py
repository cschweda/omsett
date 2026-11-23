#!/usr/bin/env python3
"""Writes the sample archives: the same few files and folders as a ZIP, a TAR and a TAR.GZ.

    python3 fixtures/_tools/make-archives.py

Standard library only, and the same bytes every time. The TAR is written the way a person's
computer writes one, with an owner's name and a link in it, so that leaving those out is tested.
"""
import gzip
import io
import os
import tarfile
import zipfile

FIXTURES = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WHEN = (2026, 11, 23, 12, 0, 0)
EPOCH = 1795435200  # the same moment, in seconds

# name, contents, whether it is marked as a program
FILES = [
    ("readme.txt", b"Drop a file. Pick a format.\nNothing leaves your device.\n", False),
    ("docs/", b"", False),
    ("docs/notes.md", b"# Notes\n\n" + b"A line that repeats, so that packing it makes it smaller.\n" * 40, False),
    ("docs/caf\u00e9 \u5b57\u5e55.txt", "Names are kept as they are: caf\u00e9, \u5b57\u5e55.\n".encode(), False),
    ("bin/run.sh", b'#!/bin/sh\necho "never run by Omsett"\n', True),
    ("empty.dat", b"", False),
]


def save(path, data):
    full = os.path.join(FIXTURES, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "wb") as out:
        out.write(data)
    print(f"{path}: {len(data)} bytes")


packed = io.BytesIO()
with zipfile.ZipFile(packed, "w", zipfile.ZIP_DEFLATED) as archive:
    for name, data, program in FILES:
        info = zipfile.ZipInfo(name, WHEN)
        info.create_system = 3  # Unix, so that the kind of file and its permissions are recorded
        folder = name.endswith("/")
        info.external_attr = ((0o040755 if folder else 0o100755 if program else 0o100644) << 16) | (0x10 if folder else 0)
        info.compress_type = zipfile.ZIP_DEFLATED
        archive.writestr(info, data)
save("zip/sample.zip", packed.getvalue())

joined = io.BytesIO()
with tarfile.open(fileobj=joined, mode="w", format=tarfile.USTAR_FORMAT) as archive:
    for name, data, program in FILES:
        info = tarfile.TarInfo(name.rstrip("/"))
        info.mtime, info.uid, info.gid, info.uname, info.gname = EPOCH, 501, 20, "ada", "staff"
        if name.endswith("/"):
            info.type, info.mode = tarfile.DIRTYPE, 0o755
            archive.addfile(info)
        else:
            info.size, info.mode = len(data), 0o755 if program else 0o644
            archive.addfile(info, io.BytesIO(data))
    link = tarfile.TarInfo("latest")
    link.type, link.linkname, link.mtime = tarfile.SYMTYPE, "docs/notes.md", EPOCH
    archive.addfile(link)
save("tar/sample.tar", joined.getvalue())

squeezed = io.BytesIO()
with gzip.GzipFile(fileobj=squeezed, mode="wb", mtime=0) as out:
    out.write(joined.getvalue())
save("tgz/sample.tar.gz", squeezed.getvalue())
