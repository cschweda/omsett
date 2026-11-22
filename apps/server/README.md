# apps/server — reserved for `omsettd` (Phase 4)

Nothing is built here yet. Nothing in Phase 0 needs a server.

`omsettd` will be a small Node 24 service (Hono) that runs native engines (ffmpeg, LibreOffice,
Calibre, Ghostscript, Pandoc) for people who cannot install the desktop app. It is **self-host
only**: a Docker image for a homelab or an office box. There is no public instance and there
never will be.

The web app already understands its contract, through `useServerHealth`:

- `GET /config.json` → `{ "server": boolean }`. Answered by the web image's Caddy, from
  `OMSETT_SERVER`.
- `GET /api/health` → `200 { ok: true, version: string, engines: string[], maxBytes: number }`.
  Same origin, always: Caddy proxies `/api/*` to omsettd. `engines` lists the native binaries
  available (`ffmpeg`, `soffice`, `ebook-convert`, `gs`, `pandoc`); `maxBytes` is the per-file cap.

Everything else (`POST /api/convert`, job progress, results) is specified in
[`docs/00-high-level-design.md`](../../docs/00-high-level-design.md) and built in Phase 4.
