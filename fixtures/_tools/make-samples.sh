#!/bin/sh
# Regenerates the sample corpus from the test pattern. Run from anywhere:
#
#     fixtures/_tools/make-samples.sh
#
# Needs macOS (sips), ffmpeg, cwebp, python3, and `pnpm install` done (for libvips).
# The files it writes are committed; this script exists so they can be explained and remade,
# not so that tests generate their own inputs.
set -eu

tools=$(cd "$(dirname "$0")" && pwd)
out=$(cd "$tools/.." && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

ff() { ffmpeg -hide_banner -loglevel error -y "$@"; }
dir() { mkdir -p "$out/$1"; }

# --- sources --------------------------------------------------------------------------------
python3 "$tools/pattern.py" 320 200 "$work/pattern.png"      # with transparency
ff -i "$work/pattern.png" -filter_complex "color=white:s=320x200[bg];[bg][0]overlay=format=auto" \
   -frames:v 1 -pix_fmt rgb24 "$work/opaque.png"             # flattened onto white
sips -c 200 200 "$work/opaque.png" --out "$work/square.png" >/dev/null
sips -z 256 256 "$work/square.png" --out "$work/square256.png" >/dev/null

# --- one sample per format --------------------------------------------------------------------
# Formats that carry transparency are made from the transparent source; the rest from the flat one.

dir webp;  cwebp -quiet -q 80 "$work/pattern.png" -o "$out/webp/sample.webp"
dir avif;  sips -s format avif "$work/pattern.png" --out "$out/avif/sample.avif" >/dev/null
dir heic;  sips -s format heic "$work/pattern.png" --out "$out/heic/sample.heic" >/dev/null
dir tiff;  sips -s format tiff -s formatOptions lzw "$work/pattern.png" --out "$out/tiff/sample.tiff" >/dev/null
dir gif;   ff -i "$work/opaque.png" "$out/gif/sample.gif"
dir bmp;   sips -s format bmp "$work/opaque.png" --out "$out/bmp/sample.bmp" >/dev/null
dir jp2;   sips -s format jp2 "$work/opaque.png" --out "$out/jp2/sample.jp2" >/dev/null
dir psd;   sips -s format psd "$work/pattern.png" --out "$out/psd/sample.psd" >/dev/null
dir tga;   ff -i "$work/pattern.png" "$out/tga/sample.tga"
dir qoi;   ff -i "$work/pattern.png" "$out/qoi/sample.qoi"
dir sgi;   ff -i "$work/pattern.png" "$out/sgi/sample.sgi"
dir pcx;   ff -i "$work/opaque.png" "$out/pcx/sample.pcx"
dir ras;   ff -i "$work/opaque.png" -c:v sunrast "$out/ras/sample.ras"
# The two floating-point formats are made half-size: they store 12 to 16 bytes a pixel.
dir exr;   ff -i "$work/pattern.png" -vf scale=160:100 -c:v exr -compression zip1 "$out/exr/sample.exr"
dir hdr;   ff -i "$work/opaque.png" "$out/hdr/sample.hdr"
dir ico;   sips -s format ico "$work/square256.png" --out "$out/ico/sample.ico" >/dev/null
dir icns;  sips -s format icns "$work/square256.png" --out "$out/icns/sample.icns" >/dev/null

# What neither sips nor ffmpeg writes, from the ImageMagick build the app ships.
python3 "$tools/pattern.py" 64 64 "$work/small.png"
node "$tools/magick-samples.mjs" "$work/pattern.png" "$work/opaque.png" "$work/small.png" "$out"
dir dng;   python3 "$tools/dng.py" "$out/dng/sample.dng"                         # written by hand: no camera
dir dcm;   python3 "$tools/dicom.py" "$out/dcm/sample.dcm"                       # written by hand: no patient, no scanner

# The Netpbm family: colour, grey, bitmap, with-alpha, floating point.
dir pnm;   ff -i "$work/opaque.png" "$out/pnm/sample.ppm"
dir pnm;   ff -i "$work/opaque.png" -pix_fmt gray "$out/pnm/sample.pgm"
dir pnm;   ff -i "$work/opaque.png" -pix_fmt monob "$out/pnm/sample.pbm"
dir pnm;   ff -i "$work/pattern.png" "$out/pnm/sample.pam"
dir pfm;   ff -i "$work/opaque.png" -vf scale=160:100 "$out/pfm/sample.pfm"
dir xbm;   ff -i "$work/opaque.png" -pix_fmt monow "$out/xbm/sample.xbm"
dir wbmp;  ff -i "$work/opaque.png" -pix_fmt monob "$out/wbmp/sample.wbmp"

# --- cases: files that exist to provoke one specific behaviour --------------------------------
cases="$out/_cases"
python3 "$tools/pattern.py" 800 500 "$cases/alpha.png"
python3 "$tools/pattern.py" 1 1 "$cases/tiny-1x1.png"
# 5000 × 3400 = 17.0 megapixels: just over the canvas engine's 16.78 MP limit.
python3 "$tools/pattern.py" 5000 3400 "$cases/over-canvas-limit.png" --bands

# Six frames, the hue turning one sixth of the way round each time.
for n in 0 1 2 3 4 5; do
  ff -i "$work/opaque.png" -vf "hue=h=$((n * 60))" -frames:v 1 "$work/frame$n.png"
done
ff -framerate 4 -i "$work/frame%d.png" -filter_complex "split[a][b];[a]palettegen[p];[b][p]paletteuse" \
   -loop 0 "$cases/animated.gif"
dir apng;  ff -framerate 4 -i "$work/frame%d.png" -plays 0 -f apng "$out/apng/sample.png"

node "$tools/vips-samples.mjs" "$work/pattern.png" "$cases/animated.gif" "$out"

# Files that lie or are broken on purpose are traps, not cases. They read some of the samples
# written above, so they are made last.
python3 "$tools/make-traps.py"

echo "samples written under $out"

# --- sound ------------------------------------------------------------------------------------
# WAV, AIFF and AU are written by sound.py, number by number. The FLAC samples are packed from
# those by the reference packer (flac) and by ffmpeg, which is a different program, so that
# Omsett's reader is tested against files that Omsett did not write. Needs `flac` (brew install flac).
python3 "$tools/sound.py" >/dev/null
dir flac
fl() { flac --silent --force --no-padding "$@"; }
fl -8 --tag=TITLE="Test pattern" --tag=ARTIST=Omsett "$out/wav/sample.wav" -o "$out/flac/sample.flac"
fl -0 "$out/wav/sample.wav" -o "$out/flac/fixed-rules.flac"                  # the five fixed guesses only
fl -8 -b 512 "$out/wav/three-bytes.wav" -o "$out/flac/three-bytes.flac"      # short stretches, 24 bits
fl -5 "$out/wav/one-byte.wav" -o "$out/flac/one-byte.flac"
fl -5 --channel-map=none "$out/wav/six-channels.wav" -o "$out/flac/six-channels.flac"
ff -i "$out/wav/sample.wav" -map_metadata -1 -fflags +bitexact -c:a flac -compression_level 12 "$out/flac/from-ffmpeg.flac"
# MP3 is packed by LAME through ffmpeg: a file of uneven speed with tags and a count of its
# stretches, one of even speed with neither, and one channel at a slower rate.
dir mp3
ff -i "$out/wav/sample.wav" -fflags +bitexact -c:a libmp3lame -q:a 4 -id3v2_version 3 -metadata title="Test pattern" -metadata artist=Omsett "$out/mp3/sample.mp3"
ff -i "$out/wav/sample.wav" -fflags +bitexact -ar 44100 -c:a libmp3lame -b:a 128k -write_xing 0 -id3v2_version 0 -map_metadata -1 "$out/mp3/even-speed.mp3"
ff -i "$out/wav/sample.wav" -fflags +bitexact -ar 22050 -ac 1 -c:a libmp3lame -q:a 6 -id3v2_version 4 -metadata title="Test pattern" "$out/mp3/one-channel.mp3"

# --- old Word documents --------------------------------------------------------------------------
# doc/sample.doc is written by doc.py, which can say exactly what kind each paragraph is. The
# other is written by macOS itself (textutil), a program that knows nothing of Omsett, so that
# the reader is tested against a file it had no hand in. It writes headings as bold lines and
# lists as lines that begin with a bullet, which is how such files often are.
python3 "$tools/doc.py" >/dev/null
printf '%s' '<html><head><meta charset="utf-8"><title>Test pattern</title></head><body><h1>Heading one</h1><p>A paragraph with <b>bold</b> and <i>italic</i> words.</p><ul><li>First</li><li>Second</li></ul><table><tr><th>a</th><th>b</th></tr><tr><td>1</td><td>2</td></tr></table><p>Café 字幕</p></body></html>' > "$work/page.html"
textutil -convert doc "$work/page.html" -output "$out/doc/from-macos.doc"
