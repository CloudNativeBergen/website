import { describe, expect, it, vi, beforeEach } from 'vitest'

const revalidateTag = vi.fn()
vi.mock('next/cache', () => ({
  revalidateTag: (...args: unknown[]) => revalidateTag(...args),
}))

import { expireShortLink, expireShortLinks } from './short-link-cache'
import { shortLinkTag } from '@/lib/cache/tags'

beforeEach(() => vi.clearAllMocks())

describe('expireShortLink — EXPIRE, never serve stale (spec §2.5)', () => {
  it('revalidates the per-document tag with expire 0', () => {
    expireShortLink('socialPostVariant.v1')
    expect(revalidateTag).toHaveBeenCalledWith(
      shortLinkTag('socialPostVariant.v1'),
      { expire: 0 },
    )
  })

  it('does NOT use a cache-life profile, which would serve the old target', () => {
    // `revalidateTag(tag, 'default')` — the form used elsewhere in this repo —
    // keeps serving stale content while it revalidates. A repaired or deleted
    // destination cannot tolerate that window, so this fails on that VALUE.
    expireShortLink('marketingTask.t1')
    const [, profile] = revalidateTag.mock.calls[0]
    expect(profile).not.toBe('default')
    expect(profile).not.toBe('max')
    expect(profile).toEqual({ expire: 0 })
  })

  it('tags per DOCUMENT, so one repair does not discard every other code', () => {
    expireShortLink('marketingTask.t1')
    const [tag] = revalidateTag.mock.calls[0]
    expect(tag).toContain('marketingTask.t1')
    expect(tag).not.toContain('conference')
  })
})

describe('expireShortLinks — per Task inside a chunked delete (spec §2.5)', () => {
  it('expires EVERY id it is given, one call each', () => {
    expireShortLinks(['marketingTask.a', 'socialPostVariant.b'])
    expect(revalidateTag.mock.calls.map((c) => c[0])).toEqual([
      shortLinkTag('marketingTask.a'),
      shortLinkTag('socialPostVariant.b'),
    ])
    for (const [, profile] of revalidateTag.mock.calls) {
      expect(profile).toEqual({ expire: 0 })
    }
  })

  it('does nothing for an empty tree', () => {
    expireShortLinks([])
    expect(revalidateTag).not.toHaveBeenCalled()
  })
})
