import { describe, it, expect, vi, beforeEach } from 'vitest'
import { appRouter } from '@/server/_app'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import {
  bulkUpdateSponsors,
  bulkDeleteSponsors,
  BulkTenancyError,
} from '@/lib/sponsor-crm/bulk'
import { deleteSponsor, deleteSponsorTier } from '@/lib/sponsor/sanity'
import { clientWrite } from '@/lib/sanity/client'

/**
 * ROUTER-LEVEL TENANCY REGRESSIONS for the sponsor router (#616, batch A1/A2).
 *
 * Two things are pinned here that a library unit test cannot see:
 *
 *  1. The REQUEST's tenant reaches the write helpers. The conference/org comes
 *     from the resolved domain, never from `input` — so a crafted payload
 *     cannot redirect a bulk write at another tenant.
 *  2. A fail-closed REFUSAL survives the router's catch blocks as a client
 *     error (NOT_FOUND), not as a 500. A refusal masked as INTERNAL_SERVER_ERROR
 *     is indistinguishable from a server fault and hides the guard working.
 */
vi.mock('@/lib/conference/sanity')
vi.mock('@/lib/speaker/sanity')
vi.mock('@/lib/sponsor-crm/sanity')
vi.mock('@/lib/sponsor-crm/activity')
vi.mock('@/lib/sponsor-crm/bulk')
vi.mock('@/lib/sponsor/sanity')
vi.mock('@/lib/auth', () => ({ getAuthSession: vi.fn() }))
vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }))
vi.mock('@/lib/sanity/client', () => ({
  clientWrite: { fetch: vi.fn(), patch: vi.fn(), transaction: vi.fn() },
  clientReadUncached: { fetch: vi.fn() },
  clientRead: { fetch: vi.fn() },
}))

const ORG = 'org-test'
const mockOrganizer = {
  _id: 'spk-org-1',
  name: 'Org',
  email: 'org@test.com',
  isOrganizer: true,
  organizerOrgIds: [ORG],
}
const mockConference = {
  _id: 'conf-1',
  title: 'Test Conf',
  organization: { _type: 'reference', _ref: ORG },
}

const createCaller = () =>
  appRouter.createCaller({
    session: { user: { email: mockOrganizer.email }, speaker: mockOrganizer },
    speaker: mockOrganizer,
    user: { email: mockOrganizer.email },
  } as any)

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getConferenceForCurrentDomain).mockResolvedValue({
    conference: mockConference as any,
    domain: 'test.com',
    error: null,
  })
})

describe('sponsor router — the request tenant reaches every bulk write', () => {
  it('bulkDelete passes the REQUEST conference, not anything from input', async () => {
    vi.mocked(bulkDeleteSponsors).mockResolvedValue({
      success: true,
      deletedCount: 1,
      totalCount: 1,
    })

    await createCaller().sponsor.crm.bulkDelete({ ids: ['sfc-1'] } as any)

    expect(bulkDeleteSponsors).toHaveBeenCalledWith(
      ['sfc-1'],
      mockConference._id,
      expect.anything(),
    )
  })

  it('sponsor.delete passes the REQUEST org', async () => {
    vi.mocked(deleteSponsor).mockResolvedValue({})

    await createCaller().sponsor.delete({ id: 's-1' } as any)

    expect(deleteSponsor).toHaveBeenCalledWith('s-1', ORG)
  })

  it('tiers.delete passes the REQUEST conference', async () => {
    vi.mocked(deleteSponsorTier).mockResolvedValue({})

    await createCaller().sponsor.tiers.delete({ id: 'tier-1' } as any)

    expect(deleteSponsorTier).toHaveBeenCalledWith('tier-1', mockConference._id)
  })
})

describe('sponsor router — refusals are not masked as 500s', () => {
  // MUTATION CHECK: remove the `instanceof BulkTenancyError` arm from either
  // catch block and these fail with INTERNAL_SERVER_ERROR.
  it('bulkUpdate surfaces a cross-tenant refusal as NOT_FOUND', async () => {
    vi.mocked(clientWrite.fetch as any).mockResolvedValue([])
    vi.mocked(bulkUpdateSponsors).mockRejectedValue(
      new BulkTenancyError('refusing the batch'),
    )

    await expect(
      createCaller().sponsor.crm.bulkUpdate({
        ids: ['sfc-1', 'sfc-theirs'],
        status: 'contacted',
      } as any),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('bulkDelete surfaces a cross-tenant refusal as NOT_FOUND', async () => {
    vi.mocked(bulkDeleteSponsors).mockRejectedValue(
      new BulkTenancyError('refusing the batch'),
    )

    await expect(
      createCaller().sponsor.crm.bulkDelete({
        ids: ['sfc-1', 'sfc-theirs'],
      } as any),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('still reports a genuine failure as INTERNAL_SERVER_ERROR', async () => {
    vi.mocked(bulkDeleteSponsors).mockRejectedValue(new Error('sanity down'))

    await expect(
      createCaller().sponsor.crm.bulkDelete({ ids: ['sfc-1'] } as any),
    ).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' })
  })
})
