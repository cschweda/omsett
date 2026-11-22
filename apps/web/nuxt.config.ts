const isolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

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
    prerender: { routes: ['/', '/about', '/technical', '/whats-new', '/status'] },
  },

  // Production headers and policies come from security-headers.ts via scripts/write-headers.ts.
  // The dev server only needs cross-origin isolation, so threads work while developing. Both
  // halves are needed: Nitro serves the page, Vite serves the scripts, and a worker script is
  // refused by an isolated page unless its own response carries the embedder policy too.
  $development: {
    routeRules: { '/**': { headers: isolation } },
    vite: { server: { headers: isolation } },
  },

  runtimeConfig: {
    public: {
      siteUrl: 'https://omsett.com',
      commit: process.env.COMMIT_REF?.slice(0, 7) ?? 'dev',
    },
  },

  // Fonts are self-hosted from public/fonts; nothing is fetched from a font service.
  ui: { fonts: false },
  // Follows the device. Where the device does not say, ink on paper: the Swiss default.
  colorMode: { preference: 'system', fallback: 'light' },
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
      rollupOptions: { output: { entryFileNames: '_nuxt/workers/[name]-[hash].js' } },
    },
    optimizeDeps: { exclude: ['wasm-vips'] },
  },
})
