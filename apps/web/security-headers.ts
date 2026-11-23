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
// Both carry `connect-src 'self' blob:`. Do not widen it. It is what stops a worker, where
// the engines and every file reader run, from sending anything anywhere: a worker has no other
// way out. For the page it stops every request a script can make and read, but not all ways
// out: a page can still be sent to another address, and a policy cannot forbid that. So the
// page is kept to the project's own code and its pinned build dependencies. No third party's
// script is ever loaded into it, analytics included (see app/utils/visits.ts).

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
        // Once a browser has seen this over HTTPS, it refuses plain HTTP to this site for a
        // year, so a network in the middle cannot quietly downgrade a later visit. Ignored on
        // http://localhost. Subdomains are left out on purpose: they are not this build's to bind.
        'Strict-Transport-Security': 'max-age=31536000',
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

// --- What the site's own server passes on -----------------------------------------------------
//
// Two things may leave a copy of Omsett, and both go by way of its own server, so that the page
// itself never asks another site for anything: a count of visits, and a file a person has
// asked to have checked for accessibility. Neither exists unless the build is told of it. The
// rules for nginx are written here, with the headers, so that setting a copy up is a matter of
// naming the two things and deploying, and no rule is ever typed by hand.

export interface Forwarding {
  /** The site's name as Plausible knows it ("omsett.com"); empty for a copy that counts nothing. */
  visitsSite: string
  /** The accessibility checker's site ("https://audit.icjia.app"); empty for a copy with none. */
  checker: string
}

const HOST = /^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/i

/** The lines every forwarding rule shares: the far end is checked, and nothing of the visitor's but their address goes. */
const passOn = (host: string) => [
  `    proxy_set_header Host ${host};`,
  '    proxy_ssl_server_name on;',
  `    proxy_ssl_name ${host};`,
  '    proxy_ssl_verify on;',
  '    proxy_ssl_trusted_certificate /etc/ssl/certs/ca-certificates.crt;',
  '    proxy_set_header X-Forwarded-For $remote_addr;',
  '    proxy_set_header X-Forwarded-Proto $scheme;',
  '    proxy_set_header Cookie "";',
  '    proxy_set_header Authorization "";',
  '    proxy_http_version 1.1;',
]

/** nginx locations for what this copy passes on. Empty for a copy that passes on nothing. */
export function forwardingRules({ visitsSite, checker }: Forwarding): string {
  const out: string[] = []
  if (HOST.test(visitsSite)) {
    out.push(
      '# Counting visits: one small report that a page was opened, passed on to Plausible, which',
      "# is told the visitor's address so that it counts people and not requests. It does not keep it.",
      'location = /api/event {',
      '    limit_except POST { deny all; }',
      '    client_max_body_size 2k;',
      '    proxy_pass https://plausible.io/api/event;',
      ...passOn('plausible.io'),
      '}',
    )
  }
  const site = /^https:\/\/([^/]+)$/.exec(checker)?.[1]
  if (site !== undefined && HOST.test(site)) {
    const rule = (path: string, method: string, lines: string[]) => [
      `location = /api/accessibility/${path} {`,
      `    limit_except ${method} { deny all; }`,
      ...lines,
      `    proxy_pass https://${site}/api/${path};`,
      '    proxy_set_header Origin "";',
      ...passOn(site),
      '}',
    ]
    out.push(
      ...(out.length > 0 ? [''] : []),
      '# The accessibility checker. Only a file a visitor has asked to send arrives here.',
      ...rule('health', 'GET', []),
      ...rule('analyze', 'POST', ['    client_max_body_size 26m;', '    proxy_read_timeout 180s;', '    proxy_request_buffering off;']),
      ...rule('reports', 'POST', ['    client_max_body_size 4m;']),
    )
  }
  return out.join('\n')
}
