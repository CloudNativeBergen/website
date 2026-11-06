/** @vitest-environment node */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/conference/konf-api', async (orig) => ({
  ...(await orig<object>()),
  rolloutFlags: (await import('../../../__tests__/helpers/rolloutFlags'))
    .fakeRolloutFlags,
}))
import { flagTenants } from '../../../__tests__/helpers/rolloutFlags'

vi.mock('next/cache', () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }))

const fetchMock = vi.fn()
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: (...args: unknown[]) => fetchMock(...args) },
}))

import { getSigningContract } from './sanity'

describe('getSigningContract D1 gateway values and fallbacks (#1997)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  const sanityContract = {
    _id: 'sfc-1',
    signatureStatus: 'pending',
    signatureId: 'token-123',
    signerEmail: 'sponsor@example.com',
    conference: {
      _id: 'conf-1',
      title: 'Sanity Conference Title',
      city: 'Sanity City',
      startDate: '2026-08-01',
      domains: ['signing.example.com'],
      organization: { _ref: 'org-1' },
    },
  }

  it('uses merged D1 conference fields when flagged and value differs', async () => {
    vi.stubEnv('KONF_API_URL', 'https://api.example.com')
    flagTenants('apiRead', 'conf-1')
    fetchMock.mockResolvedValue(structuredClone(sanityContract))

    const gatewayFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            conference: {
              id: 'conf-1',
              title: 'D1 Conference Title',
              city: 'D1 City',
              startDate: '2026-08-10',
            },
          },
        }),
      ),
    )
    vi.stubGlobal('fetch', gatewayFetch)

    const contract = await getSigningContract('token-123')
    expect(contract).not.toBeNull()
    expect(contract?.conference?.title).toBe('D1 Conference Title')
    expect(contract?.conference?.city).toBe('D1 City')
    expect(contract?.conference?.startDate).toBe('2026-08-10')
  })

  it('falls back to Sanity conference fields when unflagged', async () => {
    vi.stubEnv('KONF_API_URL', 'https://api.example.com')
    flagTenants('apiRead', 'other-conf')
    fetchMock.mockResolvedValue(structuredClone(sanityContract))

    const gatewayFetch = vi.fn()
    vi.stubGlobal('fetch', gatewayFetch)

    const contract = await getSigningContract('token-123')
    expect(gatewayFetch).not.toHaveBeenCalled()
    expect(contract?.conference?.title).toBe('Sanity Conference Title')
    expect(contract?.conference?.city).toBe('Sanity City')
    expect(contract?.conference?.startDate).toBe('2026-08-01')
  })

  it('falls back to Sanity conference fields on gateway error', async () => {
    vi.stubEnv('KONF_API_URL', 'https://api.example.com')
    flagTenants('apiRead', 'conf-1')
    fetchMock.mockResolvedValue(structuredClone(sanityContract))

    const gatewayFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ errors: [{ message: 'D1 error' }] }), {
        status: 500,
      }),
    )
    vi.stubGlobal('fetch', gatewayFetch)

    const contract = await getSigningContract('token-123')
    expect(contract?.conference?.title).toBe('Sanity Conference Title')
    expect(contract?.conference?.city).toBe('Sanity City')
    expect(contract?.conference?.startDate).toBe('2026-08-01')
  })
})
