import { describe, it, expect, vi } from 'vitest'
import {
  getSocialPublishAdapter,
  isSocialPlatform,
  linkCardHostsFor,
  resolveSocialCredentials,
  resolveSocialPublishAdapter,
} from '../provider'
import { BlueskyPublishAdapter } from '../provider/bluesky'
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
    await expect(
      resolveSocialPublishAdapter({ ...variant, conferenceDomains: [] }),
    ).resolves.toBeNull()
  })

  it('treats a variant with no resolvable organization as manual', async () => {
    await expect(
      resolveSocialPublishAdapter({
        ...makeVariant({ orgId: null }),
        conferenceDomains: [],
      }),
    ).resolves.toBeNull()
  })

  it('isSocialPlatform accepts only the registry vocabulary', () => {
    expect(isSocialPlatform('bluesky')).toBe(true)
    expect(isSocialPlatform('Bluesky')).toBe(false)
    expect(isSocialPlatform('constructor')).toBe(false)
    expect(isSocialPlatform(undefined)).toBe(false)
  })
})

describe('the Bluesky connection (#1005)', () => {
  const secret = { identifier: 'cndn.bsky.social', appPassword: 'abcd-efgh' }

  it('an organization with a bluesky secret is connected: the tick gets a Bluesky adapter', async () => {
    const secrets = vi.fn(async () => secret)
    await expect(
      resolveSocialCredentials('org-1', 'bluesky', secrets),
    ).resolves.toEqual(secret)
    expect(secrets).toHaveBeenCalledWith('org-1', 'bluesky')

    const adapter = getSocialPublishAdapter('bluesky', secret)
    expect(adapter).toBeInstanceOf(BlueskyPublishAdapter)
    expect(adapter?.platform).toBe('bluesky')
  })

  it('no secret, or a platform with no adapter, is manual', async () => {
    await expect(
      resolveSocialCredentials('org-1', 'bluesky', async () => null),
    ).resolves.toBeNull()
    const secrets = vi.fn(async () => secret)
    await expect(
      resolveSocialCredentials('org-1', 'linkedin', secrets),
    ).resolves.toBeNull()
    expect(secrets).not.toHaveBeenCalled()
  })

  it('only domains the verification gate would route become link-card hosts', async () => {
    const domains = ['cloudnativedays.no', 'unverified.example']
    const gate = vi.fn(async (host: string) => host === 'cloudnativedays.no')
    await expect(linkCardHostsFor(domains, gate)).resolves.toEqual([
      'cloudnativedays.no',
    ])
    expect(gate).toHaveBeenCalledWith('cloudnativedays.no', domains)
    expect(gate).toHaveBeenCalledWith('unverified.example', domains)
  })

  it('a half-filled credential bag never reaches the adapter', () => {
    expect(getSocialPublishAdapter('bluesky', { identifier: 'x' })).toBeNull()
    expect(getSocialPublishAdapter('bluesky', {})).toBeNull()
  })
})
