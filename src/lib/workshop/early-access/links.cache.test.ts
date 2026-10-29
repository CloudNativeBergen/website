/**
 * @vitest-environment node
 *
 * Expiring the cached early-access links (#1346, spec §7), and the cache
 * profile against Next's REAL validator: a profile Next rejects throws inside
 * the cached function, which no test that mocks `next/cache` could see.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { validateAndNormalizeCacheLifeProfile } from 'next/dist/server/use-cache/cache-life-profile.js'

const revalidateTag = vi.fn()
vi.mock('next/cache', () => ({
  revalidateTag: (...args: unknown[]) => revalidateTag(...args),
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}))
vi.mock('@/lib/sanity/client', () => ({}))

import { earlyAccessLinksTag } from '@/lib/cache/tags'
import { EARLY_ACCESS_LINKS_LIFE, expireEarlyAccessLinks } from './links'

beforeEach(() => vi.clearAllMocks())

describe('expireEarlyAccessLinks', () => {
  it('expires the tag of that conference at once, not with a profile', () => {
    expireEarlyAccessLinks('conf-a')

    expect(revalidateTag.mock.calls).toEqual([
      ['sanity:workshop-early-access-conf-a', { expire: 0 }],
    ])
    expect(earlyAccessLinksTag('conf-a')).toBe(
      'sanity:workshop-early-access-conf-a',
    )
  })

  it('never fails the write it follows', () => {
    revalidateTag.mockImplementationOnce(() => {
      throw new Error('Invariant: static generation store missing')
    })
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => expireEarlyAccessLinks('conf-a')).not.toThrow()
    expect(logged).toHaveBeenCalledTimes(1)
    logged.mockRestore()
  })
})

describe('the cache profile', () => {
  const validate = (profile: unknown) =>
    (
      validateAndNormalizeCacheLifeProfile as (
        p: unknown,
        c: { kind: string },
      ) => unknown
    )(profile, { kind: 'inline' })

  it('is one Next accepts', () => {
    expect(() => validate({ ...EARLY_ACCESS_LINKS_LIFE })).not.toThrow()
  })

  it('the validator does reject a profile that expires before it revalidates', () => {
    expect(() => validate({ revalidate: 100, expire: 50 })).toThrow(
      /expire option must be greater/,
    )
  })
})
