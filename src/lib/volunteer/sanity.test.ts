import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
vi.mock('@/lib/conference/konf-api', async (orig) => ({
  ...(await orig<object>()),
  rolloutFlags: (await import('../../../__tests__/helpers/rolloutFlags'))
    .fakeRolloutFlags,
}))
import { flagTenants } from '../../../__tests__/helpers/rolloutFlags'

vi.mock('next/cache', () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }))

const patch = {
  set: vi.fn(),
  setIfMissing: vi.fn(),
  unset: vi.fn(),
  ifRevisionId: vi.fn(),
  commit: vi.fn(),
}

const tx = { patch: vi.fn(), commit: vi.fn() }
const volunteerFetch = vi.fn()

vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: {
    fetch: (...args: unknown[]) => volunteerFetch(...args),
  },
  clientWrite: { patch: vi.fn(() => patch), transaction: vi.fn(() => tx) },
}))

import {
  updateVolunteerStatus,
  bulkUpdateVolunteerStatus,
  getVolunteerById,
  getVolunteersByConference,
} from './sanity'
import {
  Occupation,
  VolunteerStatus,
  type VolunteerWithConference,
} from './types'

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  patch.set.mockReturnValue(patch)
  patch.setIfMissing.mockReturnValue(patch)
  patch.unset.mockReturnValue(patch)
  patch.commit.mockResolvedValue({})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('updateVolunteerStatus', () => {
  it('keeps the original reviewer when confirming', async () => {
    await updateVolunteerStatus('vol-1', VolunteerStatus.CONFIRMED, 'org-2')

    const set = patch.set.mock.calls[0][0]
    expect(set).toMatchObject({ status: VolunteerStatus.CONFIRMED })
    expect(set.confirmedAt).toEqual(expect.any(String))
    expect(set).not.toHaveProperty('reviewedAt')
    expect(set).not.toHaveProperty('reviewedBy')
    expect(patch.setIfMissing).toHaveBeenCalledWith({
      reviewedAt: expect.any(String),
      reviewedBy: { _type: 'reference', _ref: 'org-2' },
    })
    expect(patch.unset).not.toHaveBeenCalled()
    expect(patch.commit).toHaveBeenCalledOnce()
  })

  it('records the reviewer and clears confirmedAt on other statuses', async () => {
    await updateVolunteerStatus('vol-1', VolunteerStatus.APPROVED, 'org-2')

    expect(patch.set.mock.calls[0][0]).toMatchObject({
      status: VolunteerStatus.APPROVED,
      reviewedBy: { _type: 'reference', _ref: 'org-2' },
    })
    expect(patch.setIfMissing).not.toHaveBeenCalled()
    expect(patch.unset).toHaveBeenCalledWith(['confirmedAt'])
  })

  it('keeps the reviewer when reverting confirmed to approved', async () => {
    await updateVolunteerStatus(
      'vol-1',
      VolunteerStatus.APPROVED,
      'org-2',
      undefined,
      true,
    )

    const set = patch.set.mock.calls[0][0]
    expect(set).toEqual({ status: VolunteerStatus.APPROVED })
    expect(patch.setIfMissing).toHaveBeenCalledOnce()
    expect(patch.unset).toHaveBeenCalledWith(['confirmedAt'])
  })
})

describe('bulkUpdateVolunteerStatus', () => {
  it('patches every id in one transaction with the reviewer', async () => {
    vi.clearAllMocks()
    patch.set.mockReturnValue(patch)
    patch.unset.mockReturnValue(patch)
    patch.ifRevisionId.mockReturnValue(patch)
    tx.commit.mockResolvedValue({})
    const res = await bulkUpdateVolunteerStatus(
      [
        { _id: 'v1', _rev: 'r1' },
        { _id: 'v2', _rev: 'r2' },
      ],
      VolunteerStatus.APPROVED,
      'org-2',
    )
    expect(res).toEqual({ success: true, error: null })
    expect(tx.patch.mock.calls.map((c) => c[0])).toEqual(['v1', 'v2'])
    tx.patch.mock.calls[0][1](patch)
    expect(patch.ifRevisionId).toHaveBeenCalledWith('r1')
    expect(patch.set).toHaveBeenCalledWith({
      status: VolunteerStatus.APPROVED,
      reviewedAt: expect.any(String),
      reviewedBy: { _type: 'reference', _ref: 'org-2' },
    })
    expect(patch.unset).toHaveBeenCalledWith(['confirmedAt'])
    expect(tx.commit).toHaveBeenCalledOnce()
  })
})

