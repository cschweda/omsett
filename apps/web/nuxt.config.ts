import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** The top of Pandoc's package, found from its main file, wherever in the package that is. */
function pandocRoot(): string {
  let at = dirname(createRequire(fileURLToPath(new URL('../../packages/engines/package.json', import.meta.url))).resolve('pandoc-wasm'))
  while (!existsSync(join(at, 'package.json'))) at = dirname(at)
  return at
}
const isolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

// The checker omsett.com uses, read from site.env for the development server only. A build
// (`pnpm build`, the tests, the self-host image) is told nothing unless its environment says so.
function checkerFromSiteSettings(): string {
  try {
    const line = readFileSync(new URL('../../site.env', import.meta.url), 'utf8').split('\n').find((text) => text.startsWith('OMSETT_ACCESSIBILITY_CHECKER='))
    const value = line?.slice(line.indexOf('=') + 1).trim() ?? ''
    return /^https:\/\/[a-z0-9][a-z0-9.-]*[a-z0-9]$/i.test(value) ? value : ''
  } catch {
    return ''
  }
}
const devChecker = process.env.OMSETT_ACCESSIBILITY_CHECKER ?? checkerFromSiteSettings()

export default defineNuxtConfig({
  compatibilityDate: '2026-11-01',
  ssr: false,
  devtools: { enabled: false },
  telemetry: false,
  modules: ['@nuxt/ui'],
  css: ['~/assets/css/main.css'],

  // Each page is written out as its own index.html, so a plain file server can answer for it.
  nitro: {
    preset: 'static',
    prerender: { routes: ['/', '/about', '/technical', '/whats-new', '/security', '/settings', '/traps', '/trust', '/status'] },
  },

  // Production headers and policies come from security-headers.ts via scripts/write-headers.ts.
  // The dev server only needs cross-origin isolation, so threads work while developing. Both
  // halves are needed: Nitro serves the page, Vite serves the scripts, and a worker script is
  // refused by an isolated page unless its own response carries the embedder policy too.
  $development: {
    routeRules: { '/**': { headers: isolation } },
    // `.local` lets another device on the network reach the dev server by this machine's name
    // (pnpm dev:lan); by IP address it is allowed anyway.
    vite: { server: { headers: isolation, allowedHosts: ['.local'] } },
    // While developing, the accessibility checker named in site.env is offered as it is on the
    // site, and reached the same way: through this server, which passes it on. (Visits are
    // never counted here: they are counted only on the site that is named.)
    ...(devChecker
      ? {
          runtimeConfig: { public: { accessibilityChecker: devChecker } },
          nitro: {
            devProxy: Object.fromEntries(
              ['health', 'analyze', 'reports'].map((path) => [
                `/api/accessibility/${path}`,
                { target: `${devChecker}/api/${path}`, changeOrigin: true, headers: { origin: '', cookie: '' } },
              ]),
            ),
          },
        }
      : {}),
  },

  runtimeConfig: {
    public: {
      siteUrl: 'https://omsett.com',
      commit: process.env.COMMIT_REF?.slice(0, 7) ?? 'dev',
      // Counting visits is off unless the build is told the site's name as Plausible knows it
      // (OMSETT_VISITS_SITE=omsett.com). See docs/deploy-digitalocean.md.
      visitsSite: process.env.OMSETT_VISITS_SITE ?? '',
      // Checking a document's accessibility is off unless the build names the checker's site
      // (OMSETT_ACCESSIBILITY_CHECKER=https://audit.icjia.app). See docs/deploy-digitalocean.md.
      accessibilityChecker: process.env.OMSETT_ACCESSIBILITY_CHECKER ?? '',
      visitsEndpoint: '/api/event',
    },
  },

  // Fonts are self-hosted from public/fonts; nothing is fetched from a font service.
  ui: { fonts: false },
  // Dark is the default on every page. Light is there for whoever prefers it, and the choice
  // is remembered.
  colorMode: { preference: 'dark', fallback: 'dark' },
  // Icons are bundled; the app never calls the Iconify API.
  icon: { provider: 'none', fallbackToApi: false, clientBundle: { scan: true } },

  app: {
    head: {
      htmlAttrs: { lang: 'en' },
      title: 'Omsett',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: 'Drop a file. Pick a format. Nothing leaves your device.' },
        { name: 'theme-color', content: '#0d0d0d' },
        { property: 'og:title', content: 'Omsett — open-source file converter' },
        { property: 'og:description', content: 'Drop a file. Pick a format. Nothing leaves your device.' },
        { property: 'og:image', content: 'https://omsett.com/og.png' },
        { property: 'og:image:width', content: '1200' },
        { property: 'og:image:height', content: '630' },
        { name: 'twitter:card', content: 'summary_large_image' },
      ],
      link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
    },
  },

  vite: {
    worker: {
      format: 'es',
      // Workers get their own directory, because that path carries the worker policy
      // (see security-headers.ts). scripts/write-headers.ts fails the build if one strays.
      rollupOptions: {
        output: {
          entryFileNames: '_nuxt/workers/[name]-[hash].js',
          // The PDF reader's parsing half is a file its makers call "pdf.worker". Here it is not
          // a worker of its own: it is loaded into the engine worker and runs there. It is named
          // for what it is, so that the check for stray worker scripts stays exact.
          chunkFileNames: (chunk) => (chunk.name.includes('pdf.worker') ? '_nuxt/pdf-parser-[hash].js' : '_nuxt/[name]-[hash].js'),
        },
      },
    },
    optimizeDeps: { exclude: ['wasm-vips'] },
    resolve: {
      alias: {
        // The Markdown parser decodes "&amp;" and its kind with this package, whose build for
        // browsers asks the page to do it (document.createElement). Engines run in a worker,
        // where there is no page, so the plain build is used everywhere.
        // Pandoc's own loader, which starts it from bytes it is given and fetches nothing. The
        // package's browser entry fetches the binary itself, past the check every engine is given.
        'pandoc-wasm/core': join(pandocRoot(), 'src', 'core.js'),
        'decode-named-character-reference': fileURLToPath(
          new URL('./node_modules/decode-named-character-reference/index.js', import.meta.url),
        ),
      },
    },
  },
})
