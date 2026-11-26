#!/usr/bin/env bash
# Builds the audio engine from the Dockerfile beside this script and copies the three files
# Omsett serves into packages/engines/vendor/libav. Needs Docker. Takes a few minutes.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
out="$(dirname "$here")"
docker build -t omsett-libav "$here"
id=$(docker create omsett-libav)
trap 'docker rm -f "$id" >/dev/null' EXIT
for file in libav-omsett-audio.mjs libav-6.11.9.0.2-omsett-audio.wasm.mjs libav-6.11.9.0.2-omsett-audio.wasm.wasm; do
  docker cp "$id:/libav/dist/$file" "$out/$file"
done
docker cp "$id:/libav/LICENSE.md" "$out/LICENSE.md"
shasum -a 256 "$out"/libav-*
