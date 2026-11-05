/** @vitest-environment node */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/cache', () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }))

const fetchMock = vi.fn()
const scopedFetchMock = vi.fn()
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: (...args: unknown[]) => fetchMock(...args) },
  clientWrite: {},
}))
vi.mock('@/lib/sanity/scoped', () => ({
  scopedFetch: (...args: unknown[]) => scopedFetchMock(...args),
}))

import { getAllTravelSupport, getTravelSupportById } from './sanity'

describe('travelSupport D1 gateway values and fallbacks (#1997)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  const sanityDetail = {
    _id: 'ts-1',
    status: 'approved',
    bankingDetails: {
      beneficiaryName: 'Speaker One',
      bankName: 'Bank',
      iban: 'NO123',
      accountNumber: '123',
      swiftCode: 'SWIFT',
      streetAddress: 'Street 1',
      postalCode: '1234',
      city: 'Oslo',
      country: 'Norway',
      preferredCurrency: 'NOK',
    },
    speaker: { _id: 'sp-1', name: 'Speaker One', email: 'sp@example.com' },
    conference: {
      _id: 'conf-1',
      name: 'Sanity Conf Name',
      title: 'Sanity Conf Name',
      domains: ['travel.example.com'],
      organization: { _ref: 'org-1' },
    },
    conferenceOrgId: 'org-1',
    expenses: [],
  }

  it('getTravelSupportById uses merged D1 conference title/name when flagged and value differs', async () => {
    vi.stubEnv('KONF_API_URL', 'https://api.example.com')
    vi.stubEnv('KONF_API_TENANTS', 'conf-1')
    fetchMock.mockResolvedValue(structuredClone(sanityDetail))

    const gatewayFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            conference: {
              id: 'conf-1',
              title: 'D1 Conf Title',
            },
          },
        }),
      ),
    )
    vi.stubGlobal('fetch', gatewayFetch)

    const res = await getTravelSupportById('ts-1', {
      _id: 'sp-1',
      organizerOrgIds: ['org-1'],
    })
    expect(res.travelSupport).not.toBeNull()
    expect(res.travelSupport?.conference.name).toBe('D1 Conf Title')
  })

  it('getTravelSupportById falls back to Sanity conference name when unflagged', async () => {
    vi.stubEnv('KONF_API_URL', 'https://api.example.com')
    vi.stubEnv('KONF_API_TENANTS', 'other-conf')
    fetchMock.mockResolvedValue(structuredClone(sanityDetail))

    const gatewayFetch = vi.fn()
    vi.stubGlobal('fetch', gatewayFetch)

    const res = await getTravelSupportById('ts-1', {
      _id: 'sp-1',
      organizerOrgIds: ['org-1'],
    })
    expect(gatewayFetch).not.toHaveBeenCalled()
    expect(res.travelSupport?.conference.name).toBe('Sanity Conf Name')
  })

  it('getTravelSupportById falls back to Sanity conference name on gateway error', async () => {
    vi.stubEnv('KONF_API_URL', 'https://api.example.com')
    vi.stubEnv('KONF_API_TENANTS', 'conf-1')
    fetchMock.mockResolvedValue(structuredClone(sanityDetail))

    const gatewayFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ errors: [{ message: 'D1 error' }] }), {
        status: 500,
      }),
    )
    vi.stubGlobal('fetch', gatewayFetch)

    const res = await getTravelSupportById('ts-1', {
      _id: 'sp-1',
      organizerOrgIds: ['org-1'],
    })
    expect(res.travelSupport?.conference.name).toBe('Sanity Conf Name')
  })

  it('getAllTravelSupport uses merged D1 conference title/name when flagged and value differs', async () => {
    vi.stubEnv('KONF_API_URL', 'https://api.example.com')
    vi.stubEnv('KONF_API_TENANTS', 'conf-1')
    scopedFetchMock.mockResolvedValue([structuredClone(sanityDetail)])

    const gatewayFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            conference: {
              id: 'conf-1',
              title: 'D1 Conf Title',
            },
          },
        }),
      ),
    )
    vi.stubGlobal('fetch', gatewayFetch)

    const res = await getAllTravelSupport('conf-1')
    expect(res.travelSupports).toHaveLength(1)
    expect(res.travelSupports[0].conference.name).toBe('D1 Conf Title')
  })

  it('getAllTravelSupport falls back to Sanity conference name when unflagged', async () => {
    vi.stubEnv('KONF_API_URL', 'https://api.example.com')
    vi.stubEnv('KONF_API_TENANTS', 'other-conf')
    scopedFetchMock.mockResolvedValue([structuredClone(sanityDetail)])

    const gatewayFetch = vi.fn()
    vi.stubGlobal('fetch', gatewayFetch)

    const res = await getAllTravelSupport('conf-1')
    expect(gatewayFetch).not.toHaveBeenCalled()
    expect(res.travelSupports[0].conference.name).toBe('Sanity Conf Name')
  })

  it('getAllTravelSupport falls back to Sanity conference name on gateway error', async () => {
    vi.stubEnv('KONF_API_URL', 'https://api.example.com')
    vi.stubEnv('KONF_API_TENANTS', 'conf-1')
    scopedFetchMock.mockResolvedValue([structuredClone(sanityDetail)])

    const gatewayFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ errors: [{ message: 'D1 error' }] }), {
        status: 500,
      }),
    )
    vi.stubGlobal('fetch', gatewayFetch)

    const res = await getAllTravelSupport('conf-1')
    expect(res.travelSupports[0].conference.name).toBe('Sanity Conf Name')
  })
})
