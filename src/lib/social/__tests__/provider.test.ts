import { describe, it, expect } from 'vitest'
import {
  getSocialPublishAdapter,
  isSocialPlatform,
  resolveSocialPublishAdapter,
} from '../provider'
import { makeVariant } from './memory-store'
import type { SocialPlatform } from '../types'

describe('adapter factory and resolver — hardened against stored values', () => {
  it.each(['constructor', 'toString', '__proto__', 'hasOwnProperty'])(
    'never resolves the inherited property %s as an adapter factory',
    (name) => {
      expect(
        getSocialPublishAdapter(name as unknown as SocialPlatform, {}),
      ).toBeNull()
    },
  )

  it('treats a variant with a malformed platform as manual', async () => {
    const variant = makeVariant({
      platform: 'constructor' as unknown as SocialPlatform,
    })
    await expect(resolveSocialPublishAdapter(variant)).resolves.toBeNull()
  })

  it('treats a variant with no resolvable organization as manual', async () => {
    await expect(
      resolveSocialPublishAdapter(makeVariant({ orgId: null })),
    ).resolves.toBeNull()
  })

  it('isSocialPlatform accepts only the registry vocabulary', () => {
    expect(isSocialPlatform('bluesky')).toBe(true)
    expect(isSocialPlatform('Bluesky')).toBe(false)
    expect(isSocialPlatform('constructor')).toBe(false)
    expect(isSocialPlatform(undefined)).toBe(false)
  })
})
