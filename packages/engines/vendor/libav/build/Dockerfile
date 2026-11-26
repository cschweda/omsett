# The audio engine: libav.js, an FFmpeg built to WebAssembly, in a variant Omsett makes itself.
# Everything that decides what is in it is here: the Emscripten release, the libav.js release
# (which fixes the FFmpeg, Opus, Vorbis and Ogg releases it builds), and the list of parts.
#
#   packages/engines/vendor/libav/build/build.sh      builds it, and copies the three files out
FROM emscripten/emsdk:6.0.5
RUN apt-get update -qq && apt-get install -y -qq pkg-config && rm -rf /var/lib/apt/lists/*
RUN git clone -q --depth 1 --branch v6.11.9.0.2 https://github.com/Yahweasel/libav.js.git /libav
COPY fragments.json /fragments.json
WORKDIR /libav/configs
RUN node mkconfig.js omsett-audio "$(cat /fragments.json | tr -d '\n ')"
WORKDIR /libav
RUN make build-omsett-audio -j"$(nproc)"
