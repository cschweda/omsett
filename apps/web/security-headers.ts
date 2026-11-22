// The one definition of every security policy the site ships. scripts/write-headers.ts turns
// this into a <meta> tag in each HTML file, Netlify's _headers file, and a Caddy snippet, so the
// hosts cannot drift.
//
// There are two Content-Security-Policies, because a page and a worker are governed separately:
// a worker is bound by the policy on its own script's response, not by the page's.
//
//   documentPolicy  travels inside the HTML as <meta http-equiv>. It applies wherever the files
//                   are hosted and whatever URL served them. No eval of any kind.
//   workerPolicy    is a response header on worker scripts only. It adds 'unsafe-eval', which
//                   libvips's bindings (embind) need to build their call wrappers, and nothing
//                   else. It must never be sent with a document.
//
// Both carry `connect-src 'self' blob:`. That directive is what the privacy promise rests on:
// neither the page nor a worker can send anything to another origin, whatever a dependency
// tries. Do not widen it.

export interface HeaderRule {
  /** Netlify-style path pattern: '/*' or '/engines/*' */
  path: string
  headers: Record<string, string>
}

type Directives = Array<[name: string, values: string[]]>

const serialize = (directives: Directives) =>
  directives.map(([name, values]) => `${name} ${values.join(' ')}`).join('; ')

/** @param scriptHashes hash sources ('sha256-…') for the inline scripts in the built HTML. */
export function documentPolicy(scriptHashes: string[]): string {
  return serialize([
    ['default-src', ["'self'"]],
    ['script-src', ["'self'", ...scriptHashes.map((h) => `'${h}'`)]],
    ['worker-src', ["'self'", 'blob:']],
    ['connect-src', ["'self'", 'blob:']],
    ['img-src', ["'self'", 'blob:', 'data:']],
    ['style-src', ["'self'", "'unsafe-inline'"]],
    ['font-src', ["'self'"]],
    ['object-src', ["'none'"]],
    ['base-uri', ["'self'"]],
    ['form-action', ["'none'"]],
  ])
}

export function workerPolicy(): string {
  return serialize([
    ['default-src', ["'self'"]],
    ['script-src', ["'self'", "'wasm-unsafe-eval'", "'unsafe-eval'"]],
    ['worker-src', ["'self'", 'blob:']],
    ['connect-src', ["'self'", 'blob:']],
  ])
}

/**
 * Every path a worker's top-level script can be served from. The Vite config emits workers
 * under the first; engines that start their own thread workers live under the second.
 */
export const WORKER_PATHS = ['/_nuxt/workers/*', '/engines/*']

export function securityHeaders(): HeaderRule[] {
  return [
    {
      path: '/*',
      headers: {
        // Both are required for SharedArrayBuffer, which multi-threaded WASM needs.
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
        // frame-ancestors cannot be set from a <meta> policy, so framing is refused here.
        'X-Frame-Options': 'DENY',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      },
    },
    ...WORKER_PATHS.map((path) => ({ path, headers: { 'Content-Security-Policy': workerPolicy() } })),
    {
      path: '/engines/*',
      headers: {
        // File names carry a content hash, so they never change.
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Cross-Origin-Resource-Policy': 'same-origin',
      },
    },
  ]
}
