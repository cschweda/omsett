# The audio engine

libav.js 6.11.9.0.2 (FFmpeg 9.0.2, Opus 1.6.1, libvorbis, libogg), built to WebAssembly in a
variant of Omsett's own, `omsett-audio`, by `build/build.sh` from `build/Dockerfile` and
`build/fragments.json`. Those three files are everything that decides what is in it; anyone
can build it again and get the same parts.

It reads AAC and Apple Lossless (M4A), AC-3 and E-AC-3, WMA, Ogg Vorbis, Opus, WavPack and TTA,
and writes Opus, Ogg Vorbis, WavPack and Apple Lossless. It also reads WAV, AIFF and FLAC, the
sound it packs from, in every layout Omsett's own readers take. It has no AAC or AC-3 encoder: those
are covered by patents, and are left out on purpose. Nothing in it is GPL.

Licences: libav.js and FFmpeg are LGPL-2.1-or-later (`LICENSE.md`); Opus, libvorbis and libogg
are BSD-3-Clause. The sources of each, at the releases named above, are where the Dockerfile
fetches them from.

The three files here are served to browsers as they are: `libav-omsett-audio.mjs` (the loader),
`libav-6.11.9.0.2-omsett-audio.wasm.mjs` (the glue) and the `.wasm.wasm` itself. A build from
the script gives these, byte for byte (SHA-256):

| File | Bytes | SHA-256 |
| --- | --- | --- |
| `libav-omsett-audio.mjs` | 28,385 | `7afcac50a6649e78c9a49060a7c377d8a76aed86d41e55d276212fbf2d709a59` |
| `libav-6.11.9.0.2-omsett-audio.wasm.mjs` | 299,758 | `650f73f6b34b607144e017dbb2de39f66a1640f275965d35c72cae93343c18a2` |
| `libav-6.11.9.0.2-omsett-audio.wasm.wasm` | 2,991,713 | `857baf71ac4b73be469e6a764cd4056f3b09986efaf61363efac96139f2a72e9` |
