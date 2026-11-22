// Limits that keep a hostile or broken file from tying the app up: how long work may take,
// and how many files are taken at once.

/** Thrown when work was stopped for taking too long. */
export class TimedOut extends Error {
  constructor() {
    super('Stopped for taking too long')
    this.name = 'TimedOut'
  }
}

/**
 * Settles with `work`, or rejects with TimedOut after `ms`. `onTimeout` runs first and must
 * actually stop the work (terminate its worker): a promise cannot be cancelled, only abandoned.
 */
export function withTimeout<T>(work: Promise<T>, ms: number, onTimeout: () => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      onTimeout()
      reject(new TimedOut())
    }, ms)
    work.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

const SECOND = 1000
/**
 * How long one conversion step may run: 30 seconds, plus 3 for every megapixel, and never more
 * than 10 minutes. Generous on purpose. A 169-megapixel image converts in about 5 seconds, so
 * anything that reaches this limit is stuck, not slow.
 */
export function conversionBudgetMs(pixels: number): number {
  return Math.min(10 * 60 * SECOND, 30 * SECOND + Math.ceil(pixels / 1_000_000) * 3 * SECOND)
}

/** How long decoding a picture for its preview may take. */
export const PREVIEW_BUDGET_MS = 20 * SECOND

/** The most files taken in one session. More than this is a mistake or an attack. */
export const MAX_FILES = 100

/**
 * A setting read from the address bar, for the test suite: `?engine=vips`, `?timeout=50`.
 * Honored only when the app is served from this machine. On a public address a link carrying
 * one of these could make conversions fail for whoever opened it, so there they are ignored.
 */
export function testHook(name: string, location: Pick<Location, 'hostname' | 'search'>): string | null {
  const local = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(location.hostname)
  return local ? new URLSearchParams(location.search).get(name) : null
}
