'use client'

import { ExclamationTriangleIcon } from '@heroicons/react/20/solid'
import type {
  SponsorForConferenceExpanded,
  SponsorStatus,
  ContractStatus,
  InvoiceStatus,
} from '@/lib/sponsor-crm/types'
import { StatusListbox } from './StatusListbox'
import { STATUSES, CONTRACT_STATUSES, INVOICE_STATUSES } from './constants'
import {
  gateOptions,
  nextStepBlockers,
  toSponsorState,
  type DealStatusFormData,
} from './deal-status'

interface DealStatusSectionProps {
  formData: DealStatusFormData
  sponsor: SponsorForConferenceExpanded | null
  onStatusChange: (value: SponsorStatus) => void
  onContractStatusChange: (value: ContractStatus) => void
  onInvoiceStatusChange: (value: InvoiceStatus) => void
  onInvoiceDueAtChange?: (value: string) => void
}

/** An amber inline hint listing the unmet prerequisites for the next step. */
function BlockerHint({ messages }: { messages: string[] | null }) {
  if (!messages || messages.length === 0) return null
  return (
    <p className="mt-1.5 flex items-start gap-1 text-xs text-amber-600 dark:text-amber-400">
      <ExclamationTriangleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{messages.join(' ')}</span>
    </p>
  )
}

/**
 * The three coordinated status tracks a sponsor advances along — Pipeline,
 * Contract, Invoice — presented as labeled controls (previously three
 * caption-less dropdowns crammed into the modal header). Illegal transitions
 * are disabled per-option with a tooltip; the next step's unmet prerequisites
 * are surfaced inline so "what's blocking me" is visible, not hover-only.
 */
export function DealStatusSection({
  formData,
  sponsor,
  onStatusChange,
  onContractStatusChange,
  onInvoiceStatusChange,
  onInvoiceDueAtChange,
}: DealStatusSectionProps) {
  const state = toSponsorState(formData, sponsor)

  // Only surface a track's next-step hint once that track is the active
  // frontier: contract work matters once the deal is Won, invoicing once the
  // contract is signed. Otherwise a fresh prospect would see premature
  // contract/invoice prerequisites styled as amber warnings. (Per-option
  // gating in the dropdowns is always active — only the inline hint is gated.)
  const showContractHint = formData.status === 'closed-won'
  const showInvoiceHint = formData.contractStatus === 'contract-signed'

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <div>
        <StatusListbox
          label="Pipeline"
          value={formData.status}
          onChange={onStatusChange}
          options={gateOptions('pipeline', formData.status, STATUSES, state)}
        />
        <BlockerHint
          messages={nextStepBlockers('pipeline', formData.status, state)}
        />
      </div>

      <div>
        <StatusListbox
          label="Contract"
          value={formData.contractStatus}
          onChange={onContractStatusChange}
          options={gateOptions(
            'contract',
            formData.contractStatus,
            CONTRACT_STATUSES,
            state,
          )}
        />
        <BlockerHint
          messages={
            showContractHint
              ? nextStepBlockers('contract', formData.contractStatus, state)
              : null
          }
        />
      </div>

      <div>
        <StatusListbox
          label="Invoice"
          value={formData.invoiceStatus}
          onChange={onInvoiceStatusChange}
          options={gateOptions(
            'invoice',
            formData.invoiceStatus,
            INVOICE_STATUSES,
            state,
          )}
        />
        <BlockerHint
          messages={
            showInvoiceHint
              ? nextStepBlockers('invoice', formData.invoiceStatus, state)
              : null
          }
        />
        {onInvoiceDueAtChange &&
          (formData.invoiceStatus === 'sent' ||
            formData.invoiceStatus === 'overdue') && (
            <label className="mt-2 block text-xs font-medium text-gray-700 dark:text-gray-300">
              Due date
              <input
                type="date"
                value={formData.invoiceDueAt ?? ''}
                onChange={(e) => onInvoiceDueAtChange(e.target.value)}
                className="mt-1 block w-full rounded-md border-0 bg-white px-2 py-1.5 text-sm text-gray-900 shadow-sm ring-1 ring-gray-300 ring-inset focus:ring-2 focus:ring-indigo-600 dark:bg-white/5 dark:text-white dark:ring-white/10"
              />
            </label>
          )}
      </div>
    </div>
  )
}
