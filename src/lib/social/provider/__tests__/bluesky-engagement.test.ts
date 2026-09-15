import { describe, expect, it, vi } from 'vitest'
import {
  BLUESKY_APPVIEW_HOST,
  BLUESKY_GET_POSTS_BATCH,
  BlueskyEngagementProvider,
} from '../bluesky-engagement'
import { totalEngagement } from '../types'

const NOW = new Date('2026-09-15T08:00:00Z')

function uri(n: number): string {
  return `at://did:plc:abc/app.bsky.feed.post/p${n}`
}

function postView(n: number, counts: Record<string, unknown> = {}) {
  return {
    uri: uri(n),
    cid: `cid-${n}`,
    likeCount: 1,
    repostCount: 2,
    replyCount: 3,
    quoteCount: 4,
    ...counts,
  }
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  })
}

function provider(fetchImpl: typeof fetch) {
  return new BlueskyEngagementProvider({
    fetch: fetchImpl,
    now: () => NOW,
  })
}

/** Every `uris` value the fake fetch was asked for, call by call. */
function urisPerCall(fetchMock: ReturnType<typeof vi.fn>): string[][] {
  return fetchMock.mock.calls.map(([url]) =>
    new URL(String(url)).searchParams.getAll('uris'),
  )
}

describe('BlueskyEngagementProvider — the request', () => {
  it('reads the PUBLIC AppView with no credential of any kind', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ posts: [postView(1)] }))
    await provider(fetchMock).engagement([uri(1)])

    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ]
    expect(url).toMatch(
      new RegExp(
        `^${BLUESKY_APPVIEW_HOST}/xrpc/app\\.bsky\\.feed\\.getPosts\\?`,
      ),
    )
    expect(new URL(url).searchParams.getAll('uris')).toEqual([uri(1)])
    expect(init.method ?? 'GET').toBe('GET')
    expect(JSON.stringify(init.headers ?? {})).not.toContain('Authorization')
  })

  it('makes no request at all for an empty or blank input', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ posts: [] }))
    expect(await provider(fetchMock).engagement([])).toEqual({
      ok: true,
      counts: new Map(),
      missing: [],
    })
    expect(await provider(fetchMock).engagement(['  '])).toEqual({
      ok: true,
      counts: new Map(),
      missing: [],
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('batches at the lexicon ceiling and unions the batches', async () => {
    const all = Array.from({ length: BLUESKY_GET_POSTS_BATCH + 3 }, (_, i) =>
      uri(i),
    )
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const asked = new URL(String(url)).searchParams.getAll('uris')
      return jsonResponse({
        posts: asked.map((u) => ({
          ...postView(0),
          uri: u,
        })),
      })
    })
    const result = await provider(
      fetchMock as unknown as typeof fetch,
    ).engagement(all)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const calls = urisPerCall(fetchMock)
    expect(calls[0]).toHaveLength(BLUESKY_GET_POSTS_BATCH)
    expect(calls[1]).toHaveLength(3)
    expect(calls.flat()).toEqual(all)
    expect(result.ok && result.counts.size).toBe(all.length)
  })

  it('asks for each distinct uri once', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ posts: [postView(1)] }))
    await provider(fetchMock).engagement([uri(1), uri(1), uri(1)])
    expect(urisPerCall(fetchMock)).toEqual([[uri(1)]])
  })
})

