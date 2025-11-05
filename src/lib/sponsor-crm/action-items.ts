import type { SponsorForConferenceExpanded } from './types'
import type { ActionItemType } from '@/components/admin/sponsor-crm/utils'

export interface ActionItem {
  id: string
  type: ActionItemType
  title: string
  sponsor: {
    id: string
    name: string
  }
  description: string
  priority: number
  link: string
}

/**
 * Generates action items for sponsors based on their status
 * Optionally filters by organizer
 */
export function generateActionItems(
  sponsors: SponsorForConferenceExpanded[],
  organizerId?: string,
): ActionItem[] {
  const now = new Date()
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  const actions: ActionItem[] = []

  sponsors.forEach((sponsor) => {
    // Filter by organizer if specified
    if (organizerId && sponsor.assigned_to?._id !== organizerId) {
      return
    }

    // Priority 1: Overdue invoices
    if (sponsor.invoice_status === 'overdue') {
      actions.push({
        id: `${sponsor._id}-overdue`,
        type: 'overdue',
        title: 'Invoice Overdue',
        sponsor: {
          id: sponsor._id,
          name: sponsor.sponsor.name,
        },
        description: `Invoice is overdue for ${sponsor.sponsor.name}`,
        priority: 1,
        link: `/admin/sponsors/crm?sponsor=${sponsor._id}`,
      })
    }

    // Priority 2: Invoice not sent for closed deals with value
    if (
      sponsor.status === 'closed-won' &&
      sponsor.contract_value &&
      sponsor.invoice_status === 'not-sent'
    ) {
      actions.push({
        id: `${sponsor._id}-needs-invoice`,
        type: 'needs-invoice',
        title: 'Invoice Not Sent',
        sponsor: {
          id: sponsor._id,
          name: sponsor.sponsor.name,
        },
        description: `Invoice not yet sent to ${sponsor.sponsor.name}`,
        priority: 2,
        link: `/admin/sponsors/crm?sponsor=${sponsor._id}`,
      })
    }

    // Priority 3: Closed deal without contract status set
    if (sponsor.status === 'closed-won' && sponsor.contract_status === 'none') {
      actions.push({
        id: `${sponsor._id}-needs-contract`,
        type: 'needs-contract',
        title: 'Contract Needed',
        sponsor: {
          id: sponsor._id,
          name: sponsor.sponsor.name,
        },
        description: `Deal closed but no contract status set for ${sponsor.sponsor.name}`,
        priority: 3,
        link: `/admin/sponsors/crm?sponsor=${sponsor._id}`,
      })
    }

    // Priority 4: Contract in progress (not signed yet)
    if (
      sponsor.status === 'closed-won' &&
      sponsor.contract_status !== 'contract-signed' &&
      sponsor.contract_status !== 'none'
    ) {
      actions.push({
        id: `${sponsor._id}-missing-contract`,
        type: 'missing-contract',
        title:
          sponsor.contract_status === 'contract-sent'
            ? 'Awaiting Signature'
            : 'Contract In Progress',
        sponsor: {
          id: sponsor._id,
          name: sponsor.sponsor.name,
        },
        description:
          sponsor.contract_status === 'contract-sent'
            ? `Contract sent, awaiting signature from ${sponsor.sponsor.name}`
            : `Contract status: ${sponsor.contract_status.replace('-', ' ')} for ${sponsor.sponsor.name}`,
        priority: 4,
        link: `/admin/sponsors/crm?sponsor=${sponsor._id}`,
      })
    }

    // Priority 5: Stale negotiations (no activity in 7+ days)
    if (
      ['contacted', 'negotiating'].includes(sponsor.status) &&
      sponsor._updatedAt
    ) {
      const updatedAt = new Date(sponsor._updatedAt)
      if (updatedAt < sevenDaysAgo) {
        actions.push({
          id: `${sponsor._id}-stale`,
          type: 'stale',
          title: 'Stale Negotiation',
          sponsor: {
            id: sponsor._id,
            name: sponsor.sponsor.name,
          },
          description: `No activity in 7+ days with ${sponsor.sponsor.name}`,
          priority: 5,
          link: `/admin/sponsors/crm?sponsor=${sponsor._id}`,
        })
      }
    }
  })

  // Sort by priority and limit to top 5
  return actions.sort((a, b) => a.priority - b.priority).slice(0, 5)
}
