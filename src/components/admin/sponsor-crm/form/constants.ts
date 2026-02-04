import type {
  SponsorStatus,
  InvoiceStatus,
  ContractStatus,
  SponsorTag,
} from '@/lib/sponsor-crm/types'
import {
  UserGroupIcon,
  ChatBubbleLeftRightIcon,
  ArrowsRightLeftIcon,
  CheckCircleIcon,
  XCircleIcon,
  PaperAirplaneIcon,
  BanknotesIcon,
  ClockIcon,
  MinusCircleIcon,
  DocumentCheckIcon,
} from '@heroicons/react/24/outline'

export const STATUSES: Array<{
  value: SponsorStatus
  label: string
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
}> = [
    { value: 'prospect', label: 'Prospect', icon: UserGroupIcon },
    { value: 'contacted', label: 'Contacted', icon: ChatBubbleLeftRightIcon },
    { value: 'negotiating', label: 'Negotiating', icon: ArrowsRightLeftIcon },
    { value: 'closed-won', label: 'Won', icon: CheckCircleIcon },
    { value: 'closed-lost', label: 'Lost', icon: XCircleIcon },
  ]

export const INVOICE_STATUSES: Array<{
  value: InvoiceStatus
  label: string
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
}> = [
    { value: 'not-sent', label: 'Not Sent', icon: MinusCircleIcon },
    { value: 'sent', label: 'Sent', icon: PaperAirplaneIcon },
    { value: 'paid', label: 'Paid', icon: BanknotesIcon },
    { value: 'overdue', label: 'Overdue', icon: ClockIcon },
    { value: 'cancelled', label: 'Cancelled', icon: XCircleIcon },
  ]

export const CONTRACT_STATUSES: Array<{
  value: ContractStatus
  label: string
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
}> = [
    { value: 'none', label: 'None', icon: MinusCircleIcon },
    {
      value: 'verbal-agreement',
      label: 'Verbal Agreement',
      icon: ArrowsRightLeftIcon,
    },
    { value: 'contract-sent', label: 'Contract Sent', icon: PaperAirplaneIcon },
    {
      value: 'contract-signed',
      label: 'Contract Signed',
      icon: DocumentCheckIcon,
    },
  ]

export const TAGS: Array<{ value: SponsorTag; label: string }> = [
  { value: 'warm-lead', label: 'Warm Lead' },
  { value: 'returning-sponsor', label: 'Returning Sponsor' },
  { value: 'cold-outreach', label: 'Cold Outreach' },
  { value: 'referral', label: 'Referral' },
  { value: 'high-priority', label: 'High Priority' },
  { value: 'needs-follow-up', label: 'Needs Follow-up' },
  { value: 'multi-year-potential', label: 'Multi-year Potential' },
  { value: 'previously-declined', label: 'Previously Declined' },
]
