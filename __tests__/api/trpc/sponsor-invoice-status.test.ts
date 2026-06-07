import { describe, it, expect, vi, beforeEach } from 'vitest'
import { appRouter } from '@/server/_app'
import {
  getSponsorForConference,
  updateSponsorForConference,
} from '@/lib/sponsor-crm/sanity'
import type { SponsorForConferenceExpanded } from '@/lib/sponsor-crm/types'

import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
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

describe('updateInvoiceStatus mutation', () => {
  let caller: ReturnType<typeof appRouter.createCaller>

  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(getConferenceForCurrentDomain).mockResolvedValue({
      conference: { _id: 'conf-1' } as any,
      domain: 'test.com',
      error: null,
    })
    caller = appRouter.createCaller({
      session: {
        user: { id: 'u1', email: 'org@test.com', name: 'Org' } as any,
        speaker: mockOrganizer as any,
        expires: '1',
      },
      speaker: mockOrganizer as any,
      user: { id: 'u1', email: 'org@test.com', name: 'Org' } as any,
    } as any)
    vi.mocked(updateSponsorForConference).mockResolvedValue({
      sponsorForConference: makeSfc(),
    })
  })

  it('rejects moving to sent if contract value is missing', async () => {
    vi.mocked(getSponsorForConference).mockResolvedValue({
      sponsorForConference: makeSfc({
        invoiceStatus: 'not-sent',
        contractValue: undefined,
        contractCurrency: 'NOK',
        billing: { invoiceFormat: 'ehf', email: 'bill@test.com' },
        contractStatus: 'contract-signed',
      }),
    })

    const promise = caller.sponsor.crm.updateInvoiceStatus({
      id: 'sfc-1',
      newStatus: 'sent',
    })
    await expect(promise).rejects.toThrow(/contract value/i)
  })

  it('rejects moving to sent if contract is not signed', async () => {
    vi.mocked(getSponsorForConference).mockResolvedValue({
      sponsorForConference: makeSfc({
        invoiceStatus: 'not-sent',
        contractValue: 100,
        contractCurrency: 'NOK',
        billing: { invoiceFormat: 'ehf', email: 'bill@test.com' },
        contractStatus: 'contract-sent', // not signed
      }),
    })

    const promise = caller.sponsor.crm.updateInvoiceStatus({
      id: 'sfc-1',
      newStatus: 'sent',
    })
    await expect(promise).rejects.toThrow(/contract must be signed/i)
  })

  it('allows moving to sent if all invariants are met', async () => {
    vi.mocked(getSponsorForConference).mockResolvedValue({
      sponsorForConference: makeSfc({
        invoiceStatus: 'not-sent',
        contractValue: 100,
        contractCurrency: 'NOK',
        billing: { invoiceFormat: 'ehf', email: 'bill@test.com' },
        contractStatus: 'contract-signed',
      }),
    })

    await expect(
      caller.sponsor.crm.updateInvoiceStatus({
        id: 'sfc-1',
        newStatus: 'sent',
      }),
    ).resolves.not.toThrow()

    expect(updateSponsorForConference).toHaveBeenCalledWith(
      'sfc-1',
      expect.objectContaining({
        invoiceStatus: 'sent',
      }),
    )
  })

  it('rejects moving to paid if invoice is not sent', async () => {
    vi.mocked(getSponsorForConference).mockResolvedValue({
      sponsorForConference: makeSfc({
        invoiceStatus: 'not-sent', // not sent yet!
        contractValue: 100,
        contractCurrency: 'NOK',
        billing: { invoiceFormat: 'ehf', email: 'bill@test.com' },
        contractStatus: 'contract-signed',
      }),
    })

    const promise = caller.sponsor.crm.updateInvoiceStatus({
      id: 'sfc-1',
      newStatus: 'paid',
    })
    await expect(promise).rejects.toThrow(/must be sent or overdue before/i)
  })

  it('allows moving to paid if invoice is sent', async () => {
    vi.mocked(getSponsorForConference).mockResolvedValue({
      sponsorForConference: makeSfc({
        invoiceStatus: 'sent',
      }),
    })

    await expect(
      caller.sponsor.crm.updateInvoiceStatus({
        id: 'sfc-1',
        newStatus: 'paid',
      }),
    ).resolves.not.toThrow()
  })

  it('allows cancelling from any state without throwing guards', async () => {
    vi.mocked(getSponsorForConference).mockResolvedValue({
      sponsorForConference: makeSfc({
        invoiceStatus: 'not-sent',
        contractValue: undefined, // normally invalid for 'sent'
        contractStatus: 'none', // normally invalid for 'sent'
      }),
    })

    await expect(
      caller.sponsor.crm.updateInvoiceStatus({
        id: 'sfc-1',
        newStatus: 'cancelled',
      }),
    ).resolves.not.toThrow()
  })
})