describe('volunteer D1 gateway values and fallbacks (#1997)', () => {
  const sanityVolunteer: VolunteerWithConference = {
    _id: 'vol-1',
    _rev: 'rev-1',
    _createdAt: '2026-01-01T00:00:00Z',
    _updatedAt: '2026-01-01T00:00:00Z',
    name: 'Jane Doe',
    email: 'jane@example.com',
    phone: '12345678',
    occupation: Occupation.WORKING,
    status: VolunteerStatus.CONFIRMED,
    conference: {
      _id: 'conf-v',
      title: 'Sanity Volunteer Conf',
      city: 'Sanity City',
      country: 'Sanity Country',
      startDate: '2026-09-01',
      domains: ['volunteer.example.com'],
      organization: { _ref: 'org-v' },
      contactEmail: 'contact@example.com',
      volunteerRegistrationLink: 'https://example.com/register',
    },
  }

  it('uses D1-owned fields when apiRead is on and values differ', async () => {
    vi.stubEnv('KONF_API_URL', 'https://api.example.com')
    flagTenants('apiRead', 'conf-v')
    volunteerFetch.mockResolvedValue(structuredClone(sanityVolunteer))

    const gatewayFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            conference: {
              id: 'conf-v',
              title: 'D1 Volunteer Conf',
              city: 'D1 City',
              country: 'D1 Country',
              startDate: '2026-09-10',
            },
          },
        }),
      ),
    )
    vi.stubGlobal('fetch', gatewayFetch)

    const result = await getVolunteerById('vol-1')
    expect(result.volunteer).toBeDefined()
    const conf = result.volunteer?.conference
    expect(conf?.title).toBe('D1 Volunteer Conf')
    expect(conf?.city).toBe('D1 City')
    expect(conf?.country).toBe('D1 Country')
    expect(conf?.startDate).toBe('2026-09-10')
    // Sanity-only fields stay untouched:
    expect(conf?.contactEmail).toBe('contact@example.com')
    expect(conf?.volunteerRegistrationLink).toBe('https://example.com/register')
  })

  it('uses D1-owned fields for getVolunteersByConference when apiRead is on', async () => {
    vi.stubEnv('KONF_API_URL', 'https://api.example.com')
    flagTenants('apiRead', 'conf-v')
    volunteerFetch.mockResolvedValue([structuredClone(sanityVolunteer)])

    const gatewayFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            conference: {
              id: 'conf-v',
              title: 'D1 Volunteer Conf',
              city: 'D1 City',
            },
          },
        }),
      ),
    )
    vi.stubGlobal('fetch', gatewayFetch)

    const result = await getVolunteersByConference('conf-v')
    expect(result.volunteers).toHaveLength(1)
    expect(result.volunteers[0].conference.title).toBe('D1 Volunteer Conf')
    expect(result.volunteers[0].conference.city).toBe('D1 City')
  })

  it('falls back to Sanity when apiRead is off', async () => {
    vi.stubEnv('KONF_API_URL', 'https://api.example.com')
    flagTenants('apiRead', 'other-conf')
    volunteerFetch.mockResolvedValue(structuredClone(sanityVolunteer))

    const gatewayFetch = vi.fn()
    vi.stubGlobal('fetch', gatewayFetch)

    const result = await getVolunteerById('vol-1')
    expect(gatewayFetch).not.toHaveBeenCalled()
    const conf = result.volunteer?.conference
    expect(conf?.title).toBe('Sanity Volunteer Conf')
    expect(conf?.city).toBe('Sanity City')
    expect(conf?.startDate).toBe('2026-09-01')
  })

  it('falls back to Sanity when KONF_API_DISABLED=1', async () => {
    vi.stubEnv('KONF_API_URL', 'https://api.example.com')
    flagTenants('apiRead', 'conf-v')
    vi.stubEnv('KONF_API_DISABLED', '1')
    volunteerFetch.mockResolvedValue(structuredClone(sanityVolunteer))

    const gatewayFetch = vi.fn()
    vi.stubGlobal('fetch', gatewayFetch)

    const result = await getVolunteerById('vol-1')
    expect(gatewayFetch).not.toHaveBeenCalled()
    const conf = result.volunteer?.conference
    expect(conf?.title).toBe('Sanity Volunteer Conf')
    expect(conf?.city).toBe('Sanity City')
  })

  it('falls back to Sanity when the gateway errors', async () => {
    vi.stubEnv('KONF_API_URL', 'https://api.example.com')
    flagTenants('apiRead', 'conf-v')
    volunteerFetch.mockResolvedValue(structuredClone(sanityVolunteer))

    const gatewayFetch = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ errors: [{ message: 'D1 unavailable' }] }),
          { status: 500 },
        ),
      )
    vi.stubGlobal('fetch', gatewayFetch)

    const result = await getVolunteerById('vol-1')
    const conf = result.volunteer?.conference
    expect(conf?.title).toBe('Sanity Volunteer Conf')
    expect(conf?.city).toBe('Sanity City')
    expect(conf?.startDate).toBe('2026-09-01')
  })
})
