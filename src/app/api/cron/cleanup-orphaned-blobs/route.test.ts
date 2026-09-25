/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ list: vi.fn(), cleanup: vi.fn() }))
vi.mock('@vercel/blob', () => ({ list: h.list }))
vi.mock('@/lib/attachment/blob', () => ({ cleanupOrphanedBlob: h.cleanup }))
vi.mock('next/cache', () => ({ unstable_noStore: vi.fn() }))

import { GET } from './route'

const DAY = 24 * 60 * 60 * 1000
const blob = (pathname: string, ageMs: number) => ({
  url: `https://abc.public.blob.vercel-storage.com/${pathname}`,
  pathname,
  uploadedAt: new Date(Date.now() - ageMs),
})
const STORE = [
  blob('proposal-p1-1-slides.pdf', 2 * DAY),
  blob('marketing-asset/org-A/1790000000000-logo.png', 2 * DAY),
  blob('marketing-asset/org-B/1790000000000-fresh.png', 60 * 1000),
  blob('something-else.png', 2 * DAY),
]

function request() {
  return new Request('http://localhost/api/cron/cleanup-orphaned-blobs', {
    headers: { authorization: 'Bearer secret' },
  }) as unknown as Parameters<typeof GET>[0]
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('CRON_SECRET', 'secret')
  h.list.mockImplementation(async ({ prefix }: { prefix: string }) => ({
    blobs: STORE.filter((b) => b.pathname.startsWith(prefix)),
  }))
  h.cleanup.mockResolvedValue(true)
})

describe('the orphaned blob sweeper', () => {
  it('sweeps abandoned marketing asset uploads as well as proposal ones', async () => {
    const response = await GET(request())
    expect(response.status).toBe(200)
    const swept = h.cleanup.mock.calls.map(([url]) => url)
    expect(swept.sort()).toEqual(
      [
        STORE[1].url, // marketing asset, 2 days old
        STORE[0].url, // proposal, 2 days old
      ].sort(),
    )
  })

  it('leaves an upload younger than the retention window alone', async () => {
    await GET(request())
    expect(h.cleanup).not.toHaveBeenCalledWith(STORE[2].url)
  })

  it('never lists outside its two prefixes', async () => {
    await GET(request())
    const prefixes = h.list.mock.calls.map(([options]) => options.prefix)
    expect(prefixes.sort()).toEqual(['marketing-asset/', 'proposal-'])
  })

  it('follows list() pages, so a busy prefix is swept past its first page', async () => {
    const old = blob('marketing-asset/org-A/1790000000000-late.png', 2 * DAY)
    h.list.mockImplementation(
      async ({ prefix, cursor }: { prefix: string; cursor?: string }) =>
        prefix !== 'marketing-asset/'
          ? { blobs: [], hasMore: false }
          : cursor === 'page-2'
            ? { blobs: [old], hasMore: false }
            : { blobs: [STORE[1]], hasMore: true, cursor: 'page-2' },
    )
    await GET(request())
    expect(h.cleanup).toHaveBeenCalledWith(old.url)
    expect(h.cleanup).toHaveBeenCalledWith(STORE[1].url)
  })

  it('still sweeps proposal uploads when the marketing prefix cannot be listed', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    h.list.mockImplementation(async ({ prefix }: { prefix: string }) => {
      if (prefix === 'marketing-asset/') throw new Error('blob list down')
      return { blobs: [STORE[0]], hasMore: false }
    })
    await GET(request())
    expect(h.cleanup.mock.calls).toEqual([[STORE[0].url]])
  })

  it('fails loudly when no prefix can be listed, instead of reporting nothing to clean', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    h.list.mockRejectedValue(new Error('blob list down'))
    const response = await GET(request())
    expect(response.status).toBe(500)
    expect(h.cleanup).not.toHaveBeenCalled()
  })

  it('names a prefix it could not list, while still sweeping the others', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    h.list.mockImplementation(async ({ prefix }: { prefix: string }) => {
      if (prefix === 'marketing-asset/') throw new Error('blob list down')
      return { blobs: [], hasMore: false }
    })
    const body = await (await GET(request())).json()
    expect(body.unlisted).toEqual(['marketing-asset/'])
  })

  it('deletes a large backlog in bounded batches, not all at once', async () => {
    const backlog = Array.from({ length: 120 }, (_, i) =>
      blob(`marketing-asset/org-A/1790000000000-old-${i}.png`, 2 * DAY),
    )
    h.list.mockImplementation(async ({ prefix }: { prefix: string }) => ({
      blobs: prefix === 'marketing-asset/' ? backlog : [],
      hasMore: false,
    }))
    let inFlight = 0
    let most = 0
    h.cleanup.mockImplementation(async () => {
      inFlight++
      most = Math.max(most, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 1))
      inFlight--
      return true
    })
    const body = await (await GET(request())).json()
    expect(body.cleaned).toBe(120)
    expect(most).toBeLessThanOrEqual(25)
  })

  it('still refuses without the cron secret', async () => {
    const unauthorized = new Request(
      'http://localhost/x',
    ) as unknown as Parameters<typeof GET>[0]
    expect((await GET(unauthorized)).status).toBe(401)
    expect(h.list).not.toHaveBeenCalled()
  })
})
