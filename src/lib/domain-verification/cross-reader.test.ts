/**
 * #2207 phase 6: routing and the OAuth redirect guard read ONE source and
 * cannot disagree. Real routing.ts, allowlist.ts, redirect-proxy-guard.ts and
 * source.ts; only the transports are faked. For every D1 state: a host the
 * guard sends a code to is a host routing serves, a missing row refuses both,
 * and neither reader falls back to the other store.
 *
 * Not covered by design: the guard trusts the whole platform zone without a
 * lookup (see redirect-proxy-guard.ts), so platform hosts are out of scope
 * here; routing still requires their row.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sanityFetch = vi.hoisted(() => vi.fn())
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: sanityFetch },
  clientWrite: {},
}))
vi.mock('@/lib/konf-api/client', () => ({
  konfApiUrl: () => 'https://api.test/graphql',
  konfApiHeaders: async () => ({}),
}))

import { isAllowedBounceTarget } from '@/lib/auth/redirect-proxy-guard'
import { isHostRoutable } from './routing'
import { clearMissCache } from './source'

const NOW = Date.parse('2026-11-10T12:00:00.000Z')
const HOST = 'conf.example.com'
const DAY = 86_400_000
const iso = (ms: number) => new Date(ms).toISOString()

const base = {
  hostname: HOST,
  conferenceId: 'conf-1',
  method: 'dns-txt',
  token: 'tok',
  verifiedAt: iso(NOW - 30 * DAY),
  lastSuccessAt: iso(NOW - DAY),
  lastCheckedAt: null,
  firstFailureAt: null,
  graceUntil: null,
  consecutiveFailures: 0,
  consecutiveSoftFailures: 0,
  lastError: null,
}
const STATES: [string, Record<string, unknown> | null][] = [
  ['verified', { ...base, status: 'verified' }],
  ['pending', { ...base, status: 'pending', verifiedAt: null }],
  [
    'failing, in grace',
    {
      ...base,
      status: 'failing',
      firstFailureAt: iso(NOW - DAY),
      consecutiveFailures: 1,
    },
  ],
  [
    'failing, past grace',
    {
      ...base,
      status: 'failing',
      firstFailureAt: iso(NOW - 60 * DAY),
      consecutiveFailures: 9,
    },
  ],
  ['revoked', { ...base, status: 'revoked' }],
  ['missing', null],
]

let rows: Record<string, unknown>[] = []
const gateway = vi.fn(async (_url: string, init: { body: string }) => {
  const { h, s } = JSON.parse(init.body).variables
  const hits = rows.filter(
    (r) => (h == null || r.hostname === h) && (s == null || r.status === s),
  )
  return new Response(JSON.stringify({ data: { siteDomainRecords: hits } }))
})

const env = {
  NODE_ENV: 'production',
  PLATFORM_DOMAIN_SUFFIX: 'konf.run',
} as unknown as NodeJS.ProcessEnv

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
  clearMissCache()
  vi.stubGlobal('fetch', gateway)
  sanityFetch.mockRejectedValue(new Error('Sanity must not be read'))
  vi.stubEnv('DOMAIN_VERIFICATION_SOURCE', 'd1')
  vi.stubEnv('DOMAIN_VERIFICATION_D1_HOST', 'dir.example.com')
  vi.stubEnv('KONF_SITE_SIGNING_KEY', '{}')
  vi.stubEnv('DOMAIN_VERIFICATION_ENFORCE_ROUTING', 'true')
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('routing and the redirect guard on DOMAIN_VERIFICATION_SOURCE=d1', () => {
  it.each(STATES)('%s: a guard-allowed host is routable', async (_, r) => {
    rows = r ? [r] : []
    const routes = await isHostRoutable(HOST, [HOST], new Date(NOW))
    const bounces = await isAllowedBounceTarget(
      `https://${HOST}/api/auth/callback/github`,
      env,
    )
    if (bounces) expect(routes).toBe(true)
    if (!r) expect([routes, bounces]).toEqual([false, false])
    expect(sanityFetch).not.toHaveBeenCalled()
  })

  it('a verified row passes both; the same row revoked fails both', async () => {
    rows = [{ ...base, status: 'verified' }]
    const cb = `https://${HOST}/api/auth/callback/github`
    expect(await isHostRoutable(HOST, [HOST], new Date(NOW))).toBe(true)
    expect(await isAllowedBounceTarget(cb, env)).toBe(true)
    rows = [{ ...base, status: 'revoked' }]
    clearMissCache() // a revocation lands after the 60 s hit TTL
    expect(await isHostRoutable(HOST, [HOST], new Date(NOW))).toBe(false)
    expect(await isAllowedBounceTarget(cb, env)).toBe(false)
  })

  it('a failing gateway refuses both (fail closed)', async () => {
    gateway.mockImplementationOnce(
      async () => new Response('', { status: 503 }),
    )
    gateway.mockImplementationOnce(
      async () => new Response('', { status: 503 }),
    )
    await expect(isHostRoutable(HOST, [HOST], new Date(NOW))).rejects.toThrow()
    expect(
      await isAllowedBounceTarget(
        `https://${HOST}/api/auth/callback/github`,
        env,
      ),
    ).toBe(false)
  })

  it('on sanity, neither reader calls the gateway', async () => {
    vi.stubEnv('DOMAIN_VERIFICATION_SOURCE', 'sanity')
    sanityFetch.mockResolvedValue(null)
    expect(await isHostRoutable(HOST, [HOST], new Date(NOW))).toBe(false)
    sanityFetch.mockResolvedValue([])
    expect(
      await isAllowedBounceTarget(
        `https://${HOST}/api/auth/callback/github`,
        env,
      ),
    ).toBe(false)
    expect(gateway).not.toHaveBeenCalled()
  })
})
