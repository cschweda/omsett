# apps/desktop — reserved for the desktop app (Phase 3)

Nothing is built here yet.

The desktop app will be an Electron shell (`electron-vite` + `electron-builder`) around the exact
static output of `apps/web`, plus a bundled ffmpeg and the ability to run LibreOffice, Calibre,
Ghostscript, and Pandoc when they are installed. It is where every `native`-tier conversion runs:
on the user's own machine, with no server.

See "Stage 2 — Electron desktop app" in
[`docs/00-high-level-design.md`](../../docs/00-high-level-design.md).
