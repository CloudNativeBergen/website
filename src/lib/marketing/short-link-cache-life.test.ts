/**
 * The short-link cache profiles against Next's REAL validator.
 *
 * `short-link.test.ts` mocks `next/cache`, so it proves which profile is
 * chosen and nothing about whether Next would accept it — and a profile Next
 * rejects throws inside the cached function, which would turn every
 * `/go/<code>` hit into a 500 that no mocked test could see. This file
 * therefore imports the real implementation and mocks nothing.
 */
import { describe, expect, it } from 'vitest'
import { validateAndNormalizeCacheLifeProfile } from 'next/dist/server/use-cache/cache-life-profile.js'
import { SHORT_LINK_HIT_LIFE, SHORT_LINK_MISS_LIFE } from './short-link'

const validate = (profile: unknown) =>
  (
    validateAndNormalizeCacheLifeProfile as (
      p: unknown,
      c: { kind: string },
    ) => unknown
  )(profile, { kind: 'inline' })

describe('the cache profiles Next actually accepts', () => {
  it.each([
    ['SHORT_LINK_HIT_LIFE', SHORT_LINK_HIT_LIFE],
    ['SHORT_LINK_MISS_LIFE', SHORT_LINK_MISS_LIFE],
  ])('%s is a profile Next accepts', (_name, profile) => {
    expect(() => validate({ ...profile })).not.toThrow()
  })

  it('the validator really does reject revalidate > expire', () => {
    // Without this, the assertions above could pass because the validator
    // checks nothing. Next requires expire >= revalidate — NOT strictly
    // greater, which is why the hit profile may set them equal.
    expect(() => validate({ revalidate: 100, expire: 50 })).toThrow(
      /expire option must be greater/,
    )
    expect(() => validate({ revalidate: 100, expire: 100 })).not.toThrow()
  })

  it('keeps expire at least revalidate on both profiles', () => {
    for (const profile of [SHORT_LINK_HIT_LIFE, SHORT_LINK_MISS_LIFE]) {
      expect(profile.expire).toBeGreaterThanOrEqual(profile.revalidate)
    }
  })
})
