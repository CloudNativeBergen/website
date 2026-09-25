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
  blob('marketing-asset-org-A-1790000000000-logo.png', 2 * DAY),
  blob('marketing-asset-org-B-1790000000000-fresh.png', 60 * 1000),
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
    expect(prefixes.sort()).toEqual(['marketing-asset-', 'proposal-'])
  })

  it('still refuses without the cron secret', async () => {
    const unauthorized = new Request(
      'http://localhost/x',
    ) as unknown as Parameters<typeof GET>[0]
    expect((await GET(unauthorized)).status).toBe(401)
    expect(h.list).not.toHaveBeenCalled()
  })
})
