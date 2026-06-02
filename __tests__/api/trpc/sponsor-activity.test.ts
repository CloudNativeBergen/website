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

const mockOrganizer = {
  _id: 'org-1',
  name: 'Test Organizer',
  email: 'org@test.com',
  isOrganizer: true,
}

const mockNonOrganizer = {
  _id: 'non-org-1',
  name: 'Test Speaker',
  email: 'speaker@test.com',
  isOrganizer: false,
}

const mockConference = {
  _id: 'conf-1',
  title: 'Test Conference',
}

describe('Sponsor CRM Activities & Assignments', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getConferenceForCurrentDomain).mockResolvedValue({
      conference: mockConference as any,
      domain: 'test.com',
      error: null,
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
          conference: 'conf-1',
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
          conference: 'conf-1',
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
            conference: 'conf-1',
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
          sponsorForConference: { _id: 'sfc-1', status: 'prospect' } as any,
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
          sponsorForConference: { _id: 'sfc-1', status: 'prospect' } as any,
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
          sponsorForConference: { _id: 'sfc-1', status: 'prospect' } as any,
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