describe('BlueskyEngagementProvider — unknown is null, never zero', () => {
  it('reads the four counters onto the post', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ posts: [postView(1)] }))
    const result = await provider(fetchMock).engagement([uri(1)])
    expect(result.ok && result.counts.get(uri(1))).toEqual({
      likes: 1,
      reposts: 2,
      replies: 3,
      quotes: 4,
    })
  })

  it('leaves an OMITTED counter null rather than defaulting it to 0', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        posts: [
          {
            uri: uri(1),
            cid: 'c',
            likeCount: 5,
            // repostCount / replyCount absent, quoteCount explicitly null
            quoteCount: null,
          },
        ],
      }),
    )
    const result = await provider(fetchMock).engagement([uri(1)])
    expect(result.ok && result.counts.get(uri(1))).toEqual({
      likes: 5,
      reposts: null,
      replies: null,
      quotes: null,
    })
  })

  it('reports a post the AppView did not return as missing, not as zero', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ posts: [postView(1)] }))
    const result = await provider(fetchMock).engagement([uri(1), uri(2)])
    expect(result).toMatchObject({ ok: true, missing: [uri(2)] })
    expect(result.ok && result.counts.has(uri(2))).toBe(false)
  })

  it('accepts a genuine zero as a zero', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        posts: [
          postView(1, {
            likeCount: 0,
            repostCount: 0,
            replyCount: 0,
            quoteCount: 0,
          }),
        ],
      }),
    )
    const result = await provider(fetchMock).engagement([uri(1)])
    expect(result.ok && result.counts.get(uri(1))).toEqual({
      likes: 0,
      reposts: 0,
      replies: 0,
      quotes: 0,
    })
  })
})

