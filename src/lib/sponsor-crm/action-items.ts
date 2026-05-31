import type { SponsorForConferenceExpanded } from './types'
import {
  type ActionItemType,
  calculateSponsorValue,
} from '@/components/admin/sponsor-crm/utils'
import { formatNumber } from '@/lib/format'

export interface ActionItem {
  id: string
  type: ActionItemType
  title: string
  sponsor: {
    id: string
    name: string
  }
  assignedTo?: {
    name: string
    image?: string
  }
  description: string
  priority: number
  link: string
}

/**
 * Generates action items for sponsors based on their status.
 * Optionally filters by organizer. Returns all items sorted by priority.
 */
export function generateActionItems(
  sponsors: SponsorForConferenceExpanded[],
  organizerId?: string,
): ActionItem[] {
  const now = new Date()
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)

  const actions: ActionItem[] = []

  sponsors.forEach((sponsor) => {
    if (organizerId && sponsor.assignedTo?._id !== organizerId) {
      return
    }

    const assignedTo = sponsor.assignedTo
      ? { name: sponsor.assignedTo.name, image: sponsor.assignedTo.image }
      : undefined

    const link = `/admin/sponsors/crm?sponsor=${sponsor._id}`
    const name = sponsor.sponsor.name

    // Priority 1: Overdue invoices
    if (sponsor.invoiceStatus === 'overdue') {
      actions.push({
        id: `${sponsor._id}-overdue`,
        type: 'overdue',
        title: 'Invoice Overdue',
        sponsor: { id: sponsor._id, name },
        assignedTo,
        description: `Invoice is overdue for ${name}`,
        priority: 1,
        link,
      })
    }

    // Priority 1.5: High-priority sponsors not yet contacted
    if (
      sponsor.status === 'prospect' &&
      sponsor.tags?.includes('high-priority')
    ) {
      actions.push({
        id: `${sponsor._id}-high-priority`,
        type: 'high-priority',
        title: 'Urgent Prospect',
        sponsor: { id: sponsor._id, name },
        assignedTo,
        description: `${name} is a high-priority prospect not yet contacted`,
        priority: 1.5,
        link,
      })
    }

    // Priority 1.7: High-value prospects not yet contacted
    const { value, currency } = calculateSponsorValue(sponsor)
    if (sponsor.status === 'prospect' && currency === 'NOK' && value >= 50000) {
      actions.push({
        id: `${sponsor._id}-high-value`,
        type: 'high-priority',
        title: 'High Value Prospect',
        sponsor: { id: sponsor._id, name },
        assignedTo,
        description: `${name} is a high-value prospect (${formatNumber(value)} NOK) not yet contacted`,
        priority: 1.7,
        link,
      })
    }

    // Priority 2: Follow-up due (scheduled date passed)
    if (sponsor.nextFollowUpAt) {
      const followUpDate = new Date(sponsor.nextFollowUpAt)
      if (followUpDate <= now) {
        actions.push({
          id: `${sponsor._id}-follow-up-due`,
          type: 'follow-up',
          title: 'Follow-up Due',
          sponsor: { id: sponsor._id, name },
          assignedTo,
          description: `Scheduled follow-up with ${name} is due`,
          priority: 2,
          link,
        })
      }
    }

    // Priority 2: Invoice not sent for closed deals with signed contract
    if (
      sponsor.status === 'closed-won' &&
      sponsor.contractValue &&
      sponsor.contractStatus === 'contract-signed' &&
      sponsor.invoiceStatus === 'not-sent'
    ) {
      actions.push({
        id: `${sponsor._id}-needs-invoice`,
        type: 'needs-invoice',
        title: 'Invoice Not Sent',
        sponsor: { id: sponsor._id, name },
        assignedTo,
        description: `Invoice not yet sent to ${name}`,
        priority: 2,
        link,
      })
    }

    // Priority 2: Registration complete — send contract
    if (
      sponsor.registrationComplete &&
      sponsor.contractStatus !== 'contract-sent' &&
      sponsor.contractStatus !== 'contract-signed'
    ) {
      actions.push({
        id: `${sponsor._id}-registration-complete`,
        type: 'registration-complete',
        title: 'Send Contract',
        sponsor: { id: sponsor._id, name },
        assignedTo,
        description: `${name} completed registration — generate and send the contract`,
        priority: 2,
        link,
      })
    }

    // Priority 2.5: Rejected digital signature
    if (sponsor.signatureStatus === 'rejected') {
      actions.push({
        id: `${sponsor._id}-sig-rejected`,
        type: 'signature-rejected',
        title: 'Signature Rejected',
        sponsor: { id: sponsor._id, name },
        assignedTo,
        description: `${name} rejected the contract signature`,
        priority: 2.5,
        link,
      })
    }

    // Priority 3: Closed deal without contract status set
    if (sponsor.status === 'closed-won' && sponsor.contractStatus === 'none') {
      actions.push({
        id: `${sponsor._id}-needs-contract`,
        type: 'needs-contract',
        title: 'Contract Needed',
        sponsor: { id: sponsor._id, name },
        assignedTo,
        description: `Deal closed but no contract status set for ${name}`,
        priority: 3,
        link,
      })
    }

    // Priority 3: Missing contact info for active leads
    if (
      ['prospect', 'contacted'].includes(sponsor.status) &&
      (!sponsor.contactPersons || sponsor.contactPersons.length === 0)
    ) {
      actions.push({
        id: `${sponsor._id}-missing-contact`,
        type: 'missing-contact',
        title: 'No Contact Info',
        sponsor: { id: sponsor._id, name },
        assignedTo,
        description: `${name} has no contact persons — find and add contact details`,
        priority: 3,
        link,
      })
    }

    // Priority 3.5: Expired digital signature
    if (sponsor.signatureStatus === 'expired') {
      actions.push({
        id: `${sponsor._id}-sig-expired`,
        type: 'signature-expired',
        title: 'Signature Expired',
        sponsor: { id: sponsor._id, name },
        assignedTo,
        description: `Contract signature expired for ${name}`,
        priority: 3.5,
        link,
      })
    }

    // Priority 4: Contract in progress (not signed yet)
    if (
      sponsor.status === 'closed-won' &&
      sponsor.contractStatus &&
      sponsor.contractStatus !== 'contract-signed' &&
      sponsor.contractStatus !== 'none'
    ) {
      actions.push({
        id: `${sponsor._id}-missing-contract`,
        type: 'missing-contract',
        title:
          sponsor.contractStatus === 'contract-sent'
            ? 'Awaiting Signature'
            : 'Contract In Progress',
        sponsor: { id: sponsor._id, name },
        assignedTo,
        description:
          sponsor.contractStatus === 'contract-sent'
            ? `Contract sent, awaiting signature from ${name}`
            : `Contract status: ${sponsor.contractStatus.replace('-', ' ')} for ${name}`,
        priority: 4,
        link,
      })
    }

    // Priority 4.5: Sponsors tagged needs-follow-up (without a scheduled date)
    if (sponsor.tags?.includes('needs-follow-up') && !sponsor.nextFollowUpAt) {
      actions.push({
        id: `${sponsor._id}-follow-up`,
        type: 'follow-up',
        title: 'Follow-up Needed',
        sponsor: { id: sponsor._id, name },
        assignedTo,
        description: `${name} is marked for follow-up — consider setting a follow-up date`,
        priority: 4.5,
        link,
      })
    }

    // Priority 5: Stale negotiations (no activity in 7+ days)
    if (['contacted', 'negotiating'].includes(sponsor.status)) {
      const lastAt = sponsor.lastActivity?.createdAt || sponsor._updatedAt
      if (new Date(lastAt) < sevenDaysAgo) {
        actions.push({
          id: `${sponsor._id}-stale`,
          type: 'stale',
          title: 'Stale Negotiation',
          sponsor: { id: sponsor._id, name },
          assignedTo,
          description: `No activity in 7+ days with ${name}`,
          priority: 5,
          link,
        })
      }
    }

    // Priority 5.5: Stale prospects (no activity in 14+ days)
    if (
      sponsor.status === 'prospect' &&
      !sponsor.tags?.includes('high-priority')
    ) {
      const lastAt = sponsor.lastActivity?.createdAt || sponsor._updatedAt
      if (new Date(lastAt) < fourteenDaysAgo) {
        actions.push({
          id: `${sponsor._id}-stale-prospect`,
          type: 'stale',
          title: 'Stale Prospect',
          sponsor: { id: sponsor._id, name },
          assignedTo,
          description: `No activity in 14+ days with prospect ${name}`,
          priority: 5.5,
          link,
        })
      }
    }

    // Priority 6: Registration not completed for closed-won sponsors
    if (
      sponsor.status === 'closed-won' &&
      sponsor.registrationToken &&
      !sponsor.registrationComplete
    ) {
      actions.push({
        id: `${sponsor._id}-registration-pending`,
        type: 'registration-pending',
        title: 'Registration Pending',
        sponsor: { id: sponsor._id, name },
        assignedTo,
        description: `${name} has not completed registration`,
        priority: 6,
        link,
      })
    }
  })

  return actions.sort((a, b) => a.priority - b.priority)
}
