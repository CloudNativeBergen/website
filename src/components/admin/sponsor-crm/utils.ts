import type {
  InvoiceStatus,
  SponsorForConferenceExpanded,
  ActivityType,
} from '@/lib/sponsor-crm/types'
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
  }
}

// Sponsor Value Calculation
export function calculateSponsorValue(sponsor: SponsorForConferenceExpanded): {
  value: number
  currency: string
} {
  let value = 0
  let currency = 'NOK'

  if (sponsor.contract_value) {
    value = sponsor.contract_value
    currency = sponsor.contract_currency || 'NOK'
  } else if (sponsor.tier?.price?.[0]?.amount) {
    value = sponsor.tier.price[0].amount
    currency = sponsor.tier.price[0].currency || 'NOK'
  }

  return { value, currency }
}