describe('BlueskyEngagementProvider — failures are typed, never thrown', () => {
  it('classifies 429 and carries retry-after', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response('slow down', {
          status: 429,
          headers: { 'retry-after': '30' },
        }),
    )
    expect(await provider(fetchMock).engagement([uri(1)])).toEqual({
      ok: false,
      kind: 'rate-limited',
      message: 'Bluesky getPosts returned 429: slow down',
      retryAfter: new Date(NOW.getTime() + 30_000),
    })
  })

  it('classifies 5xx as transient, 4xx as rejected, a network error as transient', async () => {
    const server = vi.fn(async () => new Response('boom', { status: 502 }))
    expect(await provider(server).engagement([uri(1)])).toMatchObject({
      ok: false,
      kind: 'transient',
    })

    const bad = vi.fn(async () => new Response('nope', { status: 400 }))
    expect(await provider(bad).engagement([uri(1)])).toMatchObject({
      ok: false,
      kind: 'rejected',
    })

    const offline = vi.fn(async () => {
      throw new TypeError('fetch failed')
    })
    expect(
      await provider(offline as unknown as typeof fetch).engagement([uri(1)]),
    ).toMatchObject({ ok: false, kind: 'transient' })
  })

  it('refuses a body that is not the shape it understands', async () => {
    const notJson = vi.fn(async () => new Response('<html>', { status: 200 }))
    expect(await provider(notJson).engagement([uri(1)])).toMatchObject({
      ok: false,
      kind: 'malformed',
      message: 'Bluesky getPosts returned non-JSON',
    })

    const noPosts = vi.fn(async () => jsonResponse({ ok: true }))
    expect(await provider(noPosts).engagement([uri(1)])).toMatchObject({
      ok: false,
      kind: 'malformed',
      message: 'Bluesky getPosts response has no posts array',
    })

    const negative = vi.fn(async () =>
      jsonResponse({ posts: [postView(1, { likeCount: -1 })] }),
    )
    expect(await provider(negative).engagement([uri(1)])).toMatchObject({
      ok: false,
      kind: 'malformed',
      message: 'Bluesky getPosts response post 0 has a non-count likeCount: -1',
    })
  })

  it('stops when the sweep runs out of budget rather than outlasting the cron', async () => {
    const all = Array.from({ length: BLUESKY_GET_POSTS_BATCH * 3 }, (_, i) =>
      uri(i),
    )
    // The clock jumps 40 s per reading, so the 60 s budget is spent after the
    // first batch and the second is never attempted.
    let ticks = 0
    const clock = () => new Date(NOW.getTime() + 40_000 * ticks++)
    const fetchMock = vi.fn(async () => jsonResponse({ posts: [postView(0)] }))
    const provider = new BlueskyEngagementProvider({
      fetch: fetchMock as unknown as typeof fetch,
      now: clock,
    })

    const result = await provider.engagement(all)
    expect(result).toMatchObject({ ok: false, kind: 'transient' })
    expect(result.ok === false && result.message).toContain('budget')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('cuts each call’s own timeout down to what is LEFT of the budget', async () => {
    // A batch that starts just inside the budget must not then run on for its
    // full per-call timeout: the deadline is a deadline, not a pre-check.
    //
    // An EXPLICIT reading sequence rather than a clock that advances on every
    // call: the deadline is armed at NOW, and every reading after it is NOW +
    // 40 s. A runaway clock would drive the remaining budget to zero and make
    // the assertion below pass without the cap ever being applied.
    const readings = [NOW, new Date(NOW.getTime() + 40_000)]
    let reading = 0
    const timeouts: number[] = []
    const spy = vi
      .spyOn(AbortSignal, 'timeout')
      .mockImplementation((ms: number) => {
        timeouts.push(ms)
        return new AbortController().signal
      })
    const fetchMock = vi.fn(async () => jsonResponse({ posts: [postView(0)] }))
    const provider = new BlueskyEngagementProvider({
      fetch: fetchMock as unknown as typeof fetch,
      now: () => readings[Math.min(reading++, readings.length - 1)],
      sweepBudgetMs: 45_000,
      timeoutMs: 15_000,
    })

    await provider.engagement([uri(0)])
    // Budget 45 s with 40 s gone: EXACTLY 5 s left, not the 15 s per-call cap.
    expect(timeouts).toEqual([5_000])
    spy.mockRestore()
  })

  it('never asks for a NEGATIVE timeout once the budget is spent', async () => {
    const timeouts: number[] = []
    const spy = vi
      .spyOn(AbortSignal, 'timeout')
      .mockImplementation((ms: number) => {
        timeouts.push(ms)
        return new AbortController().signal
      })
    const fetchMock = vi.fn(async () => jsonResponse({ posts: [postView(0)] }))
    // First reading arms the deadline, the second is already 50 s past it.
    const readings = [NOW, new Date(NOW.getTime() + 50_000)]
    let i = 0
    const provider = new BlueskyEngagementProvider({
      fetch: fetchMock as unknown as typeof fetch,
      now: () => readings[Math.min(i++, readings.length - 1)],
      sweepBudgetMs: 45_000,
      timeoutMs: 15_000,
    })

    const result = await provider.engagement([uri(0)])
    // The pre-check catches it before any request is made.
    expect(result).toMatchObject({ ok: false, kind: 'transient' })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(timeouts.every((ms) => ms >= 0)).toBe(true)
    spy.mockRestore()
  })

  it('fails the WHOLE sweep when one batch fails, so half a Campaign never reads as quiet', async () => {
    const all = Array.from({ length: BLUESKY_GET_POSTS_BATCH + 1 }, (_, i) =>
      uri(i),
    )
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ posts: [postView(0)] }))
      .mockResolvedValueOnce(new Response('down', { status: 503 }))
    expect(
      await provider(fetchMock as unknown as typeof fetch).engagement(all),
    ).toMatchObject({ ok: false, kind: 'transient' })
  })
})

describe('totalEngagement', () => {
  it('sums the known counters across posts', () => {
    expect(
      totalEngagement([
        { likes: 1, reposts: 2, replies: 3, quotes: 4 },
        { likes: 10, reposts: 0, replies: 0, quotes: 0 },
      ]),
    ).toBe(20)
  })

  it('is null only when NOTHING is known, and ignores unknown parts otherwise', () => {
    expect(totalEngagement([])).toBeNull()
    expect(totalEngagement([null, undefined])).toBeNull()
    expect(
      totalEngagement([
        { likes: null, reposts: null, replies: null, quotes: null },
      ]),
    ).toBeNull()
    expect(
      totalEngagement([
        { likes: null, reposts: 2, replies: null, quotes: null },
        null,
      ]),
    ).toBe(2)
  })

  it('keeps a true zero distinct from unknown', () => {
    expect(
      totalEngagement([{ likes: 0, reposts: 0, replies: 0, quotes: 0 }]),
    ).toBe(0)
  })
})
