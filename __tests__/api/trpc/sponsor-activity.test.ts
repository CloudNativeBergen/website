import { describe, it, expect, vi, beforeEach } from 'vitest'
import { appRouter } from '@/server/_app'
import { getOrganizersByConference } from '@/lib/speaker/sanity'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { deleteSponsorActivity } from '@/lib/sponsor-crm/activity'
import {
  getSponsorForConference,
  createSponsorForConference,
  updateSponsorForConference,
} from '@/lib/sponsor-crm/sanity'
import { bulkUpdateSponsors } from '@/lib/sponsor-crm/bulk'

// Mock dependencies
vi.mock('@/lib/speaker/sanity')
vi.mock('@/lib/conference/sanity')
vi.mock('@/lib/sponsor-crm/activity')
vi.mock('@/lib/sponsor-crm/sanity')
vi.mock('@/lib/sponsor-crm/bulk')
vi.mock('@/lib/auth', () => ({
  getAuthSession: vi.fn(),
}))
// OWNERSHIP PROBE (#730): `crm.bulkUpdate` now proves every supplied id belongs
// to the request's conference before writing. Answer "all of them are ours" so
// these tests keep exercising the ASSIGNMENT guard they were written for; the
// cross-tenant refusal is covered in `sponsor-pipeline-guards.test.ts`.
vi.mock('@/lib/sanity/client', () => ({
  clientWrite: { fetch: vi.fn(), patch: vi.fn(), transaction: vi.fn() },
  clientRead: { fetch: vi.fn() },
  clientReadUncached: {
    // REFERENCE-OWNERSHIP PROBE (#863): `crm.create` also proves the `sponsor`
    // ref it writes belongs to this org. These tests are about the ASSIGNMENT
    // guard, so answer "ours" for the one sponsor id they use; the cross-tenant
    // refusals live in `src/server/routers/tenancy.writes.sponsor.test.ts`.
    fetch: vi.fn(
      async (query: string, params: { ids?: string[]; id?: string } = {}) => {
        if (query.includes('"memberOrgIds"')) {
          return params.id === 'sponsor-1'
            ? { _type: 'sponsor', orgId: 'org-test' }
            : null
        }
        return params.ids?.length ?? 0
      },
    ),
  },
}))

// Org-scoped organizer: `organizerOrgIds` must contain the org the request
// resolves to (mockConference.organization), since that membership is the whole
// authz decision — the non-organizer below organizes no org at all.
const mockOrganizer = {
  _id: 'org-1',
  name: 'Test Organizer',
  email: 'org@test.com',
  isOrganizer: true,
  organizerOrgIds: ['org-test'],
}

const mockNonOrganizer = {
  _id: 'non-org-1',
  name: 'Test Speaker',
  email: 'speaker@test.com',
  isOrganizer: false,
  organizerOrgIds: [],
}

const mockConference = {
  _id: 'conf-1',
  title: 'Test Conference',
  organization: { _type: 'reference', _ref: 'org-test' },
}

