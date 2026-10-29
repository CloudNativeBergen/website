import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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

// Org-scoped organizer: `organizerOrgIds` must contain the org the request
// resolves to (the domain conference's organization), since that membership is
// the whole authz decision.
const mockOrganizer = {
  _id: 'org-1',
  name: 'Org',
  email: 'org@test.com',
  isOrganizer: true,
  organizerOrgIds: ['org-test'],
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
      conference: {
        _id: 'conf-1',
        organization: { _type: 'reference', _ref: 'org-test' },
      } as any,
      domain: 'test.com',
      error: null,
      status: 'resolved' as const,
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
        contractValue: 100,
        contractCurrency: 'NOK',
        billing: { invoiceFormat: 'ehf', email: 'bill@test.com' },
        contractStatus: 'contract-signed',
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

  describe('invoice due date', () => {
    const signed = {
      invoiceStatus: 'not-sent' as const,
      contractValue: 100,
      contractCurrency: 'NOK' as const,
      billing: { invoiceFormat: 'ehf' as const, email: 'bill@test.com' },
      contractStatus: 'contract-signed' as const,
    }

    afterEach(() => vi.useRealTimers())

    it('sets the due date 30 Oslo days after sending', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      // 23:30 UTC on 1 Oct is already 2 Oct in Oslo.
      vi.setSystemTime(new Date('2026-10-01T23:30:00Z'))
      vi.mocked(getSponsorForConference).mockResolvedValue({
        sponsorForConference: makeSfc(signed),
      })
      await caller.sponsor.crm.updateInvoiceStatus({
        id: 'sfc-1',
        newStatus: 'sent',
      })
      // Across the end of summer time (25 Oct) the day does not shift.
      expect(updateSponsorForConference).toHaveBeenCalledWith(
        'sfc-1',
        expect.objectContaining({ invoiceDueAt: '2026-11-01' }),
      )
    })

    it('keeps an existing due date', async () => {
      vi.mocked(getSponsorForConference).mockResolvedValue({
        sponsorForConference: makeSfc({
          ...signed,
          invoiceStatus: 'overdue',
          invoiceDueAt: '2026-01-15',
        }),
      })
      await caller.sponsor.crm.updateInvoiceStatus({
        id: 'sfc-1',
        newStatus: 'sent',
      })
      const data = vi.mocked(updateSponsorForConference).mock.calls[0][1]
      expect(data).not.toHaveProperty('invoiceDueAt')
    })

    it('crm.update sets the due date on sent unless one is set', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-03-28T12:00:00Z'))
      vi.mocked(getSponsorForConference).mockResolvedValue({
        sponsorForConference: makeSfc(signed),
      })
      await caller.sponsor.crm.update({ id: 'sfc-1', invoiceStatus: 'sent' })
      expect(updateSponsorForConference).toHaveBeenLastCalledWith(
        'sfc-1',
        expect.objectContaining({ invoiceDueAt: '2026-04-27' }),
      )

      await caller.sponsor.crm.update({
        id: 'sfc-1',
        invoiceStatus: 'sent',
        invoiceDueAt: '2026-05-10',
      })
      expect(updateSponsorForConference).toHaveBeenLastCalledWith(
        'sfc-1',
        expect.objectContaining({ invoiceDueAt: '2026-05-10' }),
      )
    })
  })
})
