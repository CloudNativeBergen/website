import { describe, it, expect, vi } from 'vitest'
import {
  getSocialPublishAdapter,
  isSocialPlatform,
  linkCardHostsFor,
  resolveSocialConnections,
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

/**
 * CONNECTION VISIBILITY (#1130, spec §4): whether each platform is automatic
 * or manual for the organization, DERIVED from its secrets through the very
 * factory the cron uses — never stored, and never carrying a secret.
 */
describe('resolveSocialConnections (#1130)', () => {
  const buffer = { apiKey: 'SECRET-KEY', linkedinChannelId: 'SECRET-CHANNEL' }
  const bluesky = { identifier: 'cndn.bsky.social', appPassword: 'SECRET-PW' }
  const lookup =
    (bags: Record<string, object | null>) =>
    async (_org: string, family: string) =>
      bags[family] ?? null
  const modeOf = (
    rows: Awaited<ReturnType<typeof resolveSocialConnections>>,
    platform: SocialPlatform,
  ) => rows.find((r) => r.platform === platform)

  it('a full buffer bag makes LinkedIn automatic VIA Buffer; the rest stay manual', async () => {
    const rows = await resolveSocialConnections('org-1', lookup({ buffer }))
    expect(modeOf(rows, 'linkedin')).toEqual({
      platform: 'linkedin',
      mode: 'automatic',
      via: 'buffer',
    })
    expect(modeOf(rows, 'bluesky')).toEqual({
      platform: 'bluesky',
      mode: 'manual',
      via: null,
    })
    // A platform with no connection family is always by hand: not listed.
    expect(rows.map((r) => r.platform)).toEqual(['linkedin', 'bluesky'])
  })

  it.each([
    ['an api key without the pinned channel', { apiKey: 'k' }],
    ['a pinned channel without the api key', { linkedinChannelId: 'c' }],
    ['empty strings', { apiKey: '', linkedinChannelId: '' }],
  ])(
    'a HALF-filled buffer bag (%s — the JSON-blob path allows it) reads MANUAL, as the cron treats it',
    async (_label, bag) => {
      const rows = await resolveSocialConnections(
        'org-1',
        lookup({ buffer: bag }),
      )
      expect(modeOf(rows, 'linkedin')).toEqual({
        platform: 'linkedin',
        mode: 'manual',
        via: null,
      })
    },
  )

  it('a direct connection (Bluesky) is automatic with no intermediary', async () => {
    const rows = await resolveSocialConnections('org-1', lookup({ bluesky }))
    expect(modeOf(rows, 'bluesky')).toEqual({
      platform: 'bluesky',
      mode: 'automatic',
      via: null,
    })
  })

  it('NEVER carries a secret, whatever the bag holds', async () => {
    const rows = await resolveSocialConnections(
      'org-1',
      lookup({ buffer, bluesky }),
    )
    const wire = JSON.stringify(rows)
    for (const secret of ['SECRET-KEY', 'SECRET-CHANNEL', 'SECRET-PW'])
      expect(wire).not.toContain(secret)
    for (const row of rows)
      expect(Object.keys(row).sort()).toEqual(['mode', 'platform', 'via'])
  })

  it('asks the lookup for THIS organization only, and no organization is all manual without a lookup', async () => {
    const secrets = vi.fn(lookup({ buffer }))
    await resolveSocialConnections('org-1', secrets)
    expect(new Set(secrets.mock.calls.map(([org]) => org))).toEqual(
      new Set(['org-1']),
    )

    const none = vi.fn(lookup({ buffer }))
    const rows = await resolveSocialConnections(null, none)
    expect(none).not.toHaveBeenCalled()
    expect(rows.every((r) => r.mode === 'manual')).toBe(true)
  })

  it('an indeterminate lookup THROWS rather than claiming manual', async () => {
    await expect(
      resolveSocialConnections('org-1', async () => {
        throw new Error('store unreachable')
      }),
    ).rejects.toThrow('store unreachable')
  })
})
