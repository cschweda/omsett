// A small static server for the built site that applies the generated Netlify `_headers` file,
// so tests run against the same header set production gets. Missing paths fall back to
// index.html, as the netlify.toml redirect does.
import { createReadStream } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { dirname, extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'web', '.output', 'public')
const port = Number(process.env.PORT ?? 4173)

const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
}

interface Rule {
  prefix: string
  headers: Array<[string, string]>
}

async function loadRules(): Promise<Rule[]> {
  const text = await readFile(join(root, '_headers'), 'utf8')
  const rules: Rule[] = []
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    if (!/^\s/.test(line)) {
      rules.push({ prefix: line.trim().replace(/\*$/, ''), headers: [] })
    } else {
      const separator = line.indexOf(':')
      rules.at(-1)?.headers.push([line.slice(0, separator).trim(), line.slice(separator + 1).trim()])
    }
  }
  return rules
}

const rules = await loadRules()

createServer(async (request, response) => {
  const path = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname)
  for (const rule of rules) {
    if (path.startsWith(rule.prefix)) for (const [name, value] of rule.headers) response.setHeader(name, value)
  }
  let file = normalize(join(root, path))
  if (!file.startsWith(root)) {
    response.writeHead(403).end()
    return
  }
  const found = await stat(file).catch(() => null)
  if (found?.isDirectory()) file = join(file, 'index.html')
  else if (!found) file = join(root, 'index.html')
  response.setHeader('Content-Type', types[extname(file)] ?? 'application/octet-stream')
  createReadStream(file)
    .on('error', () => response.writeHead(500).end())
    .pipe(response)
}).listen(port, () => console.log(`omsett static build on http://localhost:${port}`))
