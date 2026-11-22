# apps/cli — reserved for `npx omsett` (Phase 3)

Nothing is built here yet.

The CLI will be the registry and the engines running in Node, with no UI: the same
`@omsett/registry` router and the same `@omsett/engines` code the web app uses, called
in-process. Browser-tier engines run as WASM in Node; native-tier engines are found on `PATH`.

See "Stage 3 — CLI" in [`docs/00-high-level-design.md`](../../docs/00-high-level-design.md).
