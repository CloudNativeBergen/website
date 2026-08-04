/**
 * @vitest-environment node
 *
 * The organizer workshop API is gated on the `workshops` feature (#689) — not
 * just the `/admin/workshops` page. An organizer of a tenant without the
 * feature must not be able to read or mutate workshop signups by calling the
 * tRPC procedures directly.
 *
 * Only the Sanity boundary is mocked (conference + organization documents), so
 * the real resolver decides — platform-org default, overrides, fail-closed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockGetOrganizationById = vi.fn()
const mockGetConference = vi.fn()
const mockGetAllWorkshopSignups = vi.fn()

vi.mock('@/lib/organization/sanity', () => ({
  getOrganizationById: (...args: unknown[]) => mockGetOrganizationById(...args),
  getOrganizationRefForCurrentConference: () => null,
}))

vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: (...args: unknown[]) =>
    mockGetConference(...args),
}))

vi.mock('@/lib/workshop/sanity', () => ({
  getAllWorkshopSignups: (...args: unknown[]) =>
    mockGetAllWorkshopSignups(...args),
  checkWorkshopCapacity: vi.fn(),
  verifyWorkshopBelongsToConference: vi.fn(),
  getWorkshopSignups: vi.fn(),
  createWorkshopSignup: vi.fn(),
  cancelWorkshopSignup: vi.fn(),
  confirmWorkshopSignup: vi.fn(),
  updateWorkshopCapacity: vi.fn(),
  getWorkshopSignupsByWorkshop: vi.fn(),
  getWorkshopStatistics: vi.fn(),
}))

import { workshopRouter } from './workshop'
import type { Context } from '@/server/trpc'

const PLATFORM_SLUG = 'platform-org'
const ORG_ID = 'org-A'

/** An organizer of the request org (the authz waist's happy path). */
function caller() {
  const speaker = { _id: 'organizer-1', organizerOrgIds: [ORG_ID] }
  const session = { speaker, user: { email: 'organizer@example.test' } }
  return workshopRouter.createCaller({
    session,
    speaker,
    user: session.user,
  } as unknown as Context)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('PLATFORM_ORG_SLUG', PLATFORM_SLUG)
  mockGetConference.mockResolvedValue({
    conference: {
      _id: 'conf-1',
      organization: { _ref: ORG_ID, _type: 'reference' },
    },
    error: null,
  })
  mockGetAllWorkshopSignups.mockResolvedValue([])
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('workshop.admin — feature gate', () => {
  it('FORBIDs an organizer of a tenant without the feature', async () => {
    mockGetOrganizationById.mockResolvedValue({
      _id: ORG_ID,
      name: 'Tenant A',
      slug: 'tenant-a',
      plan: 'enterprise',
    })

    await expect(caller().admin.getAllSignups({})).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: expect.stringContaining('workshops'),
    })
    expect(mockGetAllWorkshopSignups).not.toHaveBeenCalled()
  })

  it('FORBIDs when the org document read rejects (fail closed)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockGetOrganizationById.mockRejectedValue(new Error('sanity down'))

    await expect(caller().admin.getAllSignups({})).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    expect(mockGetAllWorkshopSignups).not.toHaveBeenCalled()
  })

  it('allows the platform org through — unchanged for CND', async () => {
    mockGetOrganizationById.mockResolvedValue({
      _id: ORG_ID,
      name: 'Platform',
      slug: PLATFORM_SLUG,
    })

    await expect(caller().admin.getAllSignups({})).resolves.toMatchObject({
      success: true,
    })
    expect(mockGetAllWorkshopSignups).toHaveBeenCalled()
  })

  it('allows a tenant granted the feature by an override', async () => {
    mockGetOrganizationById.mockResolvedValue({
      _id: ORG_ID,
      name: 'Pilot',
      slug: 'pilot',
      featureOverrides: [{ feature: 'workshops', enabled: true }],
    })

    await expect(caller().admin.getAllSignups({})).resolves.toMatchObject({
      success: true,
    })
  })
})
