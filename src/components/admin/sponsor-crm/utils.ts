import type {
  InvoiceStatus,
  SponsorForConferenceExpanded,
  ActivityType,
  SignatureStatus,
} from '@/lib/sponsor-crm/types'
export { sortSponsorTiers, formatTierLabel } from '@/lib/sponsor/utils'
import {
  ExclamationTriangleIcon,
  ClockIcon,
  DocumentTextIcon,
  CheckCircleIcon,
  ArrowPathIcon,
  BanknotesIcon,
  DocumentCheckIcon,
  PencilIcon,
  ChatBubbleLeftIcon,
  PhoneIcon,
  CalendarIcon,
  FireIcon,
  ArrowPathRoundedSquareIcon,
  PaperAirplaneIcon,
  ShieldCheckIcon,
  BellAlertIcon,
} from '@heroicons/react/24/outline'

// Invoice Status Utilities
export function getInvoiceStatusColor(status: InvoiceStatus): string {
  switch (status) {
    case 'not-sent':
      return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300'
    case 'sent':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300'
    case 'paid':
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
    case 'overdue':
      return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
    case 'cancelled':
      return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300 line-through'
  }
}

export function formatInvoiceStatusLabel(status: InvoiceStatus): string {
  return status
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

// Generic Status Formatting
export function formatStatusName(status: string): string {
  return status
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

// Activity Type Utilities
export function getActivityIcon(type: ActivityType) {
  switch (type) {
    case 'stage_change':
      return ArrowPathIcon
    case 'invoice_status_change':
      return BanknotesIcon
    case 'contract_status_change':
      return DocumentCheckIcon
    case 'contract_signed':
      return CheckCircleIcon
    case 'note':
      return PencilIcon
    case 'email':
      return ChatBubbleLeftIcon
    case 'call':
      return PhoneIcon
    case 'meeting':
      return CalendarIcon
    case 'signature_status_change':
      return ShieldCheckIcon
    case 'onboarding_complete':
      return CheckCircleIcon
    case 'contract_reminder_sent':
      return BellAlertIcon
  }
}

export function getActivityColor(type: ActivityType): string {
  switch (type) {
    case 'stage_change':
      return 'text-blue-600 bg-blue-100 dark:text-blue-400 dark:bg-blue-900/20'
    case 'invoice_status_change':
      return 'text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900/20'
    case 'contract_status_change':
      return 'text-purple-600 bg-purple-100 dark:text-purple-400 dark:bg-purple-900/20'
    case 'contract_signed':
      return 'text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900/20'
    case 'note':
      return 'text-gray-600 bg-gray-100 dark:text-gray-400 dark:bg-gray-700'
    case 'email':
      return 'text-indigo-600 bg-indigo-100 dark:text-indigo-400 dark:bg-indigo-900/20'
    case 'call':
      return 'text-orange-600 bg-orange-100 dark:text-orange-400 dark:bg-orange-900/20'
    case 'meeting':
      return 'text-pink-600 bg-pink-100 dark:text-pink-400 dark:bg-pink-900/20'
    case 'signature_status_change':
      return 'text-cyan-600 bg-cyan-100 dark:text-cyan-400 dark:bg-cyan-900/20'
    case 'onboarding_complete':
      return 'text-emerald-600 bg-emerald-100 dark:text-emerald-400 dark:bg-emerald-900/20'
    case 'contract_reminder_sent':
      return 'text-amber-600 bg-amber-100 dark:text-amber-400 dark:bg-amber-900/20'
  }
}

// Action Item Type Utilities
export type ActionItemType =
  | 'overdue'
  | 'needs-contract'
  | 'awaiting-signature'
  | 'needs-invoice'
  | 'missing-contract'
  | 'stale'
  | 'high-priority'
  | 'follow-up'
  | 'signature-rejected'
  | 'signature-expired'
  | 'onboarding-pending'

export function getActionItemIcon(type: ActionItemType) {
  switch (type) {
    case 'overdue':
      return ExclamationTriangleIcon
    case 'needs-contract':
    case 'missing-contract':
      return DocumentTextIcon
    case 'awaiting-signature':
      return ClockIcon
    case 'needs-invoice':
      return DocumentTextIcon
    case 'stale':
      return CheckCircleIcon
    case 'high-priority':
      return FireIcon
    case 'follow-up':
      return ArrowPathRoundedSquareIcon
    case 'signature-rejected':
      return ExclamationTriangleIcon
    case 'signature-expired':
      return ClockIcon
    case 'onboarding-pending':
      return PaperAirplaneIcon
  }
}

export function getActionItemColor(type: ActionItemType): string {
  switch (type) {
    case 'overdue':
      return 'text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900/20'
    case 'needs-contract':
    case 'missing-contract':
      return 'text-orange-600 bg-orange-100 dark:text-orange-400 dark:bg-orange-900/20'
    case 'awaiting-signature':
      return 'text-yellow-600 bg-yellow-100 dark:text-yellow-400 dark:bg-yellow-900/20'
    case 'needs-invoice':
      return 'text-blue-600 bg-blue-100 dark:text-blue-400 dark:bg-blue-900/20'
    case 'stale':
      return 'text-gray-600 bg-gray-100 dark:text-gray-400 dark:bg-gray-700'
    case 'high-priority':
      return 'text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900/20'
    case 'follow-up':
      return 'text-indigo-600 bg-indigo-100 dark:text-indigo-400 dark:bg-indigo-900/20'
    case 'signature-rejected':
      return 'text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900/20'
    case 'signature-expired':
      return 'text-orange-600 bg-orange-100 dark:text-orange-400 dark:bg-orange-900/20'
    case 'onboarding-pending':
      return 'text-blue-600 bg-blue-100 dark:text-blue-400 dark:bg-blue-900/20'
  }
}

// Signature Status Utilities
export function getSignatureStatusColor(status: SignatureStatus): string {
  switch (status) {
    case 'not-started':
      return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300'
    case 'pending':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300'
    case 'signed':
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
    case 'rejected':
      return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
    case 'expired':
      return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300'
  }
}

// Sponsor Value Calculation
export function calculateSponsorValue(sponsor: SponsorForConferenceExpanded): {
  value: number
  currency: string
} {
  let value = 0
  let currency = 'NOK'

  if (sponsor.contractValue) {
    value = sponsor.contractValue
    currency = sponsor.contractCurrency || 'NOK'
  } else if (sponsor.tier?.price?.[0]?.amount) {
    value = sponsor.tier.price[0].amount
    currency = sponsor.tier.price[0].currency || 'NOK'
  }

  return { value, currency }
}
