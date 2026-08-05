/**
 * @vitest-environment node
 *
 * REACHABILITY of the speaker badge admin surface.
 *
 * The page had NO gate at all: it rendered in full for every tenant, and
 * `issueBadgeForSpeaker`'s platform-org tripwire (RunKonf/platform#46) then
 * failed every action with a message naming our internal issue tracker — once
 * per speaker. This asserts the page now 404s for a tenant that can never
 * issue, and still loads for the platform org.
 *
 * Only the Sanity boundary is mocked; the real entitlement resolution decides,
 * and `notFound()` is mocked to throw the way Next.js does.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockGetConference = vi.fn()
const mockGetOrganizationById = vi.fn()
const mockGetBadgeStats = vi.fn()
const mockListBadges = vi.fn()
const mockGetSpeakers = vi.fn()
const mockGetOrganizers = vi.fn()

class NotFoundError extends Error {
  digest = 'NEXT_NOT_FOUND'
}

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new NotFoundError('NEXT_NOT_FOUND')
  },
}))

vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: (...args: unknown[]) =>
    mockGetConference(...args),
}))

vi.mock('@/lib/organization/sanity', () => ({
  getOrganizationById: (...args: unknown[]) => mockGetOrganizationById(...args),
  getOrganizationRefForCurrentConference: () => null,
}))

vi.mock('@/lib/badge/sanity', () => ({
  getBadgeStats: (...args: unknown[]) => mockGetBadgeStats(...args),
  listBadgesForConference: (...args: unknown[]) => mockListBadges(...args),
}))

vi.mock('@/lib/speaker/sanity', () => ({
  getSpeakers: (...args: unknown[]) => mockGetSpeakers(...args),
  getOrganizers: (...args: unknown[]) => mockGetOrganizers(...args),
}))

/** TRIPWIRE: platform standing is pure env and must read no Sanity. */
const h = vi.hoisted(() => ({ fetch: vi.fn(async () => null) }))

vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: h.fetch },
}))

import AdminBadgePage from '@/app/(admin)/admin/speakers/badge/page'

/** A configured platform org distinct from the request org (`org-A`). */
const OTHER_PLATFORM_ORG_ID = 'org-platform'

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('PLATFORM_ORG_ID', OTHER_PLATFORM_ORG_ID)
  mockGetBadgeStats.mockResolvedValue({
    totalBadges: 0,
    speakerBadges: 0,
    organizerBadges: 0,
    emailsSent: 0,
    emailsFailed: 0,
  })
  mockListBadges.mockResolvedValue({ badges: [], error: null })
  mockGetSpeakers.mockResolvedValue({ speakers: [], err: null })
  mockGetOrganizers.mockResolvedValue({ speakers: [], err: null })
  mockGetConference.mockResolvedValue({
    conference: {
      _id: 'conf-1',
      title: 'Tenant Conf',
      organization: { _ref: 'org-A', _type: 'reference' },
    },
    error: null,
  })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('/admin/speakers/badge — feature gate', () => {
  it('404s for a tenant that can never issue a badge, on every plan', async () => {
    for (const plan of ['community', 'pro', 'enterprise'] as const) {
      mockGetOrganizationById.mockResolvedValue({
        _id: 'org-A',
        name: 'Tenant A',
        slug: 'tenant-a',
        plan,
      })
      await expect(AdminBadgePage()).rejects.toBeInstanceOf(NotFoundError)
    }
    // …and never reached the badge/speaker reads behind the gate.
    expect(mockGetBadgeStats).not.toHaveBeenCalled()
    expect(mockGetSpeakers).not.toHaveBeenCalled()
  })

  it('404s when the organization cannot be resolved (fail closed)', async () => {
    mockGetConference.mockResolvedValue({
      conference: { _id: 'conf-1', title: 'Orphan' },
      error: null,
    })
    await expect(AdminBadgePage()).rejects.toBeInstanceOf(NotFoundError)
    expect(mockGetOrganizationById).not.toHaveBeenCalled()
  })

  it('renders for the platform org — today’s behaviour is unchanged', async () => {
    vi.stubEnv('PLATFORM_ORG_ID', 'org-A')
    mockGetOrganizationById.mockResolvedValue({
      _id: 'org-A',
      name: 'Platform',
      slug: 'platform-org',
    })

    await expect(AdminBadgePage()).resolves.toBeTruthy()
    expect(mockGetBadgeStats).toHaveBeenCalledWith('conf-1')
    expect(h.fetch).not.toHaveBeenCalled()
  })

  it('renders for an org granted badges by an explicit override', async () => {
    mockGetOrganizationById.mockResolvedValue({
      _id: 'org-A',
      name: 'Pilot',
      slug: 'pilot',
      plan: 'community',
      featureOverrides: [{ feature: 'badges', enabled: true }],
    })

    await expect(AdminBadgePage()).resolves.toBeTruthy()
  })
})
