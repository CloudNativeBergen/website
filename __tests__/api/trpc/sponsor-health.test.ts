import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { appRouter } from '@/server/_app'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { listSponsorsForConference } from '@/lib/sponsor-crm/sanity'
import type { SponsorForConferenceExpanded } from '@/lib/sponsor-crm/types'

vi.mock('@/lib/conference/sanity')
vi.mock('@/lib/speaker/sanity')
vi.mock('@/lib/sponsor-crm/sanity')
vi.mock('@/lib/sponsor-crm/activity')
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

describe('sponsor.crm.healthViolations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getConferenceForCurrentDomain).mockResolvedValue({
      conference: mockConference as any,
      domain: 'test.com',
      error: null,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns audited violations across all sponsors of the conference', async () => {
    vi.mocked(listSponsorsForConference).mockResolvedValue({
      sponsors: [
        makeSfc({
          _id: 'sfc-hidden',
          status: 'closed-won',
          tier: undefined,
        }),
        makeSfc({ _id: 'sfc-ok', status: 'closed-won', tier }),
      ],
    })

    const result =
      await createCaller(mockOrganizer).sponsor.crm.healthViolations()

    expect(result).toHaveLength(1)
    expect(result[0].sponsorId).toBe('sfc-hidden')
    expect(result[0].axis).toBe('pipeline')
    expect(result[0].hidesFromPublicSite).toBe(true)
  })

  it('audits the full conference roster, not a filtered subset', async () => {
    vi.mocked(listSponsorsForConference).mockResolvedValue({ sponsors: [] })

    await createCaller(mockOrganizer).sponsor.crm.healthViolations()

    // No status/tier/etc. filters — the panel must see every sponsor.
    expect(listSponsorsForConference).toHaveBeenCalledWith('conf-1')
  })

  it('returns an empty list when every sponsor is healthy', async () => {
    vi.mocked(listSponsorsForConference).mockResolvedValue({
      sponsors: [makeSfc({ status: 'negotiating' })],
    })

    const result =
      await createCaller(mockOrganizer).sponsor.crm.healthViolations()

    expect(result).toEqual([])
  })
})
