import { describe, expect, it, vi } from 'vitest'
import { checkServerHealth } from '../app/utils/server-health'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('checkServerHealth', () => {
  it('is absent, with no further fetch, when config says there is no server', async () => {
    const fetcher = vi.fn(async (_url: string, _init?: RequestInit) => json({ server: false }))
    await expect(checkServerHealth(fetcher)).resolves.toEqual({ state: 'absent', engines: [], maxBytes: null })
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher.mock.calls[0]![0]).toBe('/config.json')
  })

  it('is absent when config.json is missing or unreadable', async () => {
    await expect(checkServerHealth(async () => new Response('nope', { status: 404 }))).resolves.toMatchObject({
      state: 'absent',
    })
    await expect(
      checkServerHealth(async () => {
        throw new TypeError('network')
      }),
    ).resolves.toMatchObject({ state: 'absent' })
  })

  it('is unreachable after the timeout, without throwing', async () => {
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/config.json') return json({ server: true })
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal!.reason))
      })
    })
    const started = Date.now()
    await expect(checkServerHealth(fetcher, 50)).resolves.toEqual({
      state: 'unreachable',
      engines: [],
      maxBytes: null,
    })
    expect(Date.now() - started).toBeLessThan(2000)
  })

  it('is unreachable when the answer is not a health document', async () => {
    const html = async (url: string) =>
      url === '/config.json' ? json({ server: true }) : new Response('<!doctype html>', { status: 200 })
    await expect(checkServerHealth(html)).resolves.toMatchObject({ state: 'unreachable' })
  })

  it('is reachable with parsed engines and maxBytes', async () => {
    const fetcher = vi.fn(async (url: string, _init?: RequestInit) =>
      url === '/config.json'
        ? json({ server: true })
        : json({ ok: true, version: '0.4.0', engines: ['ffmpeg', 'soffice'], maxBytes: 2147483648 }),
    )
    await expect(checkServerHealth(fetcher)).resolves.toEqual({
      state: 'reachable',
      engines: ['ffmpeg', 'soffice'],
      maxBytes: 2147483648,
    })
    expect(fetcher.mock.calls.map((c) => c[0])).toEqual(['/config.json', '/api/health'])
    expect(fetcher.mock.calls.every((c) => c[1]?.body === undefined)).toBe(true)
  })
})
