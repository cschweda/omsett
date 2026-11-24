// LAME's loader, and nothing else of the package it comes in. Imported whole, that package
// brings a second copy of LAME and an Ogg encoder inside its script, three quarters of a
// megabyte that would never run: the binary used here is the one fetched and verified.
export { createEncoder } from 'wasm-media-encoders'
