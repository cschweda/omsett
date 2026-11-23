// How many tests there are, counted and not estimated, for the site's Trust page.
//
//     pnpm test && node scripts/count-tests.ts            write test-count.json
//     pnpm test && node scripts/count-tests.ts --check    fail if test-count.json is out of date
//
// The unit tests are counted from the report of a real run (`pnpm test` writes one), because
// most of them are made in loops, one for every trap and every conversion, and only running
// them says how many there are. The browser tests are counted by asking Playwright to list
// them. CI runs the check, so the figure on the site is always the figure of the last change.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const target = join(root, 'test-count.json')
const report = join(root, '.vitest-report', 'unit.json')

if (!existsSync(report)) {
  console.error('No .vitest-report/unit.json. Run `pnpm test` first: the unit tests are counted from a real run.')
  process.exit(2)
}
const unit = JSON.parse(readFileSync(report, 'utf8')) as { numTotalTests: number; numFailedTests: number; numTotalTestSuites: number; testResults: unknown[] }
if (unit.numFailedTests > 0) {
  console.error('The last unit run had failures. Tests are counted from a run that passed.')
  process.exit(2)
}

interface Suite { specs?: Array<{ tests: unknown[] }>; suites?: Suite[] }
const listed = JSON.parse(
  execFileSync('pnpm', ['exec', 'playwright', 'test', '--list', '--reporter=json'], { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }),
) as { suites: Suite[]; config: { projects: Array<{ name: string }> } }
const count = (suite: Suite): number =>
  (suite.specs ?? []).reduce((sum, spec) => sum + spec.tests.length, 0) + (suite.suites ?? []).reduce((sum, inner) => sum + count(inner), 0)

const counted = {
  unit: unit.numTotalTests,
  unitFiles: unit.testResults.length,
  browser: listed.suites.reduce((sum, suite) => sum + count(suite), 0),
  browsers: listed.config.projects.map((project) => project.name),
}
const written = `${JSON.stringify(counted, null, 2)}\n`

if (process.argv.includes('--check')) {
  const current = existsSync(target) ? readFileSync(target, 'utf8') : ''
  if (current !== written) {
    console.error(`test-count.json is out of date.\n  it says: ${current.replace(/\s+/g, ' ')}\n  counted: ${written.replace(/\s+/g, ' ')}\nRun \`pnpm test && pnpm tests:count\` and commit the file.`)
    process.exit(1)
  }
  console.log(`test-count.json is current: ${counted.unit} unit tests, ${counted.browser} browser tests.`)
} else {
  writeFileSync(target, written)
  console.log(`test-count.json: ${counted.unit} unit tests in ${counted.unitFiles} files, ${counted.browser} browser tests in ${counted.browsers.join(', ')}.`)
}
