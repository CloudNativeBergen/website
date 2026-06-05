import { describe, it, expect, vi, beforeEach } from 'vitest'
import { appRouter } from '@/server/_app'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { getOrganizersByConference } from '@/lib/speaker/sanity'
import {
  getSponsorForConference,
  createSponsorForConference,
  updateSponsorForConference,
} from '@/lib/sponsor-crm/sanity'
import { bulkUpdateSponsors } from '@/lib/sponsor-crm/bulk'
import { clientReadUncached } from '@/lib/sanity/client'
import type { SponsorForConferenceExpanded } from '@/lib/sponsor-crm/types'

vi.mock('@/lib/conference/sanity')
vi.mock('@/lib/speaker/sanity')
vi.mock('@/lib/sponsor-crm/sanity')
vi.mock('@/lib/sponsor-crm/activity')
vi.mock('@/lib/sponsor-crm/bulk')
vi.mock('@/lib/auth', () => ({ getAuthSession: vi.fn() }))
vi.mock('@/lib/sanity/client', () => ({
  clientWrite: { fetch: vi.fn(), patch: vi.fn(), transaction: vi.fn() },
  clientReadUncached: { fetch: vi.fn() },
  clientRead: { fetch: vi.fn() },
}))

const mockOrganizer = {
  _id: 'org-1',
  name: 'Org',
  email: 'org@test.com',
  isOrganizer: true,
}
const mockConference = { _id: 'conf-1', title: 'Test Conf' }

const tier: SponsorForConferenceExpanded['tier'] = {
  _id: 'tier-gold',
  title: 'Gold',
  tagline: '',
  tierType: 'standard',
}

function makeSfc(
  overrides: Partial<SponsorForConferenceExpanded> = {},
): SponsorForConferenceExpanded {
  return {
    _id: 'sfc-1',
    _createdAt: '',
    _updatedAt: '',
    sponsor: { _id: 's1', name: 'Acme', website: 'https://acme.test', logo: '' },
    conference: { _id: 'conf-1', title: 'Test Conf' },
    contractStatus: 'none',
    status: 'negotiating',
    contractCurrency: 'NOK',
    invoiceStatus: 'not-sent',
    ...overrides,
  }
}

const createCaller = (speaker: any) =>
  appRouter.createCaller({
    session: { user: { email: speaker.email }, speaker },
    speaker,
    user: { email: speaker.email },
  } as any)

describe('sponsor CRM pipeline tier invariant — all write paths', () => {
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
    vi.mocked(createSponsorForConference).mockResolvedValue({
      sponsorForConference: makeSfc({ status: 'closed-won', tier }),
      error: undefined,
    })
    vi.mocked(updateSponsorForConference).mockResolvedValue({
      sponsorForConference: makeSfc(),
      error: undefined,
    })
    vi.mocked(bulkUpdateSponsors).mockResolvedValue({
      success: true,
      updatedCount: 2,
      totalCount: 2,
    })
  })

  describe('create', () => {
    it('rejects creating a closed-won sponsor without a tier', async () => {
      await expect(
        createCaller(mockOrganizer).sponsor.crm.create({
          sponsor: 's1',
          conference: 'conf-1',
          status: 'closed-won',
          contractStatus: 'none',
          invoiceStatus: 'not-sent',
        } as any),
      ).rejects.toThrow(/tier/i)
      expect(createSponsorForConference).not.toHaveBeenCalled()
    })

    it('allows creating a closed-won sponsor with a tier', async () => {
      await createCaller(mockOrganizer).sponsor.crm.create({
        sponsor: 's1',
        conference: 'conf-1',
        tier: 'tier-gold',
        status: 'closed-won',
        contractStatus: 'none',
        invoiceStatus: 'not-sent',
      } as any)
      expect(createSponsorForConference).toHaveBeenCalled()
    })
  })

  describe('update', () => {
    it('rejects moving an untiered sponsor to closed-won', async () => {
      vi.mocked(getSponsorForConference).mockResolvedValue({
        sponsorForConference: makeSfc({ tier: undefined, status: 'negotiating' }),
        error: undefined,
      })
      await expect(
        createCaller(mockOrganizer).sponsor.crm.update({
          id: 'sfc-1',
          status: 'closed-won',
        } as any),
      ).rejects.toThrow(/tier/i)
      expect(updateSponsorForConference).not.toHaveBeenCalled()
    })

    it('rejects clearing the tier of a closed-won sponsor', async () => {
      vi.mocked(getSponsorForConference).mockResolvedValue({
        sponsorForConference: makeSfc({ tier, status: 'closed-won' }),
        error: undefined,
      })
      await expect(
        createCaller(mockOrganizer).sponsor.crm.update({
          id: 'sfc-1',
          tier: '',
        } as any),
      ).rejects.toThrow(/tier/i)
      expect(updateSponsorForConference).not.toHaveBeenCalled()
    })

    it('allows unrelated edits to a legacy tierless closed-won record (does not trap existing data)', async () => {
      vi.mocked(getSponsorForConference).mockResolvedValue({
        sponsorForConference: makeSfc({ tier: undefined, status: 'closed-won' }),
        error: undefined,
      })
      await createCaller(mockOrganizer).sponsor.crm.update({
        id: 'sfc-1',
        notes: 'just a note',
      } as any)
      expect(updateSponsorForConference).toHaveBeenCalled()
    })

    it('allows moving to closed-won when a tier is provided in the same update', async () => {
      vi.mocked(getSponsorForConference).mockResolvedValue({
        sponsorForConference: makeSfc({ tier: undefined, status: 'negotiating' }),
        error: undefined,
      })
      await createCaller(mockOrganizer).sponsor.crm.update({
        id: 'sfc-1',
        status: 'closed-won',
        tier: 'tier-gold',
      } as any)
      expect(updateSponsorForConference).toHaveBeenCalled()
    })

    it('allows repairing a legacy tierless closed-won record by setting a tier', async () => {
      vi.mocked(getSponsorForConference).mockResolvedValue({
        sponsorForConference: makeSfc({ tier: undefined, status: 'closed-won' }),
        error: undefined,
      })
      await createCaller(mockOrganizer).sponsor.crm.update({
        id: 'sfc-1',
        tier: 'tier-gold',
      } as any)
      expect(updateSponsorForConference).toHaveBeenCalled()
    })
  })

  describe('bulkUpdate', () => {
    it('rejects bulk-marking Won when a selected sponsor has no tier', async () => {
      vi.mocked(clientReadUncached.fetch as any).mockResolvedValue(['b']) // 'b' is tierless
      await expect(
        createCaller(mockOrganizer).sponsor.crm.bulkUpdate({
          ids: ['a', 'b'],
          status: 'closed-won',
        } as any),
      ).rejects.toThrow(/tier/i)
      expect(bulkUpdateSponsors).not.toHaveBeenCalled()
    })

    it('allows bulk-marking Won when every selected sponsor has a tier', async () => {
      vi.mocked(clientReadUncached.fetch as any).mockResolvedValue([])
      await createCaller(mockOrganizer).sponsor.crm.bulkUpdate({
        ids: ['a', 'b'],
        status: 'closed-won',
      } as any)
      expect(bulkUpdateSponsors).toHaveBeenCalled()
    })
  })
})