describe('Sponsor CRM Activities & Assignments', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getConferenceForCurrentDomain).mockResolvedValue({
      conference: mockConference as any,
      domain: 'test.com',
      error: null,
      status: 'resolved' as const,
    })
    vi.mocked(getOrganizersByConference).mockResolvedValue({
      speakers: [mockOrganizer] as any,
      err: null,
    })
  })

  const createCaller = (speaker: any) => {
    const ctx = {
      session: {
        user: { email: speaker.email },
        speaker,
      },
      speaker,
      user: { email: speaker.email },
    }
    return appRouter.createCaller(ctx as any)
  }

  describe('activities.delete', () => {
    it('should allow organizer to delete their own custom activity', async () => {
      const caller = createCaller(mockOrganizer)
      vi.mocked(deleteSponsorActivity).mockResolvedValue({ success: true })

      const result = await caller.sponsor.crm.activities.delete({
        id: 'activity-1',
      })

      expect(result).toEqual({ success: true })
      expect(deleteSponsorActivity).toHaveBeenCalledWith(
        'activity-1',
        mockOrganizer._id,
      )
    })

    it('should reject if deleteSponsorActivity returns an error (e.g. wrong type or owner)', async () => {
      const caller = createCaller(mockOrganizer)
      const errorMessage = 'You can only delete your own activities'
      vi.mocked(deleteSponsorActivity).mockResolvedValue({
        success: false,
        error: new Error(errorMessage),
      })

      await expect(
        caller.sponsor.crm.activities.delete({ id: 'activity-1' }),
      ).rejects.toThrow(errorMessage)
    })

    it('should reject non-organizers via middleware', async () => {
      const caller = createCaller(mockNonOrganizer)

      await expect(
        caller.sponsor.crm.activities.delete({ id: 'activity-1' }),
      ).rejects.toThrow(/Admin privileges required/i)
    })
  })

  describe('Sponsor Assignment Restrictions', () => {
    describe('create', () => {
      it('should allow assignment to an organizer', async () => {
        const caller = createCaller(mockOrganizer)
        vi.mocked(createSponsorForConference).mockResolvedValue({
          sponsorForConference: { _id: 'sfc-1' } as any,
        })

        const result = await caller.sponsor.crm.create({
          sponsor: 'sponsor-1',
          status: 'prospect',
          contractStatus: 'none',
          invoiceStatus: 'not-sent',
          assignedTo: mockOrganizer._id,
        })

        expect(result).toBeDefined()
        expect(createSponsorForConference).toHaveBeenCalled()
      })

      it('should allow explicitly passing null to stay unassigned', async () => {
        const caller = createCaller(mockOrganizer)
        vi.mocked(createSponsorForConference).mockResolvedValue({
          sponsorForConference: { _id: 'sfc-1' } as any,
        })

        await caller.sponsor.crm.create({
          sponsor: 'sponsor-1',
          status: 'prospect',
          contractStatus: 'none',
          invoiceStatus: 'not-sent',
          assignedTo: null,
        })

        // Verify it was passed as null to the library, bypassing auto-assign
        expect(createSponsorForConference).toHaveBeenCalledWith(
          expect.objectContaining({ assignedTo: null }),
        )
      })

      it('should reject assignment to a non-organizer', async () => {
        const caller = createCaller(mockOrganizer)

        await expect(
          caller.sponsor.crm.create({
            sponsor: 'sponsor-1',
            status: 'prospect',
            contractStatus: 'none',
            invoiceStatus: 'not-sent',
            assignedTo: mockNonOrganizer._id,
          }),
        ).rejects.toThrow(/Assigned person must be an organizer/i)
      })
    })

    describe('update', () => {
      it('should allow updating assignment to an organizer', async () => {
        const caller = createCaller(mockOrganizer)
        vi.mocked(getSponsorForConference).mockResolvedValue({
          sponsorForConference: {
            _id: 'sfc-1',
            status: 'prospect',
            conference: { _id: 'conf-1' },
          } as any,
        })
        vi.mocked(updateSponsorForConference).mockResolvedValue({
          sponsorForConference: { _id: 'sfc-1' } as any,
        })

        const result = await caller.sponsor.crm.update({
          id: 'sfc-1',
          assignedTo: mockOrganizer._id,
        })

        expect(result).toBeDefined()
        expect(updateSponsorForConference).toHaveBeenCalled()
      })

      it('should allow updating assignment to null (unassign)', async () => {
        const caller = createCaller(mockOrganizer)
        vi.mocked(getSponsorForConference).mockResolvedValue({
          sponsorForConference: {
            _id: 'sfc-1',
            status: 'prospect',
            conference: { _id: 'conf-1' },
          } as any,
        })
        vi.mocked(updateSponsorForConference).mockResolvedValue({
          sponsorForConference: { _id: 'sfc-1' } as any,
        })

        await caller.sponsor.crm.update({
          id: 'sfc-1',
          assignedTo: null,
        })

        expect(updateSponsorForConference).toHaveBeenCalledWith(
          'sfc-1',
          expect.objectContaining({ assignedTo: null }),
        )
      })

      it('should reject updating assignment to a non-organizer', async () => {
        const caller = createCaller(mockOrganizer)
        vi.mocked(getSponsorForConference).mockResolvedValue({
          sponsorForConference: {
            _id: 'sfc-1',
            status: 'prospect',
            conference: { _id: 'conf-1' },
          } as any,
        })

        await expect(
          caller.sponsor.crm.update({
            id: 'sfc-1',
            assignedTo: mockNonOrganizer._id,
          }),
        ).rejects.toThrow(/Assigned person must be an organizer/i)
      })
    })

    describe('bulkUpdate', () => {
      it('should allow bulk assignment to an organizer', async () => {
        const caller = createCaller(mockOrganizer)
        vi.mocked(bulkUpdateSponsors).mockResolvedValue({
          success: true,
          updatedCount: 2,
          totalCount: 2,
        })

        const result = await caller.sponsor.crm.bulkUpdate({
          ids: ['sfc-1', 'sfc-2'],
          assignedTo: mockOrganizer._id,
        })

        expect(result.success).toBe(true)
        expect(bulkUpdateSponsors).toHaveBeenCalled()
      })

      it('should reject bulk assignment to a non-organizer', async () => {
        const caller = createCaller(mockOrganizer)

        await expect(
          caller.sponsor.crm.bulkUpdate({
            ids: ['sfc-1', 'sfc-2'],
            assignedTo: mockNonOrganizer._id,
          }),
        ).rejects.toThrow(/Assigned person must be an organizer/i)
      })
    })
  })
})
