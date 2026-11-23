// Overflow fuzzing. For every format that is bytes and not text, the sound sample is damaged a
// few hundred ways (fixtures/_tools/fuzz-variants.ts): each size, count and offset in its header
// set to nothing, to the most its field holds, and to either side of where a signed number turns
// negative; the file cut short; stretches of it inverted. These are the values that overflow a
// reader written in C, which is what the picture engines are.
//
// Each damaged file must end one of four ways: not recognised, refused by the size guard,
// refused by the engine, or converted to a real file of the format asked for. Never a result
// that is not what it claims to be, and never a conversion that does not come back.
//
// The work is done in a process of its own, watched from here, because a conversion that never
// returns can only be stopped from outside. In a browser the same job is done by the time limit
// on every conversion, which ends the worker.
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { formatById, registry } from '@omsett/registry'
import { describe, expect, it } from 'vitest'

/** Formats that are text are attacked by the trap files, where what matters is what the text says. */
const TEXT = new Set(['data', 'subtitle', 'text', 'screenplay'])
/** Except the few in those kinds that are ZIPs underneath. */
const BINARY_DATA = ['xlsx', 'drafter']
/** A conversion that has not come back in this long is counted as never coming back. */
const HANG_MS = 45_000

const formats = [...new Set(registry.capabilities.flatMap((capability) => capability.reads))]
  .map((id) => formatById(registry, id)!)
  .filter((format) => format && (!TEXT.has(format.category) || BINARY_DATA.includes(format.id)))

interface Line {
  start?: number
  what?: string
  end?: number
  outcome?: string
  dead?: number
  done?: number
}

/** Run the child from `first`, and return its lines once it stops, is stopped, or dies. */
async function run(format: string, first: number, log: string): Promise<{ lines: Line[]; hung: boolean }> {
  const child = spawn('pnpm', ['exec', 'vitest', 'run'], {
    env: { ...process.env, OMSETT_FUZZ_FORMAT: format, OMSETT_FUZZ_FIRST: String(first), OMSETT_FUZZ_LOG: log },
    stdio: 'ignore',
  })
  const read = async (): Promise<Line[]> =>
    (await readFile(log, 'utf8').catch(() => ''))
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Line)
  let hung = false
  let seen = -1
  let quietSince = Date.now()
  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()))
  const watch = setInterval(() => {
    void read().then((lines) => {
      if (lines.length !== seen) {
        seen = lines.length
        quietSince = Date.now()
      } else if (Date.now() - quietSince > HANG_MS) {
        hung = true
        child.kill('SIGKILL')
      }
    })
  }, 1000)
  await exited
  clearInterval(watch)
  return { lines: await read(), hung }
}

describe('overflow fuzzing', () => {
  it('covers every format that is not text', () => {
    expect(formats.length).toBeGreaterThan(25)
  })

  for (const format of formats) {
    it.concurrent(
      `${format.name}: every damaged file is refused or converts to a real file`,
      async () => {
        const dir = await mkdtemp(join(tmpdir(), 'omsett-fuzz-'))
        const log = join(dir, `${format.id}.jsonl`)
        const hangs: string[] = []
        const killers: number[] = []
        try {
          // Run to the end, starting again past anything that stopped the run.
          for (let first = 0, rounds = 0; rounds < 30; rounds++) {
            const { lines, hung } = await run(format.id, first, log)
            if (lines.some((line) => line.done !== undefined)) break
            const started = lines.findLast((line) => line.start !== undefined)
            const dead = lines.findLast((line) => line.dead !== undefined)
            if (hung) hangs.push(`variant ${started?.start}: ${started?.what}`)
            else if (dead) killers.push(dead.dead!)
            else if (!started) throw new Error(`the fuzzer did not start for ${format.id}`)
            first = (hung || !dead ? (started?.start ?? first) : dead.dead!) + 1
          }
          const lines = (await readFile(log, 'utf8')).split('\n').filter(Boolean).map((line) => JSON.parse(line) as Line)
          const outcomes: Record<string, number> = {}
          for (const line of lines) if (line.outcome) outcomes[line.outcome] = (outcomes[line.outcome] ?? 0) + 1
          const total = lines.findLast((line) => line.done !== undefined)?.done
          console.log(`[fuzz] ${format.id}: ${total} variants ${JSON.stringify(outcomes)}${killers.length ? ` engine restarted ${killers.length}×` : ''}`)

          expect(total, 'the run finished').toBeGreaterThan(100)
          expect(hangs, 'a conversion never came back').toEqual([])
          // A result that is not the format asked for, or something thrown that is not an error.
          expect(Object.keys(outcomes).filter((outcome) => !['not-recognised', 'refused-by-size', 'refused', 'converted'].includes(outcome))).toEqual([])
          // An engine brought down by a damaged file is replaced, here as in a browser, where
          // every failed conversion starts the next on a fresh worker. It must stay rare.
          expect(killers.length, 'damaged files that took the engine down').toBeLessThanOrEqual(3)
        } finally {
          await rm(dir, { recursive: true, force: true })
        }
      },
      15 * 60_000,
    )
  }
})
