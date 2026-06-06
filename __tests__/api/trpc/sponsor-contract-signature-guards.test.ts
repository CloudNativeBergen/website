import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { appRouter } from '@/server/_app'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { getOrganizersByConference } from '@/lib/speaker/sanity'
import {
  getSponsorForConference,
  updateSponsorForConference,
} from '@/lib/sponsor-crm/sanity'
import { getContractTemplate } from '@/lib/sponsor-crm/contract-templates'
import { clientWrite } from '@/lib/sanity/client'
import type { SponsorForConferenceExpanded } from '@/lib/sponsor-crm/types'

vi.mock('@/lib/conference/sanity')
vi.mock('@/lib/speaker/sanity')
vi.mock('@/lib/sponsor-crm/sanity')
vi.mock('@/lib/sponsor-crm/activity')
vi.mock('@/lib/sponsor-crm/contract-templates')
vi.mock('@/lib/auth', () => ({ getAuthSession: vi.fn() }))
vi.mock('@/lib/sanity/client', () => ({
  clientWrite: {
    fetch: vi.fn(),
    patch: vi.fn(),
    transaction: vi.fn(),
    assets: { upload: vi.fn() },
  },
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

const primaryContact = [
  { _key: 'c1', name: 'Jane Doe', email: 'jane@acme.test', isPrimary: true },
]

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

const createCaller = (speaker: typeof mockOrganizer) =>
  appRouter.createCaller({
    session: { user: { email: speaker.email }, speaker },
    speaker,
    user: { email: speaker.email },
  } as never)

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getConferenceForCurrentDomain).mockResolvedValue({
    conference: mockConference as never,
    domain: 'test.com',
    error: null,
  })
  vi.mocked(getOrganizersByConference).mockResolvedValue({
    speakers: [mockOrganizer] as never,
    err: null,
  })
  vi.mocked(updateSponsorForConference).mockResolvedValue({
    sponsorForConference: makeSfc(),
    error: undefined,
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('updateContractStatus — contract axis guards', () => {
  it('rejects marking contract-sent when the sponsor has no tier', async () => {
    vi.mocked(getSponsorForConference).mockResolvedValue({
      sponsorForConference: makeSfc({ tier: undefined, contractValue: 50000 }),
      error: undefined,
    })
    await expect(
      createCaller(mockOrganizer).sponsor.crm.updateContractStatus({
        id: 'sfc-1',
        newStatus: 'contract-sent',
      }),
    ).rejects.toThrow(/tier/i)
    expect(updateSponsorForConference).not.toHaveBeenCalled()
  })

  it('rejects marking contract-sent on a closed-lost deal', async () => {
    vi.mocked(getSponsorForConference).mockResolvedValue({
      sponsorForConference: makeSfc({
        tier,
        contractValue: 50000,
        status: 'closed-lost',
      }),
      error: undefined,
    })
    await expect(
      createCaller(mockOrganizer).sponsor.crm.updateContractStatus({
        id: 'sfc-1',
        newStatus: 'contract-sent',
      }),
    ).rejects.toThrow(/closed-lost|lost/i)
    expect(updateSponsorForConference).not.toHaveBeenCalled()
  })

  it('rejects marking contract-signed on a closed-lost deal', async () => {
    vi.mocked(getSponsorForConference).mockResolvedValue({
      sponsorForConference: makeSfc({
        tier,
        contractValue: 50000,
        contactPersons: primaryContact,
        contractStatus: 'contract-sent',
        status: 'closed-lost',
      }),
      error: undefined,
    })
    await expect(
      createCaller(mockOrganizer).sponsor.crm.updateContractStatus({
        id: 'sfc-1',
        newStatus: 'contract-signed',
      }),
    ).rejects.toThrow(/closed-lost|lost/i)
    expect(updateSponsorForConference).not.toHaveBeenCalled()
  })

  it('rejects marking contract-signed without a primary contact', async () => {
    vi.mocked(getSponsorForConference).mockResolvedValue({
      sponsorForConference: makeSfc({
        tier,
        contractValue: 50000,
        contractStatus: 'contract-sent',
      }),
      error: undefined,
    })
    await expect(
      createCaller(mockOrganizer).sponsor.crm.updateContractStatus({
        id: 'sfc-1',
        newStatus: 'contract-signed',
      }),
    ).rejects.toThrow(/contact/i)
    expect(updateSponsorForConference).not.toHaveBeenCalled()
  })

  it('allows marking contract-signed with tier, value and a primary contact (offline path)', async () => {
    vi.mocked(getSponsorForConference).mockResolvedValue({
      sponsorForConference: makeSfc({
        tier,
        contractValue: 50000,
        contractStatus: 'contract-sent',
        contactPersons: primaryContact,
      }),
      error: undefined,
    })
    await createCaller(mockOrganizer).sponsor.crm.updateContractStatus({
      id: 'sfc-1',
      newStatus: 'contract-signed',
    })
    expect(updateSponsorForConference).toHaveBeenCalled()
  })

  it('allows a backward move out of contract-sent without any field guard', async () => {
    vi.mocked(getSponsorForConference).mockResolvedValue({
      sponsorForConference: makeSfc({
        tier: undefined,
        contractValue: 0,
        contractStatus: 'contract-sent',
      }),
      error: undefined,
    })
    await createCaller(mockOrganizer).sponsor.crm.updateContractStatus({
      id: 'sfc-1',
      newStatus: 'verbal-agreement',
    })
    expect(updateSponsorForConference).toHaveBeenCalled()
  })
})

describe('updateSignatureStatus — signature axis guards', () => {
  function mockPatch() {
    const commit = vi.fn().mockResolvedValue({})
    const set = vi.fn().mockReturnValue({ commit })
    vi.mocked(clientWrite.patch).mockReturnValue({ set } as never)
    return { set, commit }
  }

  it('rejects marking the signature pending before the contract was sent', async () => {
    const { commit } = mockPatch()
    vi.mocked(getSponsorForConference).mockResolvedValue({
      sponsorForConference: makeSfc({ contractStatus: 'none' }),
      error: undefined,
    })
    await expect(
      createCaller(mockOrganizer).sponsor.crm.updateSignatureStatus({
        id: 'sfc-1',
        newStatus: 'pending',
      }),
    ).rejects.toThrow(/sent|contract/i)
    expect(commit).not.toHaveBeenCalled()
  })

  it('rejects a manual signature signed before the contract was sent', async () => {
    const { commit } = mockPatch()
    vi.mocked(getSponsorForConference).mockResolvedValue({
      sponsorForConference: makeSfc({ contractStatus: 'none' }),
      error: undefined,
    })
    await expect(
      createCaller(mockOrganizer).sponsor.crm.updateSignatureStatus({
        id: 'sfc-1',
        newStatus: 'signed',
      }),
    ).rejects.toThrow(/sent|contract/i)
    expect(commit).not.toHaveBeenCalled()
  })

  it('allows a manual signature signed once the contract was sent and contract invariants are met', async () => {
    const { commit } = mockPatch()
    vi.mocked(getSponsorForConference).mockResolvedValue({
      sponsorForConference: makeSfc({
        contractStatus: 'contract-sent',
        tier,
        contractValue: 50000,
        contactPersons: primaryContact,
      }),
      error: undefined,
    })
    await createCaller(mockOrganizer).sponsor.crm.updateSignatureStatus({
      id: 'sfc-1',
      newStatus: 'signed',
    })
    expect(commit).toHaveBeenCalled()
  })

  it('rejects a manual signature signed when contract-signed invariants are unmet (it would write contract-signed)', async () => {
    const { commit } = mockPatch()
    vi.mocked(getSponsorForConference).mockResolvedValue({
      // Contract was sent (passes the signature guard) but tier/value/contact
      // are missing — marking signed here would write an invalid contract-signed.
      sponsorForConference: makeSfc({
        contractStatus: 'contract-sent',
        tier: undefined,
        contractValue: 0,
      }),
      error: undefined,
    })
    await expect(
      createCaller(mockOrganizer).sponsor.crm.updateSignatureStatus({
        id: 'sfc-1',
        newStatus: 'signed',
      }),
    ).rejects.toThrow(/tier|value|contact/i)
    expect(commit).not.toHaveBeenCalled()
  })

  it('rejects marking the signature signed on a closed-lost deal', async () => {
    const { commit } = mockPatch()
    vi.mocked(getSponsorForConference).mockResolvedValue({
      sponsorForConference: makeSfc({
        contractStatus: 'contract-sent',
        tier,
        contractValue: 50000,
        contactPersons: primaryContact,
        status: 'closed-lost',
      }),
      error: undefined,
    })
    await expect(
      createCaller(mockOrganizer).sponsor.crm.updateSignatureStatus({
        id: 'sfc-1',
        newStatus: 'signed',
      }),
    ).rejects.toThrow(/closed-lost|lost/i)
    expect(commit).not.toHaveBeenCalled()
  })
})

describe('sendContract — contract-sent readiness guard', () => {
  it('rejects sending a contract when the sponsor has no tier', async () => {
    vi.mocked(getSponsorForConference).mockResolvedValue({
      sponsorForConference: makeSfc({
        tier: undefined,
        contractValue: 50000,
        contactPersons: primaryContact,
      }),
      error: undefined,
    })
    await expect(
      createCaller(mockOrganizer).sponsor.crm.sendContract({
        sponsorForConferenceId: 'sfc-1',
        templateId: 'tmpl-1',
      }),
    ).rejects.toThrow(/tier/i)
    expect(getContractTemplate).not.toHaveBeenCalled()
  })

  it('rejects sending a contract when the contract value is not set', async () => {
    vi.mocked(getSponsorForConference).mockResolvedValue({
      sponsorForConference: makeSfc({
        tier,
        contractValue: 0,
        contactPersons: primaryContact,
      }),
      error: undefined,
    })
    await expect(
      createCaller(mockOrganizer).sponsor.crm.sendContract({
        sponsorForConferenceId: 'sfc-1',
        templateId: 'tmpl-1',
      }),
    ).rejects.toThrow(/value/i)
    expect(getContractTemplate).not.toHaveBeenCalled()
  })

  it('rejects sending a contract on a closed-lost deal', async () => {
    vi.mocked(getSponsorForConference).mockResolvedValue({
      sponsorForConference: makeSfc({
        tier,
        contractValue: 50000,
        status: 'closed-lost',
        contactPersons: primaryContact,
      }),
      error: undefined,
    })
    await expect(
      createCaller(mockOrganizer).sponsor.crm.sendContract({
        sponsorForConferenceId: 'sfc-1',
        templateId: 'tmpl-1',
      }),
    ).rejects.toThrow(/closed-lost|lost/i)
    expect(getContractTemplate).not.toHaveBeenCalled()
  })
})
