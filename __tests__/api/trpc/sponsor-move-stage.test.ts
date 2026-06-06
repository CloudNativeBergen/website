import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { appRouter } from '@/server/_app'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { getOrganizersByConference } from '@/lib/speaker/sanity'
import {
  getSponsorForConference,
  updateSponsorForConference,
} from '@/lib/sponsor-crm/sanity'
import { logStageChange } from '@/lib/sponsor-crm/activity'
import { extractMissingFields } from '@/server/errors'
import { TRPCError } from '@trpc/server'
import type { SponsorForConferenceExpanded } from '@/lib/sponsor-crm/types'

vi.mock('@/lib/conference/sanity')
vi.mock('@/lib/speaker/sanity')
vi.mock('@/lib/sponsor-crm/sanity')
vi.mock('@/lib/sponsor-crm/activity')
vi.mock('@/lib/auth', () => ({ getAuthSession: vi.fn() }))

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
    sponsor: {
      _id: 's1',
      name: 'Acme',
      website: 'https://acme.test',
      logo: '',
    },
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

describe('sponsor.crm.moveStage — tier guard', () => {
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
    vi.mocked(updateSponsorForConference).mockResolvedValue({
      sponsorForConference: makeSfc(),
      error: undefined,
    })
    vi.mocked(logStageChange).mockResolvedValue(undefined as any)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('rejects moving to closed-won without a tier', async () => {
    vi.mocked(getSponsorForConference).mockResolvedValue({
      sponsorForConference: makeSfc({ tier: undefined, status: 'negotiating' }),
      error: undefined,
    })

    await expect(
      createCaller(mockOrganizer).sponsor.crm.moveStage({
        id: 'sfc-1',
        newStatus: 'closed-won',
      }),
    ).rejects.toThrow(/tier/i)

    expect(updateSponsorForConference).not.toHaveBeenCalled()
  })

  it('rejects with a structured missingFields payload (not just a string message)', async () => {
    vi.mocked(getSponsorForConference).mockResolvedValue({
      sponsorForConference: makeSfc({ tier: undefined, status: 'negotiating' }),
      error: undefined,
    })

    try {
      await createCaller(mockOrganizer).sponsor.crm.moveStage({
        id: 'sfc-1',
        newStatus: 'closed-won',
      })
      expect.unreachable('moveStage should have rejected')
    } catch (error) {
      expect(error).toBeInstanceOf(TRPCError)
      expect((error as TRPCError).code).toBe('PRECONDITION_FAILED')
      const missing = extractMissingFields(error as TRPCError)
      expect(missing).toBeDefined()
      expect(missing?.[0]?.field).toBe('tier')
      expect(missing?.[0]?.message).toMatch(/tier/i)
    }
  })

  it('allows moving to closed-won when a tier is set', async () => {
    vi.mocked(getSponsorForConference).mockResolvedValue({
      sponsorForConference: makeSfc({ tier, status: 'negotiating' }),
      error: undefined,
    })

    await createCaller(mockOrganizer).sponsor.crm.moveStage({
      id: 'sfc-1',
      newStatus: 'closed-won',
    })

    expect(updateSponsorForConference).toHaveBeenCalledWith('sfc-1', {
      status: 'closed-won',
    })
  })

  it('allows moving to closed-lost without a tier', async () => {
    vi.mocked(getSponsorForConference).mockResolvedValue({
      sponsorForConference: makeSfc({ tier: undefined, status: 'negotiating' }),
      error: undefined,
    })

    await createCaller(mockOrganizer).sponsor.crm.moveStage({
      id: 'sfc-1',
      newStatus: 'closed-lost',
    })

    expect(updateSponsorForConference).toHaveBeenCalledWith('sfc-1', {
      status: 'closed-lost',
    })
  })
})
