# Changelog

## 0.1.0

Phase 0: PNG → WebP in the browser.

- One screen: drop a PNG, choose WebP, convert, download. Keyboard-operable throughout, with
  each step announced to screen readers.
- A format registry in which each engine declares what it reads and writes; conversion routes
  and fidelity warnings are derived from that.
- Two engines behind one interface: the browser's own canvas encoder, and libvips
  (`wasm-vips`) where the browser cannot encode WebP itself.
- Files are identified by their contents, not their names, and an image too large to decode
  safely is refused from its header alone.
- Nothing leaves the origin: enforced by a Content-Security-Policy on the page and on every
  worker, and checked in the browser tests.
- A self-host image (`omsett-web`, Caddy) and `docker-compose.yml`.
- Tests: the PNG fixture through libvips in Node, and through each browser's own engine in
  Chromium, Firefox, and WebKit.
