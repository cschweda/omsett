import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { conversionBudgetMs, testHook, TimedOut, withTimeout } from '../app/utils/limits'

describe('withTimeout', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('passes a result through and never calls the stop function', async () => {
    const stop = vi.fn()
    await expect(withTimeout(Promise.resolve('done'), 1000, stop)).resolves.toBe('done')
    vi.advanceTimersByTime(5000)
    expect(stop).not.toHaveBeenCalled()
  })

  it('passes a failure through unchanged', async () => {
    const failure = new Error('bad file')
    await expect(withTimeout(Promise.reject(failure), 1000, () => {})).rejects.toBe(failure)
  })

  it('stops work that never finishes, and says so', async () => {
    const stop = vi.fn()
    const stuck = withTimeout(new Promise(() => {}), 1000, stop)
    const outcome = expect(stuck).rejects.toBeInstanceOf(TimedOut)
    vi.advanceTimersByTime(999)
    expect(stop).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(stop).toHaveBeenCalledTimes(1)
    await outcome
  })
})

describe('conversionBudgetMs', () => {
  it('starts at 30 seconds, grows with the picture, and stops at 10 minutes', () => {
    expect(conversionBudgetMs(0)).toBe(30_000)
    expect(conversionBudgetMs(1_000_000)).toBe(33_000)
    expect(conversionBudgetMs(64_000_000)).toBe(222_000)
    expect(conversionBudgetMs(10_000_000_000)).toBe(600_000)
    // What has no pixels is given time by its size: a second for every two megabytes.
    expect(conversionBudgetMs(0, 1)).toBe(31_000)
    expect(conversionBudgetMs(0, 100_000_000)).toBe(80_000)
    expect(conversionBudgetMs(1_000_000, 4_000_000)).toBe(35_000)
    expect(conversionBudgetMs(0, 500 * 1024 * 1024)).toBe(293_000)
    expect(conversionBudgetMs(0, 5_000_000_000)).toBe(600_000)
  })
})

describe('testHook', () => {
  it('is honored on this machine', () => {
    expect(testHook('engine', { hostname: 'localhost', search: '?engine=vips' })).toBe('vips')
    expect(testHook('timeout', { hostname: '127.0.0.1', search: '?timeout=50' })).toBe('50')
    expect(testHook('engine', { hostname: 'localhost', search: '' })).toBeNull()
  })

  it('is ignored on any public address', () => {
    expect(testHook('engine', { hostname: 'omsett.com', search: '?engine=bogus' })).toBeNull()
    expect(testHook('timeout', { hostname: 'localhost.evil.example', search: '?timeout=1' })).toBeNull()
  })
})
