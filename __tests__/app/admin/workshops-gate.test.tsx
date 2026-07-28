/**
 * @vitest-environment node
 *
 * The ORGANIZER-side workshop surface (#689). Hiding the sidebar entry is
 * presentation (see src/lib/admin/registry.test.ts) and the tRPC procedures are
 * gated separately (src/server/routers/workshop.feature.test.ts); this asserts
 * the page itself refuses to render for a tenant without the workshop feature,
 * and that it still loads normally for the platform org. Only the Sanity
 * boundary is mocked — the page's real component composition renders.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockGetConference = vi.fn()
const mockGetOrganizationById = vi.fn()
const mockGetWorkshops = vi.fn()

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

vi.mock('@/lib/workshop/sanity', () => ({
  getWorkshopsByConference: (...args: unknown[]) => mockGetWorkshops(...args),
}))

import WorkshopAdminPage from '@/app/(admin)/admin/workshops/page'

const PLATFORM_SLUG = 'platform-org'

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('PLATFORM_ORG_SLUG', PLATFORM_SLUG)
  mockGetWorkshops.mockResolvedValue([])
  mockGetConference.mockResolvedValue({
    conference: {
      _id: 'conf-1',
      organization: { _ref: 'org-A', _type: 'reference' },
    },
    error: null,
  })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('/admin/workshops — feature gate', () => {
  it('404s for a tenant without the workshop feature', async () => {
    mockGetOrganizationById.mockResolvedValue({
      _id: 'org-A',
      name: 'Tenant A',
      slug: 'tenant-a',
      plan: 'enterprise',
    })

    await expect(WorkshopAdminPage()).rejects.toBeInstanceOf(NotFoundError)
    expect(mockGetWorkshops).not.toHaveBeenCalled()
  })

  it('404s when the organization cannot be resolved (fail closed)', async () => {
    mockGetConference.mockResolvedValue({
      conference: { _id: 'conf-1' },
      error: null,
    })

    await expect(WorkshopAdminPage()).rejects.toBeInstanceOf(NotFoundError)
    expect(mockGetOrganizationById).not.toHaveBeenCalled()
  })

  it('renders for the platform org — today’s behaviour is unchanged', async () => {
    mockGetOrganizationById.mockResolvedValue({
      _id: 'org-A',
      name: 'Platform',
      slug: PLATFORM_SLUG,
    })

    await expect(WorkshopAdminPage()).resolves.toBeTruthy()
    expect(mockGetWorkshops).toHaveBeenCalledWith('conf-1')
  })
})
