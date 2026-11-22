// Runs after `nuxt generate`. Hashes the inline scripts in the built HTML, writes the document
// policy into each HTML file as a <meta> tag, and writes the response headers from
// security-headers.ts in the two formats the two hosts read.
import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { documentPolicy, securityHeaders, WORKER_PATHS } from '../security-headers.ts'

const web = join(dirname(fileURLToPath(import.meta.url)), '..')
const output = join(web, '.output')
const publicDir = join(output, 'public')

// Data blocks are not executed, so CSP does not ask for a hash.
const DATA_TYPES = /type\s*=\s*["']?(?:application\/json|application\/ld\+json)/i
const INLINE_SCRIPT = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi
const POLICY_META = /<meta http-equiv="Content-Security-Policy"[^>]*>/i

const pages = (await readdir(publicDir)).filter((name) => name.endsWith('.html'))
const sources = new Map<string, string>()
const hashes = new Set<string>()
for (const name of pages) {
  const html = (await readFile(join(publicDir, name), 'utf8')).replace(POLICY_META, '')
  sources.set(name, html)
  for (const [, attributes = '', body = ''] of html.matchAll(INLINE_SCRIPT)) {
    if (/\bsrc\s*=/.test(attributes) || DATA_TYPES.test(attributes) || body.length === 0) continue
    hashes.add(`sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}`)
  }
}

// The policy goes at the top of <head>, ahead of every script it governs.
const meta = `<meta http-equiv="Content-Security-Policy" content="${documentPolicy([...hashes].sort())}">`
for (const [name, html] of sources) {
  // After the charset declaration (which must stay in the first bytes), before everything else.
  const anchor = /<meta charset=[^>]*>/i.test(html) ? /<meta charset=[^>]*>/i : /<head[^>]*>/i
  if (!anchor.test(html)) throw new Error(`${name} has no <head> to carry the policy`)
  await writeFile(join(publicDir, name), html.replace(anchor, (tag) => tag + meta))
}

// Every worker script must be served from a path that carries the worker policy. A worker
// outside those paths would run with no policy at all, so the build fails instead.
const workerDir = join(publicDir, '_nuxt', 'workers')
const workers = await readdir(workerDir).catch(() => [] as string[])
if (workers.length === 0) throw new Error(`No worker scripts found in ${workerDir}`)
const stray = (await readdir(join(publicDir, '_nuxt'))).filter((name) => /\.worker[-.]/.test(name))
if (stray.length) throw new Error(`Worker scripts outside ${WORKER_PATHS[0]}: ${stray.join(', ')}`)

const rules = securityHeaders()

// Netlify: https://docs.netlify.com/routing/headers/
const netlify = rules
  .map((rule) => [rule.path, ...Object.entries(rule.headers).map(([k, v]) => `  ${k}: ${v}`)].join('\n'))
  .join('\n\n')
await writeFile(join(publicDir, '_headers'), netlify + '\n')

// Caddy: imported by apps/web/Caddyfile.
const caddy = rules
  .map((rule, index) => {
    const lines = Object.entries(rule.headers).map(([k, v]) => `\t${k} "${v.replaceAll('"', '\\"')}"`)
    if (rule.path === '/*') return `header {\n${lines.join('\n')}\n}`
    return `@rule${index} path ${rule.path}\nheader @rule${index} {\n${lines.join('\n')}\n}`
  })
  .join('\n\n')
await writeFile(join(output, 'headers.caddy'), caddy + '\n')

console.log(
  `write-headers: ${pages.length} pages, ${hashes.size} inline script hash(es), ${workers.length} worker file(s), ${rules.length} rules`,
)
