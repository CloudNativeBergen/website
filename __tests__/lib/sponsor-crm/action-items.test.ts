import { describe, it, expect } from '@jest/globals'
import { generateActionItems } from '@/lib/sponsor-crm/action-items'
import type { SponsorForConferenceExpanded } from '@/lib/sponsor-crm/types'

function createSponsor(
  overrides: Partial<SponsorForConferenceExpanded> = {},
): SponsorForConferenceExpanded {
  return {
    _id: 'sfc-1',
    _createdAt: '2026-01-01T00:00:00Z',
    _updatedAt: new Date().toISOString(),
    sponsor: {
      _id: 's1',
      name: 'Acme Corp',
      website: 'https://acme.com',
      logo: '<svg></svg>',
    },
    conference: { _id: 'c1', title: 'Conf' },
    contractStatus: 'none',
    status: 'prospect',
    invoiceStatus: 'not-sent',
    contractCurrency: 'NOK',
    ...overrides,
  }
}

describe('generateActionItems', () => {
  it('returns empty array for empty input', () => {
    expect(generateActionItems([])).toEqual([])
  })

  it('returns empty array when no conditions match', () => {
    const sponsor = createSponsor({ status: 'prospect' })
    const items = generateActionItems([sponsor])
    // prospect with no special tags/value generates nothing
    expect(items).toEqual([])
  })

  describe('overdue invoices (priority 1)', () => {
    it('generates action item for overdue invoice', () => {
      const sponsor = createSponsor({ invoiceStatus: 'overdue' })
      const items = generateActionItems([sponsor])

      expect(items).toContainEqual(
        expect.objectContaining({
          type: 'overdue',
          title: 'Invoice Overdue',
          priority: 1,
          sponsor: { id: 'sfc-1', name: 'Acme Corp' },
        }),
      )
    })
  })

  describe('high-priority prospects (priority 1.5)', () => {
    it('generates action item for high-priority prospect', () => {
      const sponsor = createSponsor({
        status: 'prospect',
        tags: ['high-priority'],
      })
      const items = generateActionItems([sponsor])

      expect(items).toContainEqual(
        expect.objectContaining({
          type: 'high-priority',
          title: 'Urgent Prospect',
          priority: 1.5,
        }),
      )
    })

    it('does not flag high-priority tag for non-prospect status', () => {
      const sponsor = createSponsor({
        status: 'contacted',
        tags: ['high-priority'],
      })
      const items = generateActionItems([sponsor])

      expect(items).not.toContainEqual(
        expect.objectContaining({ title: 'Urgent Prospect' }),
      )
    })
  })

  describe('high-value prospects (priority 1.7)', () => {
    it('generates action item for prospect with value >= 50000 NOK', () => {
      const sponsor = createSponsor({
        status: 'prospect',
        contractValue: 60000,
        contractCurrency: 'NOK',
      })
      const items = generateActionItems([sponsor])

      expect(items).toContainEqual(
        expect.objectContaining({
          type: 'high-priority',
          title: 'High Value Prospect',
          priority: 1.7,
        }),
      )
    })

    it('does not trigger for value < 50000 NOK', () => {
      const sponsor = createSponsor({
        status: 'prospect',
        contractValue: 49999,
        contractCurrency: 'NOK',
      })
      const items = generateActionItems([sponsor])

      expect(items).not.toContainEqual(
        expect.objectContaining({ title: 'High Value Prospect' }),
      )
    })

    it('does not trigger for non-NOK currency', () => {
      const sponsor = createSponsor({
        status: 'prospect',
        contractValue: 100000,
        contractCurrency: 'USD',
      })
      const items = generateActionItems([sponsor])

      expect(items).not.toContainEqual(
        expect.objectContaining({ title: 'High Value Prospect' }),
      )
    })

    it('uses tier price when contractValue is not set', () => {
      const sponsor = createSponsor({
        status: 'prospect',
        tier: {
          _id: 't1',
          title: 'Gold',
          tagline: 'Top tier',
          tierType: 'standard',
          price: [{ _key: 'p1', amount: 75000, currency: 'NOK' }],
        },
      })
      const items = generateActionItems([sponsor])

      expect(items).toContainEqual(
        expect.objectContaining({ title: 'High Value Prospect' }),
      )
    })
  })

  describe('invoice not sent for closed-won (priority 2)', () => {
    it('generates action item when deal closed but invoice not sent', () => {
      const sponsor = createSponsor({
        status: 'closed-won',
        contractValue: 50000,
        invoiceStatus: 'not-sent',
      })
      const items = generateActionItems([sponsor])

      expect(items).toContainEqual(
        expect.objectContaining({
          type: 'needs-invoice',
          title: 'Invoice Not Sent',
          priority: 2,
        }),
      )
    })

    it('does not trigger when invoice already sent', () => {
      const sponsor = createSponsor({
        status: 'closed-won',
        contractValue: 50000,
        invoiceStatus: 'sent',
      })
      const items = generateActionItems([sponsor])

      expect(items).not.toContainEqual(
        expect.objectContaining({ type: 'needs-invoice' }),
      )
    })

    it('does not trigger without contractValue', () => {
      const sponsor = createSponsor({
        status: 'closed-won',
        invoiceStatus: 'not-sent',
      })
      const items = generateActionItems([sponsor])

      expect(items).not.toContainEqual(
        expect.objectContaining({ type: 'needs-invoice' }),
      )
    })
  })

  describe('registration complete — send contract (priority 2)', () => {
    it('generates action item when registration is complete but no contract sent', () => {
      const sponsor = createSponsor({
        registrationComplete: true,
        contractStatus: 'none',
      })
      const items = generateActionItems([sponsor])

      expect(items).toContainEqual(
        expect.objectContaining({
          type: 'registration-complete',
          title: 'Send Contract',
          priority: 2,
        }),
      )
    })

    it('does not trigger when contract already sent', () => {
      const sponsor = createSponsor({
        registrationComplete: true,
        contractStatus: 'contract-sent',
      })
      const items = generateActionItems([sponsor])

      expect(items).not.toContainEqual(
        expect.objectContaining({ type: 'registration-complete' }),
      )
    })

    it('does not trigger when contract already signed', () => {
      const sponsor = createSponsor({
        registrationComplete: true,
        contractStatus: 'contract-signed',
      })
      const items = generateActionItems([sponsor])

      expect(items).not.toContainEqual(
        expect.objectContaining({ type: 'registration-complete' }),
      )
    })
  })

  describe('signature rejected (priority 2.5)', () => {
    it('generates action item when signature is rejected', () => {
      const sponsor = createSponsor({ signatureStatus: 'rejected' })
      const items = generateActionItems([sponsor])

      expect(items).toContainEqual(
        expect.objectContaining({
          type: 'signature-rejected',
          title: 'Signature Rejected',
          priority: 2.5,
        }),
      )
    })
  })

  describe('needs contract (priority 3)', () => {
    it('generates action item for closed-won with no contract status', () => {
      const sponsor = createSponsor({
        status: 'closed-won',
        contractStatus: 'none',
      })
      const items = generateActionItems([sponsor])

      expect(items).toContainEqual(
        expect.objectContaining({
          type: 'needs-contract',
          title: 'Contract Needed',
          priority: 3,
        }),
      )
    })
  })

  describe('signature expired (priority 3.5)', () => {
    it('generates action item when signature has expired', () => {
      const sponsor = createSponsor({ signatureStatus: 'expired' })
      const items = generateActionItems([sponsor])

      expect(items).toContainEqual(
        expect.objectContaining({
          type: 'signature-expired',
          title: 'Signature Expired',
          priority: 3.5,
        }),
      )
    })
  })

  describe('contract in progress (priority 4)', () => {
    it('generates action item for contract-sent status', () => {
      const sponsor = createSponsor({
        status: 'closed-won',
        contractStatus: 'contract-sent',
      })
      const items = generateActionItems([sponsor])

      expect(items).toContainEqual(
        expect.objectContaining({
          type: 'missing-contract',
          title: 'Awaiting Signature',
          priority: 4,
        }),
      )
    })

    it('generates action item for verbal-agreement status', () => {
      const sponsor = createSponsor({
        status: 'closed-won',
        contractStatus: 'verbal-agreement',
      })
      const items = generateActionItems([sponsor])

      expect(items).toContainEqual(
        expect.objectContaining({
          type: 'missing-contract',
          title: 'Contract In Progress',
          priority: 4,
        }),
      )
    })

    it('does not trigger for contract-signed', () => {
      const sponsor = createSponsor({
        status: 'closed-won',
        contractStatus: 'contract-signed',
      })
      const items = generateActionItems([sponsor])

      expect(items).not.toContainEqual(
        expect.objectContaining({ type: 'missing-contract' }),
      )
    })
  })

  describe('follow-up needed (priority 4.5)', () => {
    it('generates action item for sponsors tagged needs-follow-up', () => {
      const sponsor = createSponsor({ tags: ['needs-follow-up'] })
      const items = generateActionItems([sponsor])

      expect(items).toContainEqual(
        expect.objectContaining({
          type: 'follow-up',
          title: 'Follow-up Needed',
          priority: 4.5,
        }),
      )
    })
  })

  describe('stale negotiations (priority 5)', () => {
    it('generates action item for negotiation stale > 7 days', () => {
      const eightDaysAgo = new Date(
        Date.now() - 8 * 24 * 60 * 60 * 1000,
      ).toISOString()
      const sponsor = createSponsor({
        status: 'negotiating',
        _updatedAt: eightDaysAgo,
      })
      const items = generateActionItems([sponsor])

      expect(items).toContainEqual(
        expect.objectContaining({
          type: 'stale',
          title: 'Stale Negotiation',
          priority: 5,
        }),
      )
    })

    it('does not trigger for recently updated negotiations', () => {
      const sponsor = createSponsor({
        status: 'negotiating',
        _updatedAt: new Date().toISOString(),
      })
      const items = generateActionItems([sponsor])

      expect(items).not.toContainEqual(
        expect.objectContaining({ type: 'stale' }),
      )
    })

    it('triggers for contacted status stale > 7 days', () => {
      const tenDaysAgo = new Date(
        Date.now() - 10 * 24 * 60 * 60 * 1000,
      ).toISOString()
      const sponsor = createSponsor({
        status: 'contacted',
        _updatedAt: tenDaysAgo,
      })
      const items = generateActionItems([sponsor])

      expect(items).toContainEqual(expect.objectContaining({ type: 'stale' }))
    })

    it('does not trigger for prospect status', () => {
      const tenDaysAgo = new Date(
        Date.now() - 10 * 24 * 60 * 60 * 1000,
      ).toISOString()
      const sponsor = createSponsor({
        status: 'prospect',
        _updatedAt: tenDaysAgo,
      })
      const items = generateActionItems([sponsor])

      expect(items).not.toContainEqual(
        expect.objectContaining({ type: 'stale' }),
      )
    })
  })

  describe('registration pending (priority 6)', () => {
    it('generates action item for closed-won with token but not completed', () => {
      const sponsor = createSponsor({
        status: 'closed-won',
        registrationToken: 'some-uuid-token',
        registrationComplete: false,
      })
      const items = generateActionItems([sponsor])

      expect(items).toContainEqual(
        expect.objectContaining({
          type: 'registration-pending',
          title: 'Registration Pending',
          priority: 6,
        }),
      )
    })

    it('does not trigger when registration is complete', () => {
      const sponsor = createSponsor({
        status: 'closed-won',
        registrationToken: 'some-uuid-token',
        registrationComplete: true,
      })
      const items = generateActionItems([sponsor])

      expect(items).not.toContainEqual(
        expect.objectContaining({ type: 'registration-pending' }),
      )
    })

    it('does not trigger without registrationToken', () => {
      const sponsor = createSponsor({
        status: 'closed-won',
        registrationComplete: false,
      })
      const items = generateActionItems([sponsor])

      expect(items).not.toContainEqual(
        expect.objectContaining({ type: 'registration-pending' }),
      )
    })

    it('does not trigger for non closed-won status', () => {
      const sponsor = createSponsor({
        status: 'negotiating',
        registrationToken: 'some-uuid-token',
        registrationComplete: false,
      })
      const items = generateActionItems([sponsor])

      expect(items).not.toContainEqual(
        expect.objectContaining({ type: 'registration-pending' }),
      )
    })
  })

  describe('priority ordering', () => {
    it('sorts action items by priority ascending', () => {
      const sponsors = [
        createSponsor({
          _id: 'sfc-overdue',
          invoiceStatus: 'overdue',
        }),
        createSponsor({
          _id: 'sfc-stale',
          status: 'negotiating',
          _updatedAt: new Date(
            Date.now() - 10 * 24 * 60 * 60 * 1000,
          ).toISOString(),
        }),
        createSponsor({
          _id: 'sfc-contract',
          status: 'closed-won',
          contractStatus: 'none',
        }),
      ]
      const items = generateActionItems(sponsors)

      for (let i = 1; i < items.length; i++) {
        expect(items[i].priority).toBeGreaterThanOrEqual(items[i - 1].priority)
      }
    })

    it('limits results to 5 items', () => {
      const sponsors = Array.from({ length: 10 }, (_, i) =>
        createSponsor({
          _id: `sfc-${i}`,
          invoiceStatus: 'overdue',
          status: 'closed-won',
          contractStatus: 'none',
          contractValue: 50000,
          tags: ['needs-follow-up'],
          signatureStatus: 'rejected',
        }),
      )
      const items = generateActionItems(sponsors)

      expect(items.length).toBeLessThanOrEqual(5)
    })
  })

  describe('organizer filtering', () => {
    it('only returns items for sponsored assigned to the organizer', () => {
      const assigned = createSponsor({
        _id: 'sfc-assigned',
        invoiceStatus: 'overdue',
        assignedTo: { _id: 'org-1', name: 'Alice', email: 'alice@org.com' },
      })
      const unassigned = createSponsor({
        _id: 'sfc-other',
        invoiceStatus: 'overdue',
        assignedTo: { _id: 'org-2', name: 'Bob', email: 'bob@org.com' },
      })
      const items = generateActionItems([assigned, unassigned], 'org-1')

      expect(items).toHaveLength(1)
      expect(items[0].sponsor.id).toBe('sfc-assigned')
    })

    it('excludes unassigned sponsors when filtering by organizer', () => {
      const sponsor = createSponsor({
        invoiceStatus: 'overdue',
      })
      const items = generateActionItems([sponsor], 'org-1')

      expect(items).toHaveLength(0)
    })

    it('returns items for all sponsors when no organizer specified', () => {
      const sponsors = [
        createSponsor({
          _id: 'sfc-1',
          invoiceStatus: 'overdue',
          assignedTo: { _id: 'org-1', name: 'Alice', email: 'a@org.com' },
        }),
        createSponsor({
          _id: 'sfc-2',
          invoiceStatus: 'overdue',
          assignedTo: { _id: 'org-2', name: 'Bob', email: 'b@org.com' },
        }),
      ]
      const items = generateActionItems(sponsors)

      expect(items).toHaveLength(2)
    })
  })

  describe('action item structure', () => {
    it('includes correct id format', () => {
      const sponsor = createSponsor({ invoiceStatus: 'overdue' })
      const items = generateActionItems([sponsor])

      expect(items[0].id).toBe('sfc-1-overdue')
    })

    it('includes correct link format', () => {
      const sponsor = createSponsor({ invoiceStatus: 'overdue' })
      const items = generateActionItems([sponsor])

      expect(items[0].link).toBe('/admin/sponsors/crm?sponsor=sfc-1')
    })

    it('includes sponsor name in description', () => {
      const sponsor = createSponsor({ invoiceStatus: 'overdue' })
      const items = generateActionItems([sponsor])

      expect(items[0].description).toContain('Acme Corp')
    })
  })

  describe('multiple conditions for same sponsor', () => {
    it('generates multiple action items when sponsor matches several conditions', () => {
      const sponsor = createSponsor({
        status: 'closed-won',
        contractStatus: 'none',
        contractValue: 50000,
        invoiceStatus: 'overdue',
        registrationComplete: true,
        tags: ['needs-follow-up'],
      })
      const items = generateActionItems([sponsor])

      const types = items.map((i) => i.type)
      expect(types).toContain('overdue')
      expect(types).toContain('needs-contract')
      expect(types).toContain('registration-complete')
    })
  })
})
