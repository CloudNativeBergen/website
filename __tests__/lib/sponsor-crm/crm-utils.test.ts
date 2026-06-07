import {
  formatStatusName,
  formatInvoiceStatusLabel,
  getInvoiceStatusColor,
  calculateSponsorValue,
  getSignatureStatusBadgeProps,
  getDaysPending,
  getActivityColor,
  checkSponsorNeedsFollowUp,
} from '@/components/admin/sponsor-crm/utils'
import type {
  InvoiceStatus,
  SignatureStatus,
  ActivityType,
  SponsorForConferenceExpanded,
} from '@/lib/sponsor-crm/types'

describe('CRM Utils', () => {
  describe('formatStatusName', () => {
    it('capitalizes single word', () => {
      expect(formatStatusName('prospect')).toBe('Prospect')
    })

    it('capitalizes each word separated by hyphens', () => {
      expect(formatStatusName('closed-won')).toBe('Closed Won')
    })

    it('handles multi-segment status', () => {
      expect(formatStatusName('contract-sent')).toBe('Contract Sent')
    })

    it('handles single character segments', () => {
      expect(formatStatusName('a-b')).toBe('A B')
    })
  })

  describe('formatInvoiceStatusLabel', () => {
    it('formats not-sent', () => {
      expect(formatInvoiceStatusLabel('not-sent')).toBe('Not Sent')
    })

    it('formats paid', () => {
      expect(formatInvoiceStatusLabel('paid')).toBe('Paid')
    })

    it('formats overdue', () => {
      expect(formatInvoiceStatusLabel('overdue')).toBe('Overdue')
    })
  })

  describe('getInvoiceStatusColor', () => {
    it('returns classes for each invoice status', () => {
      const statuses: InvoiceStatus[] = [
        'not-sent',
        'sent',
        'paid',
        'overdue',
        'cancelled',
      ]
      for (const status of statuses) {
        const result = getInvoiceStatusColor(status)
        expect(result).toBeDefined()
        expect(result.length).toBeGreaterThan(0)
      }
    })

    it('returns green classes for paid status', () => {
      const result = getInvoiceStatusColor('paid')
      expect(result).toContain('green')
    })

    it('returns red classes for overdue status', () => {
      const result = getInvoiceStatusColor('overdue')
      expect(result).toContain('red')
    })

    it('includes line-through for cancelled', () => {
      const result = getInvoiceStatusColor('cancelled')
      expect(result).toContain('line-through')
    })
  })

  describe('calculateSponsorValue', () => {
    const baseSponsor: SponsorForConferenceExpanded = {
      _id: 'sfc-1',
      _createdAt: '2026-01-01',
      _updatedAt: '2026-01-01',
      sponsor: {
        _id: 's1',
        name: 'Test',
        website: 'https://test.com',
        logo: '<svg></svg>',
      },
      conference: { _id: 'c1', title: 'Conf' },
      contractStatus: 'none',
      status: 'prospect',
      invoiceStatus: 'not-sent',
      contractCurrency: 'NOK',
    }

    it('returns contract value when set', () => {
      const sponsor = {
        ...baseSponsor,
        contractValue: 75000,
        contractCurrency: 'NOK' as const,
      }
      const { value, currency } = calculateSponsorValue(sponsor)
      expect(value).toBe(75000)
      expect(currency).toBe('NOK')
    })

    it('returns tier price as fallback when no contract value', () => {
      const sponsor = {
        ...baseSponsor,
        tier: {
          _id: 't1',
          title: 'Gold',
          tagline: 'Premium',
          tierType: 'standard' as const,
          price: [{ _key: 'p1', amount: 50000, currency: 'NOK' }],
        },
      }
      const { value, currency } = calculateSponsorValue(sponsor)
      expect(value).toBe(50000)
      expect(currency).toBe('NOK')
    })

    it('prefers contract value over tier price', () => {
      const sponsor = {
        ...baseSponsor,
        contractValue: 60000,
        contractCurrency: 'USD' as const,
        tier: {
          _id: 't1',
          title: 'Gold',
          tagline: 'Premium',
          tierType: 'standard' as const,
          price: [{ _key: 'p1', amount: 50000, currency: 'NOK' }],
        },
      }
      const { value, currency } = calculateSponsorValue(sponsor)
      expect(value).toBe(60000)
      expect(currency).toBe('USD')
    })

    it('returns 0 and NOK when no value source', () => {
      const { value, currency } = calculateSponsorValue(baseSponsor)
      expect(value).toBe(0)
      expect(currency).toBe('NOK')
    })

    it('defaults currency to NOK when contractCurrency missing', () => {
      const sponsor = {
        ...baseSponsor,
        contractValue: 10000,
        contractCurrency: undefined as unknown as 'NOK',
      }
      const { currency } = calculateSponsorValue(sponsor)
      expect(currency).toBe('NOK')
    })
  })

  describe('getSignatureStatusBadgeProps', () => {
    it('returns correct props for not-started', () => {
      const { label, color } = getSignatureStatusBadgeProps('not-started')
      expect(label).toBe('Not Started')
      expect(color).toBe('gray')
    })

    it('returns correct props for pending', () => {
      const { label, color } = getSignatureStatusBadgeProps('pending')
      expect(label).toBe('Pending')
      expect(color).toBe('yellow')
    })

    it('returns correct props for signed', () => {
      const { label, color } = getSignatureStatusBadgeProps('signed')
      expect(label).toBe('Signed')
      expect(color).toBe('green')
    })

    it('returns correct props for rejected', () => {
      const { label, color } = getSignatureStatusBadgeProps('rejected')
      expect(label).toBe('Rejected')
      expect(color).toBe('red')
    })

    it('returns correct props for expired', () => {
      const { label, color } = getSignatureStatusBadgeProps('expired')
      expect(label).toBe('Expired')
      expect(color).toBe('orange')
    })

    it('returns distinct colors for all statuses', () => {
      const statuses: SignatureStatus[] = [
        'not-started',
        'pending',
        'signed',
        'rejected',
        'expired',
      ]
      const colors = statuses.map((s) => getSignatureStatusBadgeProps(s).color)
      const unique = new Set(colors)
      expect(unique.size).toBe(statuses.length)
    })
  })

  describe('getDaysPending', () => {
    it('returns null when no contractSentAt', () => {
      expect(getDaysPending()).toBeNull()
      expect(getDaysPending(undefined)).toBeNull()
    })

    it('returns 0 for contract sent today', () => {
      const today = new Date().toISOString()
      const days = getDaysPending(today)
      expect(days).toBe(0)
    })

    it('returns positive number for past dates', () => {
      const threeDaysAgo = new Date(
        Date.now() - 3 * 24 * 60 * 60 * 1000,
      ).toISOString()
      const days = getDaysPending(threeDaysAgo)
      expect(days).toBe(3)
    })

    it('handles date strings in ISO format', () => {
      const fiveDaysAgo = new Date(
        Date.now() - 5 * 24 * 60 * 60 * 1000,
      ).toISOString()
      const days = getDaysPending(fiveDaysAgo)
      expect(days).toBeGreaterThanOrEqual(4)
      expect(days).toBeLessThanOrEqual(6)
    })

    it('clamps negative values to 0 for future dates', () => {
      const tomorrow = new Date(
        Date.now() + 2 * 24 * 60 * 60 * 1000,
      ).toISOString()
      const days = getDaysPending(tomorrow)
      expect(days).toBe(0)
    })
  })

  describe('getActivityColor', () => {
    it('returns color string for all activity types', () => {
      const types: ActivityType[] = [
        'stage_change',
        'invoice_status_change',
        'contract_status_change',
        'contract_signed',
        'note',
        'email',
        'call',
        'meeting',
        'signature_status_change',
        'registration_complete',
        'contract_reminder_sent',
      ]
      for (const type of types) {
        const color = getActivityColor(type)
        expect(color).toBeDefined()
        expect(color.length).toBeGreaterThan(0)
      }
    })

    it('uses distinct color families for contract types', () => {
      const contractChange = getActivityColor('contract_status_change')
      const contractSigned = getActivityColor('contract_signed')
      const signatureChange = getActivityColor('signature_status_change')

      expect(contractChange).toContain('purple')
      expect(contractSigned).toContain('green')
      expect(signatureChange).toContain('cyan')
    })

    it('returns specific color for registration_complete', () => {
      const color = getActivityColor('registration_complete')
      expect(color).toContain('emerald')
    })

    it('returns specific color for contract_reminder_sent', () => {
      const color = getActivityColor('contract_reminder_sent')
      expect(color).toContain('amber')
    })
  })

  describe('checkSponsorNeedsFollowUp', () => {
    const baseSponsor: SponsorForConferenceExpanded = {
      _id: 'sfc-1',
      _createdAt: '2026-01-01T00:00:00Z',
      _updatedAt: '2026-01-01T00:00:00Z',
      sponsor: {
        _id: 's1',
        name: 'Acme Corp',
        website: 'https://acme.com',
        logo: '<svg></svg>',
      },
      conference: { _id: 'c1', title: 'CNDN 2026' },
      contractStatus: 'none',
      status: 'prospect',
      invoiceStatus: 'not-sent',
      contractCurrency: 'NOK',
    }

    const daysAgoISO = (days: number) =>
      new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

    it('returns false when no thresholds provided', () => {
      const sponsor = { ...baseSponsor, _updatedAt: daysAgoISO(30) }
      expect(checkSponsorNeedsFollowUp(sponsor, [])).toBe(false)
      expect(checkSponsorNeedsFollowUp(sponsor, undefined)).toBe(false)
    })

    it('returns false when sponsor has no lastActivity and no _updatedAt', () => {
      const sponsor = {
        ...baseSponsor,
        _updatedAt: undefined as unknown as string,
      }
      const thresholds = [
        { stateType: 'status', stateValue: 'prospect', days: 7 },
      ]
      expect(checkSponsorNeedsFollowUp(sponsor, thresholds)).toBe(false)
    })

    it('returns true when status matches and days exceeded', () => {
      const sponsor = {
        ...baseSponsor,
        status: 'prospect' as const,
        _updatedAt: daysAgoISO(15),
      }
      const thresholds = [
        { stateType: 'status', stateValue: 'prospect', days: 14 },
      ]
      expect(checkSponsorNeedsFollowUp(sponsor, thresholds)).toBe(true)
    })

    it('returns false when status matches but days not exceeded', () => {
      const sponsor = {
        ...baseSponsor,
        status: 'prospect' as const,
        _updatedAt: daysAgoISO(5),
      }
      const thresholds = [
        { stateType: 'status', stateValue: 'prospect', days: 14 },
      ]
      expect(checkSponsorNeedsFollowUp(sponsor, thresholds)).toBe(false)
    })

    it('returns false when status does not match threshold stateValue', () => {
      const sponsor = {
        ...baseSponsor,
        status: 'contacted' as const,
        _updatedAt: daysAgoISO(30),
      }
      const thresholds = [
        { stateType: 'status', stateValue: 'prospect', days: 7 },
      ]
      expect(checkSponsorNeedsFollowUp(sponsor, thresholds)).toBe(false)
    })

    it('matches on contractStatus when stateType is contractStatus', () => {
      const sponsor = {
        ...baseSponsor,
        contractStatus: 'contract-sent' as const,
        _updatedAt: daysAgoISO(20),
      }
      const thresholds = [
        { stateType: 'contractStatus', stateValue: 'contract-sent', days: 10 },
      ]
      expect(checkSponsorNeedsFollowUp(sponsor, thresholds)).toBe(true)
    })

    it('matches on invoiceStatus when stateType is invoiceStatus', () => {
      const sponsor = {
        ...baseSponsor,
        invoiceStatus: 'sent' as const,
        _updatedAt: daysAgoISO(20),
      }
      const thresholds = [
        { stateType: 'invoiceStatus', stateValue: 'sent', days: 10 },
      ]
      expect(checkSponsorNeedsFollowUp(sponsor, thresholds)).toBe(true)
    })

    it('prefers lastActivity.createdAt over _updatedAt', () => {
      const sponsor = {
        ...baseSponsor,
        status: 'prospect' as const,
        _updatedAt: daysAgoISO(30), // stale, would trigger
        lastActivity: {
          _id: 'act-1',
          _type: 'sponsorActivity' as const,
          activityType: 'note' as const,
          description: 'recent note',
          createdAt: daysAgoISO(2), // recent, should not trigger
          sponsorForConference: { _type: 'reference' as const, _ref: 'sfc-1' },
        },
      }
      const thresholds = [
        { stateType: 'status', stateValue: 'prospect', days: 14 },
      ]
      expect(checkSponsorNeedsFollowUp(sponsor, thresholds)).toBe(false)
    })

    it('returns false on exact boundary (days === threshold.days)', () => {
      // strictly greater than, not >=
      const sponsor = {
        ...baseSponsor,
        status: 'prospect' as const,
        _updatedAt: daysAgoISO(14),
      }
      const thresholds = [
        { stateType: 'status', stateValue: 'prospect', days: 14 },
      ]
      expect(checkSponsorNeedsFollowUp(sponsor, thresholds)).toBe(false)
    })

    it('evaluates multiple thresholds and returns true on first match', () => {
      const sponsor = {
        ...baseSponsor,
        status: 'contacted' as const,
        contractStatus: 'contract-sent' as const,
        _updatedAt: daysAgoISO(20),
      }
      const thresholds = [
        { stateType: 'status', stateValue: 'prospect', days: 7 }, // no match
        { stateType: 'contractStatus', stateValue: 'contract-sent', days: 14 }, // match
      ]
      expect(checkSponsorNeedsFollowUp(sponsor, thresholds)).toBe(true)
    })
  })
})
