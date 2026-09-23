import { describe, it, expect, vi } from 'vitest'
import {
  getSocialPublishAdapter,
  isSocialPlatform,
  linkCardHostsFor,
  resolveSocialCredentials,
  resolveSocialPublishAdapter,
} from '../provider'
import { BlueskyPublishAdapter } from '../provider/bluesky'
import { BufferPublishAdapter } from '../provider/buffer'
import { makeVariant } from './memory-store'

// The domain-verification gate the resolver consults for link-card hosts;
// spied so a test can see whether dispatch paid for it at all.
const routable = vi.hoisted(() => vi.fn(async () => true))
vi.mock('@/lib/domain-verification/routing', () => ({
  isHostRoutable: routable,
}))
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

  it('no secret, or a platform with no connection family, is manual', async () => {
    await expect(
      resolveSocialCredentials('org-1', 'bluesky', async () => null),
    ).resolves.toBeNull()
    const secrets = vi.fn(async () => secret)
    await expect(
      resolveSocialCredentials('org-1', 'x', secrets),
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

describe('LinkedIn through Buffer (#1129)', () => {
  const bag = { apiKey: 'buffer-key', linkedinChannelId: 'channel-1' }
  const linkedin = () => ({
    ...makeVariant({ platform: 'linkedin' }),
    conferenceDomains: [],
  })

  it('an organization with a full buffer bag is connected: the tick gets a Buffer adapter for LinkedIn', async () => {
    const secrets = vi.fn(async () => bag)
    const adapter = await resolveSocialPublishAdapter(linkedin(), secrets)
    expect(secrets).toHaveBeenCalledTimes(1)
    expect(secrets).toHaveBeenCalledWith(makeVariant().orgId, 'buffer')
    expect(adapter).toBeInstanceOf(BufferPublishAdapter)
    expect(adapter?.platform).toBe('linkedin')
    expect(adapter?.constraints.linkPlacement).toBe('comment')
    expect(typeof adapter?.confirm).toBe('function')
  })

  it.each([
    ['no buffer secret', null],
    ['an api key without the pinned channel', { apiKey: 'buffer-key' }],
    [
      'a pinned channel without the api key',
      { linkedinChannelId: 'channel-1' },
    ],
    ['empty strings', { apiKey: '', linkedinChannelId: '' }],
  ])('%s is manual: the tick gets null', async (_label, found) => {
    const secrets = vi.fn(async () => found)
    await expect(
      resolveSocialPublishAdapter(linkedin(), secrets),
    ).resolves.toBeNull()
    expect(secrets).toHaveBeenCalledWith(makeVariant().orgId, 'buffer')
  })

  it('LinkedIn never pays for link-card host checks; Bluesky, which builds cards, does', async () => {
    routable.mockClear()
    const domains = ['cloudnativedays.no']
    const li = await resolveSocialPublishAdapter(
      { ...makeVariant({ platform: 'linkedin' }), conferenceDomains: domains },
      async () => bag,
    )
    expect(li).toBeInstanceOf(BufferPublishAdapter)
    expect(routable).not.toHaveBeenCalled()

    const bsky = await resolveSocialPublishAdapter(
      { ...makeVariant({ platform: 'bluesky' }), conferenceDomains: domains },
      async () => ({ identifier: 'cndn.bsky.social', appPassword: 'x' }),
    )
    expect(bsky).toBeInstanceOf(BlueskyPublishAdapter)
    expect(routable).toHaveBeenCalledWith('cloudnativedays.no', domains)
  })

  it('the factory never builds LinkedIn from an empty bag any more', () => {
    expect(getSocialPublishAdapter('linkedin', {})).toBeNull()
  })
})
