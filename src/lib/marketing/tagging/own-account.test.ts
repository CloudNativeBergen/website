/** @vitest-environment node */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/conference/konf-api', async (orig) => ({
  ...(await orig<object>()),
  rolloutFlags: (await import('../../../../__tests__/helpers/rolloutFlags'))
    .fakeRolloutFlags,
}))
import { flagTenants } from '../../../../__tests__/helpers/rolloutFlags'

vi.mock('next/cache', () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }))

const fetchMock = vi.fn()
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: {
    fetch: (...args: unknown[]) => fetchMock(...args),
  },
}))

import { ownBlueskyAccount } from './own-account'

describe('ownBlueskyAccount D1 gateway values and fallbacks (#1997)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  const sanityConf = {
    _id: 'conf-a',
    domains: ['2026.example.com'],
    organization: { _ref: 'org-1' },
    socialLinks: ['https://bsky.app/profile/sanity.bsky.social'],
  }

  it('uses merged D1 socialLinks when tenant is flagged and D1 value differs', async () => {
    vi.stubEnv('KONF_API_URL', 'https://api.example.com')
    flagTenants('apiRead', 'conf-a')
    fetchMock.mockResolvedValue(structuredClone(sanityConf))

    const gatewayFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            conference: {
              id: 'conf-a',
              socialLinks: ['https://bsky.app/profile/d1.bsky.social'],
            },
          },
        }),
      ),
    )
    vi.stubGlobal('fetch', gatewayFetch)

    const handle = await ownBlueskyAccount('conf-a')
    expect(handle).toBe('d1.bsky.social')
  })

  it('falls back to Sanity socialLinks when tenant is unflagged', async () => {
    vi.stubEnv('KONF_API_URL', 'https://api.example.com')
    flagTenants('apiRead', 'other-conf')
    fetchMock.mockResolvedValue(structuredClone(sanityConf))

    const gatewayFetch = vi.fn()
    vi.stubGlobal('fetch', gatewayFetch)

    const handle = await ownBlueskyAccount('conf-a')
    expect(gatewayFetch).not.toHaveBeenCalled()
    expect(handle).toBe('sanity.bsky.social')
  })

  it('falls back to Sanity socialLinks on gateway error', async () => {
    vi.stubEnv('KONF_API_URL', 'https://api.example.com')
    flagTenants('apiRead', 'conf-a')
    fetchMock.mockResolvedValue(structuredClone(sanityConf))

    const gatewayFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ errors: [{ message: 'D1 error' }] }), {
        status: 500,
      }),
    )
    vi.stubGlobal('fetch', gatewayFetch)

    const handle = await ownBlueskyAccount('conf-a')
    expect(handle).toBe('sanity.bsky.social')
  })
})
